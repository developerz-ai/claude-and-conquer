// cnc worktrees <selector> [--clean] — keep the boxes tidy.
// claudetm + parallel agents leave git worktrees behind; the orchestrator prunes them.
//   default : `git worktree prune` every repo + list what linked worktrees remain
//   --clean : also `git worktree remove` linked worktrees that are clean (no uncommitted changes);
//             dirty ones are kept and flagged.
import { selectTeams } from "../lib/inventory.ts";
import { sshExec, mapTeams } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";

const argv = process.argv.slice(2);
const clean = argv.includes("--clean");
const sel = argv.filter((a) => a !== "--clean");
if (sel.length === 0 && !argv.includes("--all")) fail("usage: cnc worktrees [--all | --pool <p> | <team>...] [--clean]");
const teams = selectTeams([...sel, ...(argv.includes("--all") ? ["--all"] : [])]);

const script = `
CLEAN=${clean ? "yes" : "no"}
for gd in ~/workspace/*/*/.git; do repo=$(dirname "$gd"); git -C "$repo" worktree prune 2>/dev/null || true; done
if [ "$CLEAN" = yes ]; then
  for gd in ~/workspace/*/*/.git; do
    repo=$(dirname "$gd")
    git -C "$repo" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' | tail -n +2 | while read -r wt; do
      [ -d "$wt" ] || continue
      if [ -z "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
        git -C "$repo" worktree remove --force "$wt" 2>/dev/null && echo "removed: $wt"
      else
        echo "kept (dirty): $wt"
      fi
    done
  done
fi
echo "-- linked worktrees remaining --"
any=0
for gd in ~/workspace/*/*/.git; do
  repo=$(dirname "$gd"); n=$(git -C "$repo" worktree list 2>/dev/null | tail -n +2 | wc -l)
  if [ "$n" -gt 0 ]; then echo "  $(basename "$(dirname "$repo")")/$(basename "$repo"): $n"; any=1; fi
done
[ "$any" = 0 ] && echo "  (none)"; true
`;

await mapTeams(teams, async (t) => {
  const r = await sshExec(t, script, { timeoutMs: 120_000 });
  console.log(`${c.bold(`== ${t.id}`)}${clean ? c.dim(" (clean)") : ""}\n${(r.stdout || r.stderr).replace(/^/gm, "  ")}`);
});
