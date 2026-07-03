---
description: Dispatch a goal to a team VPS and drive it to completion (cleanup → start → monitor)
---

Dispatch and drive this goal to completion: $ARGUMENTS

You are the flight controller — **the orchestrator**. A Claude session on the main box (this one, or
a headless `claude -p '/goal …'`) runs the whole loop: **cleanup → start → monitor**. You build the
prompt and start the work; the worker VPS just codes (claudetm plans → parallel agents → PRs → merges).
`cnc goal` starts claudetm on the picked box; its prompt+flags specify the mission and the merge policy.

## 1. Resolve the target project
If the goal names a project (`org/repo`) use it; otherwise infer from context (`cnc projects` lists the
registry, `projects/<org>/<repo>/README.md` describes each). If genuinely ambiguous, ask.

## 2. Cleanup first
- `cnc worktrees <team> --clean` — prune stale git worktrees claudetm/parallel agents leave behind.
- (Dispatch also runs `claudetm clean -f` before `start`, so leftover task state never blocks a fresh run.)

## 3. Build the prompt & start
The prompt is for the **coding agent** — put the WORK in it, not the merge mechanics (merging is a flag,
below). Append these depth-forcing standing orders:
- "Use parallel agents (worktrees) for independent parts."
- "Run the project's verify gate before every PR; open focused PRs."
- "Do not stop at 80% — finish completely, add missing unit/integration tests, fix bugs on the way."
- "Address every review comment (CI + CodeRabbit) before a PR is done."

Then: `bin/cnc goal "<enriched goal>" --project <org/repo>`. **Default = the `claudetm merge-pr` cycle
per PR**: wait for CI, fix failures + review comments (CodeRabbit), *then* merge — i.e. auto-merge that
resolves comments first. Add `--auto-merge` only to opt into the dumb fast path (`gh` merge on CI-green,
skips review comments). `--mode print` for quick read-only jobs. Report
the team, tmux session, and watch/log commands it prints.

## 4. Monitor to completion — this is the orchestrator's job, not the worker's
- Track in the background: `cnc goals` (flight log) + `cnc status` (per-box) + tail the log.
- If it stalls or errors, diagnose from the log; `cnc stop <team>` and re-dispatch if it's wedged.
- When it finishes, **verify it truly shipped**: `cnc deploy-check <org/repo>` — merged ≠ done.

## 5. Wrap up
- **.envs are yours:** if the worker's repo needs secrets, `cnc env <team> <org/repo>` (from Bitwarden on main).
- Tidy any remaining worktrees: `cnc worktrees <team> --clean`.

Routing: every box mirrors the whole workspace, so `cnc goal` **round-robins by state/load** — idlest
ready box across the fleet, usage pre-flighted (`--team`/`--pool` override). The main box is also a
worker. Right before handoff, dispatch makes sure the stuff is there (clone if missing + deliver `.env`).
GLM boxes (`agent: glm`) run claudetm/claude against z.ai automatically.
