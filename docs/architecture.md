# Architecture

## The loop

1. **Order** — operator (or their Claude) issues `/goal <text>` in the commander session.
2. **Enrich** — `/goal` appends standing orders: parallel agents, sequential `claudetm merge-pr`, verify gate, 100% completion.
3. **Route** — `cnc goal` resolves the project (`projects/<org>/<repo>/project.yml`), then the team: `--team` flag > `project.yml team:` > fleet `repos:` assignment > best ready team in the project's pool (fewest live goals, then coolest subscription). Before committing, dispatch **pre-flights the sub's active 5h block** on the box (ccusage) — a goal means a coding agent plus parallel subagents, so a hot window (≥ `CNC_BURN_LIMIT`, default $50 API-equiv) refuses dispatch without `--force`.
4. **Dispatch** — goal text ships via ssh stdin to `~/.cnc/goals/` on the box (no quoting bugs), then a detached tmux session `cnc-<slug>` runs the default `pr` flow — `claude -p "<mission>" --model <model> --fallback-model opus --dangerously-skip-permissions --verbose --output-format stream-json` — inside `~/workspace/<org>/<repo>`, logging to `~/.cnc/logs/`. The sortie is recorded in `projects/<org>/<repo>/goals/<date>-<slug>.yml`.
5. **Work** — the `claude -p` developer does the work, opens focused PRs, and drives each through `claudetm merge-pr`: wait CI → fix failures → address review comments → resolve conflicts → merge. Sequential, so PRs never trample each other. Only `--mode claudetm` (opt-in) fans out parallel agents in worktrees.
6. **Ship** — merge to main triggers the project's GitOps pipeline (e.g. CI build → registry → ArgoCD rollout).
7. **Confirm** — `cnc deploy-check <org/repo>` hits `deploy.health` URLs. Green = mission complete. This is the flight-controller step: merged-but-not-deployed is NOT done.

## Why tmux on the box (not ssh-streamed)

- Survives commander disconnects; attachable by any operator (`cnc ssh <team> -- tmux attach -t cnc-<slug>`).
- The box's agent owns the hard part (the work, the PR merge cycle via `claudetm merge-pr`, budgets, webhooks) — the commander only routes and records.

## Modes

`cnc goal --mode <mode>` picks the flow. `pr` is the default.

| mode | runs | for |
|---|---|---|
| `pr` (**default**) | `claude -p "<mission>" --model <model> --fallback-model opus --dangerously-skip-permissions --verbose --output-format stream-json` | most work — features, refactors, anything producing PRs; one AI developer, merging each PR with `claudetm merge-pr` |
| `claudetm` (opt-in) | `claudetm start "<mission>" --no-auto-merge --verify` | wide PR-farming on one repo with the parallel planner — only when explicitly requested; automatic merging is off by default (`--no-auto-merge`), `--auto-merge` only when explicitly asked |
| `print` | `claude -p "<mission>" --model <model> --fallback-model opus --dangerously-skip-permissions --output-format json` | quick analysis/reports, no PR machinery |

## Capacity model

Teams belong to **pools** (`fleet: pool:`). Projects pin a team or draw from a pool; auto-assignment picks the ready team with the fewest live `cnc-*` tmux sessions. Adding capacity = adding a yml file. Subscription burn is visible per team via `cnc usage` (ccusage API-equivalent cost) — that's the "how hard is the pool working" gauge.

## Trust & secrets

- Commander → team: plain ssh (BatchMode for scripts, `-t` interactive for humans).
- Teams hold their own credentials (gh auth, Linear keys, .env) — the commander repo stores none of them.
- Claude subscription OAuth is done by a human per box: `cnc ssh <team> --login`.
