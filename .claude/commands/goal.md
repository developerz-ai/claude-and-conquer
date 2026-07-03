---
description: Dispatch a goal to a team VPS and drive it to completion (cleanup → start → monitor)
---

Dispatch and drive this goal to completion: $ARGUMENTS

You are the flight controller — **the orchestrator**. A Claude session on the main box (this one, or a
headless `claude -p '/goal …'`) runs the whole loop: **cleanup → start → monitor**. You pick the box,
build the mission, start the work, and watch it ship.

**Two flows — pick by how the operator phrases it:**
- *"let's do this work on org/repo …"* → **default (`pr`)**: dispatch a `claude -p` **AI developer** that
  does the work (across repos if needed — all are mirrored under `~/workspace`), opens focused PR(s), and
  merges each with `claudetm merge-pr` (fix CI + review comments). This is the everyday flow — often the
  best-quality one, and the only one that spans multiple repos. → `cnc goal "<work>" --project org/repo`
- *"let's use claudetm on org/repo …"* → **`--mode claudetm`**: the heavy `claudetm start` planner
  (plans → parallel agents → many PRs → merges, single repo). → `cnc goal "<work>" --project org/repo --mode claudetm`

## 1. Resolve the target project
If the goal names a project (`org/repo`) use it; otherwise infer from context (`cnc projects` lists the
registry, `projects/<org>/<repo>/README.md` describes each). If genuinely ambiguous, ask.

## 2. Cleanup first
- `cnc worktrees <team> --clean` — prune stale git worktrees claudetm/parallel agents leave behind.
- (Dispatch also runs `claudetm clean -f` before `start`, so leftover task state never blocks a fresh run.)

## 3. Build the prompt & start
Write the goal as just the **WORK** to do — you don't re-type the standing orders. `cnc goal` renders
the project's `goal-template.md` (or the shared `projects/_goal-template.md`) around your text, which
bakes in the standing orders: depth/100%, parallel worktree agents, the verify gate, the **merge-pr
cycle**, and ship-to-`{{infra_repo}}`. Only add project-specific notes the template doesn't cover.

Then: `bin/cnc goal "<goal>" --project <org/repo>` (add `--mode claudetm` for the planner flow). The
default AI-developer flow merges each PR via `claudetm merge-pr` (fix CI + review comments, then merge);
in `--mode claudetm`, `--auto-merge` opts into the dumb fast path (`gh` merge on CI-green, skips
comments). `--mode print` for quick read-only jobs. Report the team, session, and watch/log commands.

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
