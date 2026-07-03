// cnc goal "<text>" --project <org/repo> [--team <id>] [--mode claudetm|print]
//
// Flight-controller dispatch: route a goal to the owning team's VPS and start
// autonomous work there inside a tmux session, so it survives our disconnect.
//
// mode=claudetm (default): claudetm start "<goal>" — plans, opens PRs, and runs its merge-pr
//   cycle that resolves CI + review comments BEFORE merging each PR (no --auto-merge unless asked).
// mode=print: one-shot `claude -p` with --model fable for quick jobs that
//   don't need the PR machinery.
import { findTeam, activeTeams, argAfter } from "../lib/inventory.ts";
import { findProject, remotePath, renderMission } from "../lib/projects.ts";
import { prepareRepo } from "../lib/prepare.ts";
import { sshExec } from "../lib/ssh.ts";
import { activeBlock, BURN_LIMIT } from "../lib/usage.ts";
import { c, fail } from "../lib/cli.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../lib/inventory.ts";

const argv = process.argv.slice(2);
const goal = argv.find((a) => !a.startsWith("-"));
const projectArg = argAfter(argv, "--project");
if (!goal || !projectArg) {
  fail('usage: cnc goal "<goal text>" --project <org/repo> [--team <id>] [--mode claudetm|print]');
}

const project = findProject(projectArg);
// Default `pr`: claude -p does the work + opens ONE PR, then `claudetm merge-pr` merges it (fix CI +
// review comments). `claudetm` = the heavy multi-task planner (opt in: --mode claudetm). `print` =
// quick one-shot, no PR/merge.
const mode = argAfter(argv, "--mode") ?? "pr";
const model = argAfter(argv, "--model") ?? project.model ?? "claude-fable-5";

// Team resolution: the orchestrator picks the box. Every box mirrors the whole workspace
// (see `cnc sync-repos`), so any ready box can run any goal — we round-robin by state/load.
// Explicit `--team` overrides; `--pool` narrows the candidate set.
let team;
const explicitTeam = argAfter(argv, "--team");
if (explicitTeam) {
  team = findTeam(explicitTeam);
} else {
  const poolFilter = argAfter(argv, "--pool");
  let candidates = activeTeams().filter((t) => t.state === "ready");
  if (poolFilter) candidates = candidates.filter((t) => t.pool === poolFilter);
  if (candidates.length === 0) {
    fail(`no ready box${poolFilter ? ` in pool "${poolFilter}"` : ""} — check \`cnc status\` (a box must be state: ready)`);
  }
  // Rank by (live goals, active-block burn): the idlest, coolest-burning box wins.
  const ranked = await Promise.all(
    candidates.map(async (t) => {
      const [r, block] = await Promise.all([
        sshExec(t, `tmux ls 2>/dev/null | grep -c '^cnc-' || echo 0`, { timeoutMs: 15_000 }),
        activeBlock(t),
      ]);
      return { t, n: Number(r.stdout) || 0, burn: block?.costUSD ?? 0 };
    }),
  );
  ranked.sort((a, b) => a.n - b.n || a.burn - b.burn);
  team = ranked[0].t;
  console.log(
    c.dim(`round-robin → ${team.id} (${ranked[0].n} live goals, $${ranked[0].burn.toFixed(2)} active block)`),
  );
}

// Pre-flight: see the subscription's active 5h block BEFORE committing a
// goal — claudetm + parallel subagents can exhaust a hot Max window.
const block = await activeBlock(team);
if (block) {
  const hot = block.costUSD >= BURN_LIMIT;
  const line = `sub burn on ${team.id}: $${block.costUSD.toFixed(2)} API-equiv this block (${Math.round(block.totalTokens / 1000)}k tokens, limit $${BURN_LIMIT})`;
  console.log(hot ? c.yellow(line) : c.dim(line));
  if (hot && !argv.includes("--force")) {
    fail(
      `subscription on ${team.id} is hot — pick another team (--team), raise CNC_BURN_LIMIT, or --force`,
    );
  }
} else {
  console.log(c.dim(`sub burn on ${team.id}: unknown (ccusage unavailable) — proceeding`));
}

const stamp = new Date().toISOString().slice(0, 10);
const slug = goal
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .split("-")
  .slice(0, 5)
  .join("-");
const session = `cnc-${slug}`.slice(0, 40);
const path = remotePath(project, team.workspace);
const logFile = `~/.cnc/logs/${stamp}-${slug}.log`;

// Ship goal text + a runner script via stdin — no nested shell-quoting landmines.
// tmux executes the script directly; the script owns cd/log/tee.
const goalFile = `$HOME/.cnc/goals/${stamp}-${slug}.txt`;
const runFile = `$HOME/.cnc/run/${stamp}-${slug}.sh`;
// The worker receives the rendered mission: the project's goal-template (or the shared default)
// with the goal text + standing orders (merge-pr cycle, verify gate, ship-to-infra) baked in.
await sshExec(team, `mkdir -p ~/.cnc/goals ~/.cnc/logs ~/.cnc/run && cat > "${goalFile}"`, {
  stdin: renderMission(project, goal),
});

// Make sure the stuff is there before handing off — code cloned + .env (secrets) delivered.
// The worker can't reach Bitwarden, so we put the .env there; the agent installs deps itself.
console.log(c.dim(`preparing ${team.id}…`));
let prep;
try {
  prep = await prepareRepo(team, project);
} catch (e) {
  fail(`could not prepare ${project.org}/${project.repo} on ${team.id}: ${(e as Error).message}`);
}
console.log(
  c.dim(
    `  ${prep.cloned ? "cloned" : "present"} · env:${prep.env}${prep.env === "missing" ? ` (set env_item for ${project.org}/${project.repo})` : ""}`,
  ),
);

// GLM boxes (agent: glm) run claude/claudetm against z.ai instead of the Anthropic subscription.
const glm = (team.agent ?? "claude") === "glm";
const effModel = glm ? "opus" : model; // glm: --model opus resolves via ANTHROPIC_DEFAULT_OPUS_MODEL (glm-5.2)
const inner =
  mode === "print"
    // quick one-shot: run and emit JSON, no PR/merge
    ? `claude -p "$(cat "${goalFile}")" --model ${effModel} --fallback-model opus --dangerously-skip-permissions --output-format json`
    : mode === "claudetm"
      // opt-in heavy planner: claudetm plans → parallel agents → PRs → merges (single repo).
      // clean -f first clears stale state so `start` never errors "Task already exists".
      ? `claudetm clean -f >/dev/null 2>&1 || true; claudetm start "$(cat "${goalFile}")" ${argv.includes("--auto-merge") ? "--auto-merge" : "--no-auto-merge"} --verify`
      // DEFAULT `pr`: claude -p is the AI developer — does the work (across repos if needed; every
      // repo is mirrored under ~/workspace), opens focused PR(s), and merges each with
      // `claudetm merge-pr` (fix CI + review comments) per the mission template. stream-json flushes
      // each event live to the log (raw -p buffers until done), so monitoring can see progress.
      : `claude -p "$(cat "${goalFile}")" --model ${effModel} --fallback-model opus --dangerously-skip-permissions --verbose --output-format stream-json`;

const runner = [
  `#!/usr/bin/env bash`,
  `# generated by cnc goal — ${stamp} ${slug}`,
  `source ~/.profile 2>/dev/null || true`,
  `export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"`,
  ...(glm
    ? [
        `source ~/.cnc/agents.env 2>/dev/null || true`,
        // ANTHROPIC_API_KEY routes the Claude Agent SDK (claudetm's engine) to z.ai; without it
        // the SDK falls back to ~/.claude/.credentials.json and burns the Anthropic sub instead.
        // AUTH_TOKEN covers the plain `claude` CLI. claudetm still preflights a valid creds file.
        `export ANTHROPIC_API_KEY="$ZAI_API_KEY" ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY" ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic" ANTHROPIC_DEFAULT_OPUS_MODEL="glm-5.2[1m]" ANTHROPIC_DEFAULT_SONNET_MODEL="glm-4.7" ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"`,
      ]
    : []),
  `cd ${path}`,
  `${inner} 2>&1 | tee -a ${logFile}`,
].join("\n");
await sshExec(team, `cat > "${runFile}" && chmod +x "${runFile}"`, { stdin: runner });

const r = await sshExec(
  team,
  `cd ${path} && tmux new-session -d -s ${session} "${runFile}"`,
  { timeoutMs: 30_000 },
);
if (r.code !== 0) fail(`dispatch failed on ${team.id}: ${r.stderr || r.stdout}`);

// Record the sortie locally so `cnc goals` can track it.
const goalDir = join(REPO_ROOT, project.dir, "goals");
mkdirSync(goalDir, { recursive: true });
writeFileSync(
  join(goalDir, `${stamp}-${slug}.yml`),
  [
    `goal: ${JSON.stringify(goal)}`,
    `project: ${project.org}/${project.repo}`,
    `team: ${team.id}`,
    `mode: ${mode}`,
    `model: ${glm ? "glm-5.2" : model}`,
    `agent: ${team.agent ?? "claude"}`,
    `session: ${session}`,
    `log: ${logFile}`,
    `dispatched_at: ${new Date().toISOString()}`,
    `status: dispatched`,
  ].join("\n") + "\n",
);

console.log(c.green(`✈ goal dispatched to ${c.bold(team.id)} (${project.org}/${project.repo})`));
console.log(`  session: ${session}`);
console.log(`  watch:   cnc ssh ${team.id} -- tmux attach -t ${session}`);
console.log(`  log:     cnc ssh ${team.id} -- tail -f ${logFile}`);
console.log(`  status:  cnc goals`);
