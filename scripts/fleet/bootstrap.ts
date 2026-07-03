// cnc bootstrap <team> — set up a fresh VPS: tools, workspace, repo clones.
// Everything is automated EXCEPT auth: the human must run
//   cnc ssh <team> --login     (Claude subscription /login)
//   cnc ssh <team> -- gh auth login   (GitHub, if repos are private)
import { findTeam, REPO_ROOT } from "../lib/inventory.ts";
import { loadProjects, remotePath } from "../lib/projects.ts";
import { sshExec } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const id = process.argv[2];
if (!id) fail("usage: cnc bootstrap <team>");
const team = findTeam(id);

const steps: Array<[string, string]> = [
  [
    "base packages (tmux, git, curl, unzip)",
    `command -v tmux >/dev/null && command -v git >/dev/null || sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmux git curl unzip`,
  ],
  ["gh cli", `command -v gh >/dev/null || (sudo mkdir -p -m 755 /etc/apt/keyrings && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null && sudo apt-get update -qq && sudo apt-get install -y -qq gh)`],
  ["bun", `command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash`],
  ["claude code", `command -v claude >/dev/null || curl -fsSL https://claude.ai/install.sh | bash`],
  ["uv", `command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh`],
  ["claudetm", `command -v claudetm >/dev/null || ~/.local/bin/uv tool install claude-task-master`],
  [
    "chromium (playwright, for browser tests)",
    `export PATH="$HOME/.bun/bin:$PATH"; ls -d ~/.cache/ms-playwright/chromium-* >/dev/null 2>&1 || bunx --yes playwright install --with-deps chromium`,
  ],
  [
    "workspace + cnc dirs",
    `mkdir -p ${team.workspace ?? "~/workspace"} ~/.cnc/goals ~/.cnc/logs ~/.cnc/run ~/.cnc/bin`,
  ],
];

console.log(c.bold(`bootstrapping ${team.id} (${team.ssh_user}@${team.host})`));
for (const [name, cmd] of steps) {
  const r = await sshExec(team, cmd, { timeoutMs: 300_000 });
  console.log(`${r.code === 0 ? c.green("✓") : c.red("✗")} ${name}`);
  if (r.code !== 0) console.log(c.dim(`  ${(r.stderr || r.stdout).slice(0, 200)}`));
}

// Coding-agent aliases (cclaude = Anthropic Max, cclaudez = z.ai GLM, …) — pushed from the repo,
// secret-free. Add more agents (codex, etc.) by editing fleet/box/agents.sh; agent creds live on
// the box in ~/.cnc/agents.env (600), never in the repo.
{
  const agents = readFileSync(join(REPO_ROOT, "fleet", "box", "agents.sh"), "utf8");
  const r = await sshExec(
    team,
    `mkdir -p ~/.cnc && cat > ~/.cnc/agents.sh; grep -q 'cnc/agents.sh' ~/.bashrc || echo '[ -f ~/.cnc/agents.sh ] && . ~/.cnc/agents.sh' >> ~/.bashrc`,
    { stdin: agents },
  );
  console.log(`${r.code === 0 ? c.green("✓") : c.red("✗")} coding-agent aliases (cclaude, cclaudez)`);
}

// Clone this team's repos (best effort — private repos need gh auth first).
const repos = team.repos ?? [];
for (const orgRepo of repos) {
  const p = loadProjects().find((x) => `${x.org}/${x.repo}` === orgRepo);
  const dest = p ? remotePath(p, team.workspace) : `${team.workspace ?? "~/workspace"}/${orgRepo}`;
  const gh = p?.github ?? orgRepo;
  const r = await sshExec(
    team,
    `[ -d ${dest}/.git ] || (mkdir -p $(dirname ${dest}) && gh repo clone ${gh} ${dest} 2>/dev/null || git clone git@github.com:${gh}.git ${dest})`,
    { timeoutMs: 300_000 },
  );
  console.log(`${r.code === 0 ? c.green("✓") : c.yellow("…")} repo ${orgRepo}${r.code !== 0 ? c.dim("  (clone after gh auth: cnc ssh " + team.id + " -- gh auth login)") : ""}`);
}

console.log(c.bold("\nhuman steps remaining (auth cannot be automated):"));
console.log(`  cnc ssh ${team.id} --login              # Claude subscription /login as ${team.claude?.email}`);
console.log(`  cnc ssh ${team.id} -- gh auth login     # GitHub (for private repos / PRs)`);
console.log(`\nthen verify: cnc status ${team.id} && cnc accounts ${team.id}`);
