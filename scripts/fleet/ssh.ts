// cnc ssh <team> [--login] [-- <command>] — operator convenience.
// --login: interactive session for the human to authenticate the Claude
// subscription on that box (OAuth cannot be automated — a human must do this).
import { findTeam, loadTeams } from "../lib/inventory.ts";
import { sshInteractive } from "../lib/ssh.ts";
import { c, table } from "../lib/cli.ts";

const argv = process.argv.slice(2);
const id = argv.find((a) => !a.startsWith("-"));

if (!id) {
  console.log("usage: cnc ssh <team> [--login] [-- <command>]\n");
  table(
    ["TEAM", "TARGET", "ACCOUNT"],
    loadTeams().map((t) => [t.id, `${t.ssh_user}@${t.host}`, t.claude?.email ?? "?"]),
  );
  process.exit(1);
}

const team = findTeam(id);

if (argv.includes("--login")) {
  console.log(c.bold(`Logging in Claude on ${team.id} as ${team.claude?.email}`));
  console.log(`1. A browser-less OAuth flow will start — follow the URL it prints.`);
  console.log(`2. Use account: ${c.bold(team.claude?.email ?? "?")}`);
  console.log(`3. Verify afterwards with: cnc accounts ${team.id}\n`);
  sshInteractive(team, "claude auth login || claude /login");
}

const sep = argv.indexOf("--");
sshInteractive(team, sep >= 0 ? argv.slice(sep + 1).join(" ") : undefined);
