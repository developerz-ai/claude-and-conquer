// cnc sync-repos [selector] [--deps] [--no-env]
//
// Mirror the project registry onto boxes: for every selected team × every project, make sure the
// code is cloned and the .env (secrets) is delivered. This is how "add a repo → it's on all boxes"
// works — run it after `cnc new-project` (or any time) and every box has the stuff, ready for an agent.
//
//   default selector: all ready teams   default: clone + secrets (the agent installs deps itself)
//   --deps:   also run each project's `setup` (bun install …) to pre-build the boxes
//   --no-env: skip .env delivery from Bitwarden (e.g. offline, or creds not set on main)
import { selectTeams } from "../lib/inventory.ts";
import { loadProjects } from "../lib/projects.ts";
import { prepareRepo } from "../lib/prepare.ts";
import { c, fail } from "../lib/cli.ts";

const argv = process.argv.slice(2);
const installDeps = argv.includes("--deps");
const deliverEnv = !argv.includes("--no-env");
const sel = argv.filter((a) => !a.startsWith("--") || a === "--all" || a === "--pool" || a === "--tag");
const teams = selectTeams(sel).filter((t) => t.state !== "retired");
if (teams.length === 0) fail("no teams matched the selector");
const projects = loadProjects();
if (projects.length === 0) fail("no projects in the registry");

console.log(
  c.bold(`syncing ${projects.length} repos onto ${teams.length} box(es)`) +
    c.dim(`  (deps: ${installDeps ? "on" : "off"}, secrets: ${deliverEnv ? "on" : "off"})`),
);

for (const t of teams) {
  console.log(c.bold(`\n══ ${t.id} (${t.ssh_user}@${t.host}) ══`));
  for (const p of projects) {
    process.stdout.write(c.dim(`  ${p.org}/${p.repo} … `));
    try {
      const r = await prepareRepo(t, p, { installDeps, deliverEnv });
      const bits = [
        r.cloned ? c.green("cloned") : c.dim("present"),
        installDeps ? (r.deps === "ok" ? c.green("deps✓") : c.yellow(`deps:${r.deps}`)) : "",
        deliverEnv ? (r.env === "ok" ? c.green("env✓") : c.yellow("env:missing")) : "",
      ].filter(Boolean);
      console.log(bits.join(" "));
    } catch (e) {
      console.log(c.red(`FAILED — ${(e as Error).message}`));
    }
  }
}
console.log(c.dim("\nboxes now mirror the registry. env:missing → set the project's env_item to the real vault item name."));
