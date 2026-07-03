// cnc new-project <org/repo> [--team t] [--pool p] [--infra org/repo] [--url u] [--desc "..."]
// Scaffolds projects/<org>/<repo>/{README.md, project.yml, goals/backlog.md}.
import { argAfter, REPO_ROOT } from "../lib/inventory.ts";
import { c, fail } from "../lib/cli.ts";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const orgRepo = argv[0];
if (!orgRepo || !orgRepo.includes("/")) fail('usage: cnc new-project <org/repo> [--team t] [--pool p] [--infra org/repo] [--url u] [--desc "..."]');
const [org, repo] = orgRepo.split("/");
const team = argAfter(argv, "--team");
const pool = argAfter(argv, "--pool") ?? org;
const infra = argAfter(argv, "--infra") ?? `${org}/infrastructure`;
const url = argAfter(argv, "--url") ?? `https://${repo}`;
const desc = argAfter(argv, "--desc") ?? "Describe the project in concise English — what it is, the stack, the rules of engagement.";
const model = argAfter(argv, "--model") ?? "claude-opus-4-8";

const dir = join(REPO_ROOT, "projects", org, repo);
if (existsSync(dir)) fail(`${dir} already exists`);
mkdirSync(join(dir, "goals"), { recursive: true });

writeFileSync(join(dir, "README.md"), `# ${repo}

${desc}

- **Stack:** _(confirm against the repo)_
- **Verify gate:** \`bun run verify\` (typecheck + lint + tests).
- **PR flow:** branch \`<type>/<slug>\`, conventional commits, one concern per PR, tests with code;
  merge each PR sequentially with \`claudetm merge-pr\` until green.
- **Deploy:** GitOps → \`${infra}\` (\`../infrastructure\` on the box). Not done until
  \`cnc deploy-check ${orgRepo}\` is green.

> Owner org: **${org}**.${team ? ` Runs on team **${team}**.` : ""} Model ${model}.
`);

writeFileSync(join(dir, "project.yml"), `github: ${orgRepo}
${team ? `team: ${team}\n` : ""}pool: ${pool}
model: ${model}
verify: bun run verify
deploy:
  method: gitops-argocd
  infra_repo: ${infra}
  stack: stacks/${repo}
  url: ${url}
  health:
    - ${url}/health
`);

writeFileSync(join(dir, "goals", "backlog.md"), `# Goal backlog — ${repo}

Run each as: \`cnc goal "<goal>" --project ${orgRepo}\` (or \`/goal <goal>\`).
Every goal implies: parallel agents, merge each PR sequentially with \`claudetm merge-pr\`,
run the verify gate before every PR, deep full work — 100% complete, ship to \`${infra}\`.

1. Finish the dashboards end to end — find bugs, refactor, 100% complete, add missing tests.
2. Find logic bugs across the app and fix them; add missing unit/integration tests.
`);

console.log(`${c.green("✓")} wrote projects/${org}/${repo}/ (README.md, project.yml, goals/backlog.md)`);
console.log(c.dim(`next: edit the README pitch + confirm the project's env_item (real Bitwarden item name), then:`));
console.log(c.dim(`  cnc projects                # confirm it loads`));
console.log(c.dim(`  cnc sync-repos --all        # clone it + deliver its .env onto every box`));
