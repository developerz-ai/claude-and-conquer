// cnc stop <team> [<slug|session>] [--all]
//
// Kill a running goal's tmux session on a box (the mission stops immediately), mark any matching
// flight-log record `stopped`, and reset claudetm's state in that repo so the box is ready for a
// fresh dispatch (`claudetm start` refuses to run while stale state exists). With no slug and one
// goal running, stops that one; with several running, pass a slug/session or `--all`.
import { findTeam, REPO_ROOT } from "../lib/inventory.ts";
import { findProject, remotePath } from "../lib/projects.ts";
import { sshExec } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const all = argv.includes("--all");
const pos = argv.filter((a) => !a.startsWith("-"));
const teamId = pos[0];
const target = pos[1];
if (!teamId) fail("usage: cnc stop <team> [<goal-slug|session>] [--all]");
const team = findTeam(teamId);

// What cnc sessions are live on the box?
const ls = await sshExec(team, `tmux ls 2>/dev/null | sed 's/:.*//' | grep '^cnc-' || true`);
const live = ls.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
if (live.length === 0) fail(`no running goals on ${team.id}`);

let victims: string[];
if (all) {
  victims = live;
} else if (target) {
  const want = target.startsWith("cnc-") ? target : `cnc-${target}`;
  victims = live.filter((s) => s === want || s.includes(target));
  if (victims.length === 0) fail(`no session matching "${target}" on ${team.id} — live: ${live.join(", ")}`);
} else if (live.length === 1) {
  victims = live;
} else {
  fail(`several goals running on ${team.id} — pass a slug or --all:\n  ${live.join("\n  ")}`);
}

for (const s of victims) {
  const r = await sshExec(team, `tmux kill-session -t ${s} 2>&1`);
  console.log(r.code === 0 ? c.green(`✓ stopped ${s} on ${team.id}`) : c.red(`✗ ${s}: ${r.stderr || r.stdout}`));
}

// Mark matching flight-log records stopped (honest `cnc goals`) + collect their repos.
const glob = new Bun.Glob("projects/**/goals/*.yml");
let marked = 0;
const repos = new Set<string>();
for (const rel of glob.scanSync(REPO_ROOT)) {
  const file = join(REPO_ROOT, rel);
  const txt = readFileSync(file, "utf8");
  const m = txt.match(/^session:\s*(.+)$/m);
  if (m && victims.includes(m[1].trim()) && /^status:\s*(dispatched|running)/m.test(txt)) {
    writeFileSync(file, txt.replace(/^status:\s*.*$/m, "status: stopped"));
    marked++;
    const pm = txt.match(/^project:\s*(.+)$/m);
    if (pm) repos.add(pm[1].trim());
  }
}
if (marked) console.log(c.dim(`flight log: ${marked} record(s) marked stopped`));

// Reset claudetm state in each stopped goal's repo — otherwise `claudetm start` on the next
// dispatch errors "Task already exists" against the leftover .claude-task-master/ state.
for (const orgRepo of repos) {
  try {
    const path = remotePath(findProject(orgRepo), team.workspace);
    await sshExec(team, `export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"; cd ${path} 2>/dev/null && claudetm clean -f 2>/dev/null || true`);
    console.log(c.dim(`reset claudetm state in ${orgRepo}`));
  } catch { /* project not in registry — skip */ }
}
