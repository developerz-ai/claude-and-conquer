---
description: Dispatch a goal to a team VPS for deep, full, autonomous work
---

Dispatch this goal to the right team: $ARGUMENTS

You are the flight controller. A goal is a **mission**, not a suggestion — the receiving agent must do deep, full work: 100% complete, tests included, PRs merged, deployed.

## Steps

1. **Resolve the target project.** If the goal names a project (`org/repo`) use it; otherwise infer from context (`cnc projects` lists the registry, `projects/<org>/<repo>/README.md` describes each). If genuinely ambiguous, ask.
2. **Enrich the goal text.** The prompt is for the *coding agent* — put the WORK in it, not the merge policy (merging is claudetm's job, set by flags below — a "merge the PRs" sentence in the prompt does nothing). Append these depth-forcing standing orders:
   - "Use parallel agents (worktrees) for independent parts."
   - "Run the project's verify gate before every PR; open focused PRs."
   - "Do not stop at 80% — finish the feature completely, add missing unit/integration tests, fix bugs you find on the way."
   - "Address every review comment (CI + CodeRabbit) before a PR is done."
3. **Dispatch:** `bin/cnc goal "<enriched goal>" --project <org/repo>`. Default mode `claudetm`. **Merge policy is a flag, not prose:** by default cnc passes `--no-auto-merge`, so claudetm holds each PR at `ready_to_merge` until CI is green **and** review comments are resolved. Add `--auto-merge` only when you explicitly want CI-green-merges that skip review resolution. Use `--mode print` for quick read-only jobs.
4. **Report** the team, tmux session, and watch/log commands that dispatch prints.
5. **Follow through — this is the orchestrator's job, not the worker's:**
   - Track progress in the background: `cnc goals` (flight log) and `cnc status` (per-box, incl. the local `main` team).
   - When it finishes, **verify it truly shipped**: `cnc deploy-check <org/repo>` — merged ≠ done.
   - **.envs are yours:** if the worker's repo needs secrets, deliver them from Bitwarden (main box) → `cnc env <team> <org/repo>`.
   - **Tidy up:** `cnc worktrees <team> --clean` to prune the git worktrees claudetm/parallel agents leave behind.

Note on routing: every box mirrors the whole workspace, so `cnc goal` **round-robins by state/load** — it picks the idlest ready box across the fleet and pre-flights its usage (`--team`/`--pool` override). The main controller box is also a worker (runs locally). Right before handoff, dispatch makes sure the stuff is there — clones the repo if missing and delivers its `.env` from Bitwarden — so the agent just codes. GLM boxes (`agent: glm`) run claudetm/claude against z.ai automatically.
