// cnc env <team> <org/repo> [--item "<name>"]      -> write ~/workspace/<org>/<repo>/.env (600)
// cnc env <team> <org> --bashrc --item "<name>"     -> install org keys into ~/.cnc/env.sh, sourced
//                                                      from ~/.bashrc (keys present in every shell)
//
// Bitwarden lives on the MAIN box; this pulls the vault item's notes here (via `cnc bw`) and pushes
// the resulting env onto the worker. Nothing secret touches the repo. Item defaults to ".env <repo>".
import { findTeam, argAfter, REPO_ROOT } from "../lib/inventory.ts";
import { sshExec } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";
import { join } from "node:path";

const argv = process.argv.slice(2);
const teamId = argv[0];
const target = argv[1];
const bashrc = argv.includes("--bashrc");
if (!teamId || !target || target.startsWith("-")) {
  fail('usage: cnc env <team> <org/repo> [--item "<name>"]   |   cnc env <team> <org> --bashrc --item "<name>"');
}
const team = findTeam(teamId);
const org = bashrc ? target : target.split("/")[0];
const repo = bashrc ? null : target.split("/")[1];
if (!bashrc && !repo) fail("expected <org/repo> (or use --bashrc with just <org>)");
const item = argAfter(argv, "--item") ?? (repo ? `.env ${repo}` : null);
if (!item) fail(`--item "<vault item name>" is required in --bashrc mode — list: cnc bw ${org} -- list items`);

// Pull the item's notes from the org vault on the MAIN box.
const got = Bun.spawnSync([join(REPO_ROOT, "bin", "cnc"), "bw", org, "--", "get", "notes", item], { stdout: "pipe", stderr: "pipe" });
const content = new TextDecoder().decode(got.stdout).trim();
if (got.exitCode !== 0 || !content) fail(`vault item "${item}" not found in ${org} — list: cnc bw ${org} -- list items`);
const lines = content.split("\n").length;
const base = team.workspace ?? "~/workspace";

if (bashrc) {
  const r = await sshExec(
    team,
    `mkdir -p ~/.cnc && umask 077 && cat > ~/.cnc/env.sh; grep -q 'cnc/env.sh' ~/.bashrc || echo '[ -f ~/.cnc/env.sh ] && . ~/.cnc/env.sh' >> ~/.bashrc`,
    { stdin: content + "\n" },
  );
  console.log(r.code === 0
    ? c.green(`✓ ${team.id}: ~/.cnc/env.sh installed + sourced from ~/.bashrc (${lines} lines from "${item}")`)
    : c.red(`✗ ${team.id}: ${r.stderr || r.stdout}`));
} else {
  const dest = `${base}/${org}/${repo}/.env`;
  const r = await sshExec(team, `mkdir -p ${base}/${org}/${repo} && umask 077 && cat > ${dest}`, { stdin: content + "\n" });
  console.log(r.code === 0
    ? c.green(`✓ ${team.id}: ${dest} (${lines} lines from "${item}")`)
    : c.red(`✗ ${team.id}: ${r.stderr || r.stdout}`));
}
