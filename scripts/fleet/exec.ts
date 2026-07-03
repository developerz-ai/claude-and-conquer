// cnc exec <selector> -- <command> — run a shell command across the fleet.
import { selectTeams } from "../lib/inventory.ts";
import { sshExec, mapTeams } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 0 || sep === argv.length - 1) {
  fail('usage: cnc exec [--all | --pool <p> | <team>...] -- <command>');
}
const command = argv.slice(sep + 1).join(" ");
const teams = selectTeams(argv.slice(0, sep));

await mapTeams(teams, async (t) => {
  const r = await sshExec(t, command, { timeoutMs: 300_000 });
  const head = r.code === 0 ? c.green(`== ${t.id}`) : c.red(`== ${t.id} (exit ${r.code})`);
  console.log(`${head}\n${r.stdout}${r.stderr ? "\n" + c.dim(r.stderr) : ""}`);
});
