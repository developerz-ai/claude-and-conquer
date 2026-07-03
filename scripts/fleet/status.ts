// cnc status [selector] — fleet health: reachability, claude auth, disk, active goals.
import { selectTeams } from "../lib/inventory.ts";
import { sshExec, mapTeams } from "../lib/ssh.ts";
import { table, c } from "../lib/cli.ts";

const teams = selectTeams(process.argv.slice(2));

const rows = await mapTeams(teams, async (t) => {
  const r = await sshExec(
    t,
    [
      `echo "::v $(claude --version 2>/dev/null || echo missing)"`,
      `echo "::auth $(claude auth status 2>/dev/null | tr -d '\\n' || echo '{}')"`,
      `echo "::disk $(df -h --output=pcent / | tail -1 | tr -d ' ')"`,
      `echo "::goals $(tmux ls 2>/dev/null | grep -c '^cnc-' || true)"`,
    ].join(" && "),
    { timeoutMs: 20_000 },
  );
  if (r.code !== 0) {
    return [t.id, c.red("unreachable"), "-", "-", "-", c.dim(r.stderr.slice(0, 60))];
  }
  const get = (k: string) =>
    r.stdout.split("\n").find((l) => l.startsWith(`::${k} `))?.slice(k.length + 3) ?? "";
  let auth = c.red("logged out");
  try {
    const a = JSON.parse(get("auth"));
    if (a.loggedIn) {
      auth =
        a.email === t.claude?.email
          ? c.green(a.email)
          : c.yellow(`${a.email} (want ${t.claude?.email})`);
    }
  } catch {}
  const version = get("v").split(" ")[0] || "?";
  return [t.id, c.green("up"), version, auth, get("disk"), get("goals")];
});

table(["TEAM", "STATE", "CLAUDE", "ACCOUNT", "DISK", "GOALS"], rows);
