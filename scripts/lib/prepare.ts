// prepareRepo — Claude and Conquer's job is to make sure the *stuff is there*: the code and
// the secrets. Everything else (deps, build, migrations) the agent does itself while working.
//   1. clone   — git clone if the repo isn't there yet                    (always)
//   2. secrets — deliver the repo's .env from Bitwarden via `cnc env`     (default on: the worker
//                CAN'T reach Bitwarden — that lives on main — so only we can put the .env there)
//   3. deps    — run the project's `setup` (e.g. `bun install`)           (OFF by default; the
//                agent runs it as part of `verify`. Opt in to pre-build boxes: sync-repos --deps)
//
// Used by `cnc sync-repos` (fleet-wide, proactive) and `cnc goal` (safety net right before dispatch).
import type { Team } from "./inventory.ts";
import { REPO_ROOT } from "./inventory.ts";
import { type Project, remotePath } from "./projects.ts";
import { sshExec } from "./ssh.ts";
import { join } from "node:path";

export interface PrepareResult {
  path: string;
  cloned: boolean;
  deps: "ok" | "fail" | "skip";
  env: "ok" | "missing" | "skip";
}

export async function prepareRepo(
  team: Team,
  project: Project,
  opts: { installDeps?: boolean; deliverEnv?: boolean } = {},
): Promise<PrepareResult> {
  const { installDeps = false, deliverEnv = true } = opts;
  const path = remotePath(project, team.workspace);
  const cloneUrl = `git@github.com:${project.github}.git`;

  // 1. clone (idempotent — a marker tells us whether it was fresh)
  const c = await sshExec(
    team,
    `git -C ${path} rev-parse --git-dir >/dev/null 2>&1 || { echo __CLONED__ && git clone ${cloneUrl} ${path}; }`,
    { timeoutMs: 300_000 },
  );
  if (c.code !== 0) throw new Error(`clone ${project.github} on ${team.id} failed: ${c.stderr || c.stdout}`);
  const cloned = c.stdout.includes("__CLONED__");

  // 1b. trust the checkout for `claude -p`. Headless claude refuses to run tools in an untrusted
  // workspace (it hangs on the trust gate — --dangerously-skip-permissions doesn't cover it), so we
  // set hasTrustDialogAccepted for the repo path in ~/.claude.json on the box. Idempotent.
  const trustPy = [
    "import json,os,sys",
    'p=os.path.expanduser("~/.claude.json")',
    "try: j=json.load(open(p))",
    "except Exception: j={}",
    'j.setdefault("projects",{}).setdefault(sys.argv[1],{})["hasTrustDialogAccepted"]=True',
    'json.dump(j,open(p,"w"),indent=2)',
  ].join("\n");
  await sshExec(team, `abs=$(cd ${path} && pwd) && python3 - "$abs"`, { stdin: trustPy });

  // 2. deps — install into the checkout so `verify` can run
  let deps: PrepareResult["deps"] = "skip";
  if (installDeps) {
    const setup = project.setup ?? `[ -f package.json ] && bun install || echo "no package.json — skip deps"`;
    const d = await sshExec(
      team,
      `cd ${path} && export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH" && ${setup}`,
      { timeoutMs: 900_000 },
    );
    deps = d.code === 0 ? "ok" : "fail";
  }

  // 3. secrets — pull the repo's .env from the org vault on main and push it to the box.
  // Best-effort: a missing vault item must not block the whole sync (warn, keep going).
  let env: PrepareResult["env"] = "skip";
  if (deliverEnv) {
    const args = [join(REPO_ROOT, "bin", "cnc"), "env", team.id, `${project.org}/${project.repo}`];
    if (project.env_item) args.push("--item", project.env_item);
    const e = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
    env = e.exitCode === 0 ? "ok" : "missing";
  }

  return { path, cloned, deps, env };
}
