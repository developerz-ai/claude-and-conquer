---
name: missions
description: Dispatch and track goals across the fleet — use when asked to send work to a team, check goal progress, or verify a deploy.
---

# Missions (goals)

A goal = one autonomous work order for one team VPS. Dispatched via tmux + `claude -p` (the default `pr` flow), so it survives disconnects.

| want | run |
|---|---|
| dispatch deep work | `bin/cnc goal "<goal>" --project <org/repo>` |
| parallel planner (opt-in, one repo) | `... --mode claudetm` (parallel agents in worktrees; auto-merge off unless explicitly requested) |
| quick one-shot (no PRs) | `... --mode print` (runs `claude -p` (opus 4.8)) |
| flight log | `bin/cnc goals` |
| verify it shipped | `bin/cnc deploy-check <org/repo>` |
| watch live | `bin/cnc ssh <team> -- tmux attach -t <session>` |
| consult the code | read `~/workspace/<org>/<repo>` on the main box — the same clone the team edits |
| pull a secret while orchestrating | `bin/cnc bw <org> -- get notes "<item>"` — Bitwarden is main-box-only |

Lifecycle: dispatch → the `claude -p` developer does the work → PRs → `claudetm merge-pr` sequentially until green → GitOps deploy → `deploy-check` confirms health. `--mode claudetm` (opt-in) swaps in the parallel planner instead — parallel agents in worktrees, auto-merge off unless explicitly requested.

Rules:
- Always dispatch through `cnc goal` (never raw ssh) — it records the sortie in `projects/<org>/<repo>/goals/`, which is our only flight log.
- **Box selection = free + cool.** With no `--team`/pin, dispatch ranks the project's pool by (live goals, active-block burn) and picks the **idlest, coolest-burn ready team**. Pin with `--team <id>` to override.
- Dispatch pre-flights the subscription's active 5h block on the chosen box via `ccusage` (claudetm + subagents burn fast). Hot sub (≥ $CNC_BURN_LIMIT, default 50 API-equiv USD) → it refuses: pick another team, wait for the window, or `--force` deliberately.
- **Consult locally.** To reason about a project's real code before/while dispatching, read `~/workspace/<org>/<repo>` on the main box — it's the identical clone. Dispatch at scale, stay code-aware.
- Goals must demand completeness: parallel agents, sequential PR merges, tests included, 100% done. The `/goal` command enriches text automatically — prefer it.
- Per-project backlogs live at `projects/<org>/<repo>/goals/backlog.md`; work them top-down, one dispatch per line.
- A mission is not finished until `deploy-check` is green. Report merged-but-not-deployed as **not done**.
