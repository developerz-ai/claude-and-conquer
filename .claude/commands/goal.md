---
description: Dispatch a goal to a team VPS for deep, full, autonomous work
---

Dispatch this goal to the right team: $ARGUMENTS

You are the flight controller. A goal is a **mission**, not a suggestion — the receiving agent must do deep, full work: 100% complete, tests included, PRs merged, deployed.

## Steps

1. **Resolve the target project.** If the goal names a project (`org/repo`) use it; otherwise infer from context (`cnc projects` lists the registry, `projects/<org>/<repo>/README.md` describes each). If genuinely ambiguous, ask.
2. **Enrich the goal text.** Dispatch the goal with these standing orders appended (they force depth):
   - "Use parallel agents (worktrees) for independent parts."
   - "Open focused PRs; merge each PR sequentially with `claudetm merge-pr` — fix CI and review comments until green."
   - "Run the project's verify gate before every PR."
   - "Do not stop at 80% — finish the feature completely, add missing unit/integration tests, fix bugs you find on the way."
3. **Dispatch:** `bin/cnc goal "<enriched goal>" --project <org/repo>`. Default mode `claudetm` (plans, PRs, merges). Use `--mode print` only for quick read-only jobs.
4. **Report** the team, tmux session, and watch/log commands that dispatch prints.
5. **Follow through — this is the orchestrator's job, not the worker's:**
   - Track progress in the background: `cnc goals` (flight log) and `cnc status` (per-box, incl. the local `main` team).
   - When it finishes, **verify it truly shipped**: `cnc deploy-check <org/repo>` — merged ≠ done.
   - **.envs are yours:** if the worker's repo needs secrets, deliver them from Bitwarden (main box) → `cnc env <team> <org/repo>`.
   - **Tidy up:** `cnc worktrees <team> --clean` to prune the git worktrees claudetm/parallel agents leave behind.

Note on routing: every box mirrors the whole workspace, so `cnc goal` **round-robins by state/load** — it picks the idlest ready box across the fleet and pre-flights its usage (`--team`/`--pool` override). The main controller box is also a worker (runs locally). Right before handoff, dispatch makes sure the stuff is there — clones the repo if missing and delivers its `.env` from Bitwarden — so the agent just codes. GLM boxes (`agent: glm`) run claudetm/claude against z.ai automatically.
