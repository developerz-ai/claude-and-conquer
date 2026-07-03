// cnc accounts [selector] — Claude subscription status per team.
// The human operator must OAuth-login each account by hand: `cnc ssh <team> --login`.
import { selectTeams } from "../lib/inventory.ts";
import { sshExec, mapTeams } from "../lib/ssh.ts";
import { table, c } from "../lib/cli.ts";

const teams = selectTeams(process.argv.slice(2));

const rows = await mapTeams(teams, async (t) => {
  const r = await sshExec(t, "claude auth status 2>/dev/null", { timeoutMs: 20_000 });
  const expected = t.claude?.email ?? "?";
  if (r.code !== 0 && !r.stdout) {
    return [t.id, expected, c.red("unreachable"), "-", c.dim("cnc ssh " + t.id)];
  }
  try {
    const a = JSON.parse(r.stdout);
    if (!a.loggedIn) throw new Error("logged out");
    const match = a.email === expected;
    return [
      t.id,
      expected,
      match ? c.green(a.email) : c.yellow(a.email),
      a.subscriptionType ?? "?",
      match ? c.green("ok") : c.yellow("email mismatch"),
    ];
  } catch {
    return [
      t.id,
      expected,
      c.red("logged out"),
      "-",
      c.yellow(`run: cnc ssh ${t.id} --login`),
    ];
  }
});

table(["TEAM", "EXPECTED", "LOGGED IN AS", "PLAN", "ACTION"], rows);
