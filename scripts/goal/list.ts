// cnc goals — every dispatched goal across projects, with live tmux state.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, findTeam } from "../lib/inventory.ts";
import { loadProjects } from "../lib/projects.ts";
import { sshExec } from "../lib/ssh.ts";
import { table, c } from "../lib/cli.ts";

interface Sortie {
  goal: string;
  project: string;
  team: string;
  session: string;
  dispatched_at: string;
  status: string;
  file: string;
}

const sorties: Sortie[] = [];
for (const p of loadProjects()) {
  const dir = join(REPO_ROOT, p.dir, "goals");
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".yml"))) {
    const raw = Bun.YAML.parse(readFileSync(join(dir, f), "utf8")) as Sortie;
    sorties.push({ ...raw, file: join(p.dir, "goals", f) });
  }
}

// One ssh per involved team to see which cnc- sessions are still alive.
const liveByTeam = new Map<string, Set<string>>();
await Promise.all(
  [...new Set(sorties.map((s) => s.team))].map(async (id) => {
    try {
      const r = await sshExec(findTeam(id), `tmux ls -F '#S' 2>/dev/null || true`, {
        timeoutMs: 15_000,
      });
      liveByTeam.set(id, new Set(r.stdout.split("\n").filter(Boolean)));
    } catch {
      liveByTeam.set(id, new Set());
    }
  }),
);

table(
  ["WHEN", "PROJECT", "TEAM", "GOAL", "STATE"],
  sorties
    .sort((a, b) => (a.dispatched_at < b.dispatched_at ? 1 : -1))
    .map((s) => {
      const live = liveByTeam.get(s.team)?.has(s.session);
      return [
        s.dispatched_at?.slice(0, 16).replace("T", " ") ?? "?",
        s.project,
        s.team,
        s.goal.length > 60 ? s.goal.slice(0, 57) + "..." : s.goal,
        live ? c.green("running") : c.dim("finished/gone"),
      ];
    }),
);
if (sorties.length === 0) console.log(c.dim("no goals dispatched yet — cnc goal \"...\" --project org/repo"));
