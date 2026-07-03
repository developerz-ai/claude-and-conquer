// cnc logs <team> [<slug>] [-f|--follow] [-n <lines>]
//
// Show a goal's run log on a box — the latest by default, or the newest whose name matches <slug>.
// -f/--follow streams it live (tail -f). Complements `cnc ssh <team>` (shell) and the watch/log
// lines `cnc goal` prints. Logs live at ~/.cnc/logs/<date>-<slug>.log on each box.
import { findTeam, argAfter } from "../lib/inventory.ts";
import { sshExec, sshInteractive, shq } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";

const argv = process.argv.slice(2);
const follow = argv.includes("-f") || argv.includes("--follow");
const n = argAfter(argv, "-n") ?? "200";
const pos = argv.filter((a) => !a.startsWith("-") && a !== n);
const teamId = pos[0];
const slug = pos[1];
if (!teamId) fail("usage: cnc logs <team> [<slug>] [-f|--follow] [-n <lines>]");
const team = findTeam(teamId);

const pick = `f=$(ls -t ~/.cnc/logs/*.log 2>/dev/null${slug ? ` | grep -- ${shq(slug)}` : ""} | head -1)`;
const guard = `if [ -z "$f" ]; then echo "no goal logs on ${team.id}${slug ? ` matching '${slug}'` : ""}"; exit 1; fi`;

if (follow) {
  // stream live — Ctrl-C to stop
  await sshInteractive(team, `${pick}; ${guard}; echo "== $f =="; tail -f "$f"`);
} else {
  const r = await sshExec(team, `${pick}; ${guard}; echo "== $f =="; tail -n ${n} "$f"`);
  process.stdout.write(r.stdout || c.red(r.stderr) || "");
}
