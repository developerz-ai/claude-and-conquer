// cnc usage [selector] — token/cost usage per team via ccusage (reads ~/.claude JSONL on the box).
import { selectTeams } from "../lib/inventory.ts";
import { sshExec, mapTeams } from "../lib/ssh.ts";
import { table, c } from "../lib/cli.ts";

const argv = process.argv.slice(2);
const days = Number(
  argv.includes("--days") ? argv[argv.indexOf("--days") + 1] : 7,
);
const since = new Date(Date.now() - days * 86_400_000)
  .toISOString()
  .slice(0, 10)
  .replaceAll("-", "");

const teams = selectTeams(argv.filter((a) => a !== "--days" && !/^\d+$/.test(a)));

const rows = await mapTeams(teams, async (t) => {
  const r = await sshExec(t, `bunx ccusage@latest daily --json --since ${since}`, {
    timeoutMs: 120_000,
  });
  if (r.code !== 0) return [t.id, c.red("error"), "-", "-", c.dim(r.stderr.slice(0, 50))];
  try {
    const data = JSON.parse(r.stdout);
    const totals = data.totals ?? {};
    const fmt = (n: number) =>
      n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`;
    return [
      t.id,
      fmt(totals.inputTokens ?? 0),
      fmt(totals.outputTokens ?? 0),
      `$${(totals.totalCost ?? 0).toFixed(2)}`,
      c.dim(`${days}d`),
    ];
  } catch {
    return [t.id, c.yellow("no data"), "-", "-", "-"];
  }
});

table(["TEAM", "INPUT", "OUTPUT", "COST(API-equiv)", "WINDOW"], rows);
console.log(
  c.dim(
    "\ncost is the API-equivalent value of subscription usage (ccusage). Great for seeing how hard each sub is being pooled.",
  ),
);
