---
description: Dispatch a goal to a team VPS and drive it to completion (cleanup → start → monitor)
---

Dispatch and drive this goal to completion: $ARGUMENTS

You are the flight controller — **the orchestrator**. A Claude session on the main box (this one, or a
headless `claude -p '/goal …'`) runs the whole loop: **cleanup → start → monitor**. You pick the box,
build the mission, start the work, and watch it ship.

**Two flows. Default to the AI developer. Be smart about which the operator means:**

- **Default → `pr`: a `claude -p` AI developer.** This is almost always it. The operator's message **is
  the prompt** — the exact instruction they'd type if they ran `claude` by hand. **Pass it through as the
  mission, verbatim.** If it says *"use parallel agents, use `claudetm merge-pr` to merge each PR,
  deploy to ../infrastructure, 100%"* — that's **instructions to the developer, NOT a mode switch.** The
  `claude -p` developer reads it and does exactly that (spawns `Task` sub-agents for parallel parts, runs
  `claudetm merge-pr` to merge). → `cnc goal "<their prompt>" --project org/repo`
- **`--mode claudetm` ONLY on an explicit meta-request for the planner** — the operator telling *you* to
  use it: *"use claudetm **start**"*, *"plan this with claudetm"*, *"use the claudetm planner"*. Note:
  **"use claudetm merge-pr" is NOT this** — that's the default flow's own merge step. Don't confuse a
  prompt that mentions claudetm with a request to run the planner. → `--mode claudetm`

> The trap (learned the hard way): the operator copies their manual `claude` invocation — which mentions
> `claudetm merge-pr` and parallel agents — as the goal. That is a **work prompt for `claude -p`**, not a
> switch to `claudetm start`. When unsure, it's the default `pr` flow.

## 1. Resolve the target project
If the goal names a project (`org/repo`) use it; otherwise infer from context (`cnc projects` lists the
registry, `projects/<org>/<repo>/README.md` describes each). If genuinely ambiguous, ask.

## 2. Cleanup first
- `cnc worktrees <team> --clean` — prune stale git worktrees claudetm/parallel agents leave behind.
- (Dispatch also runs `claudetm clean -f` before `start`, so leftover task state never blocks a fresh run.)

## 3. Start
**Pass the operator's instruction through as the prompt — don't rewrite it.** `cnc goal` renders the
project's `goal-template.md` (or the shared `projects/_goal-template.md`) *around* it, adding the
standing orders (depth/100%, parallel where independent, verify gate, `claudetm merge-pr` merges,
ship-to-`{{infra_repo}}`). The operator's exact words go in as `{{goal}}`.

Then: `bin/cnc goal "<their prompt>" --project <org/repo>`. Merge policy for the default flow **is not a
flag** — the developer merges each PR with `claudetm merge-pr` per the mission. `--mode claudetm` only
for the explicit planner request (there `--auto-merge` = dumb `gh` CI-green merge; default is the fixing
merge-pr cycle). `--mode print` for quick read-only jobs. Report the team, session, and watch/log commands.

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
