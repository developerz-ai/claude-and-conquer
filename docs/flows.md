# Goal flows — how `/goal` actually runs

The mental model: **you type `/goal …` in Claude on the main box; that Claude is the orchestrator.** It
runs a loop — **cleanup → start → monitor** — and never makes you ssh anywhere. The worker VPS just
codes. `cnc goal` is the one command that starts the work on a box.

## The prompt is the prompt

When you dispatch a goal, **your instruction is passed to the worker verbatim** — the same text you'd
type if you ran `claude` by hand. `cnc goal` wraps it in the project's mission template
(`projects/<org>/<repo>/goal-template.md`, or the shared `projects/_goal-template.md`), which only *adds*
standing orders (depth/100%, verify gate, `claudetm merge-pr` merges, ship-to-infra). Your words are the
core (`{{goal}}`); the orchestrator does **not** rewrite them.

## Two flows

### 1. Default — the `claude -p` **AI developer** (`--mode pr`, the default)

A single `claude -p` acts as an autonomous developer. It reads your prompt and does the work: edits
code (**across multiple repos** if needed — every repo is mirrored under `~/workspace`), opens focused
PR(s), and merges each with `claudetm merge-pr`. If your prompt says "use parallel agents," it can spawn
`Task` sub-agents; if it says "merge with claudetm merge-pr," it runs that.

- **Runs:** `claude -p "<mission>" --dangerously-skip-permissions --verbose --output-format stream-json`
- **Best for:** most work — focused features/fixes, anything spanning repos, tasks where a sharp single
  developer's judgment beats a planner.
- **Trait:** sequential (one agent unless it fans out via `Task`); it may finish with some PRs still
  open (it doesn't loop-until-all-merged).
- **Merges:** via `claudetm merge-pr` — waits for CI, **fixes failures + resolves review comments
  (CodeRabbit)**, then merges. This is "auto-merge that cleans up first."

### 2. The `claudetm start` planner (`--mode claudetm`)

The heavy structured planner: decomposes into tasks, runs **parallel agents in git worktrees**, opens
many PRs, merges each. Single repo.

- **Runs:** `claudetm start "<mission>" --no-auto-merge --verify`
- **Best for:** wide PR-farming on one repo where you want deterministic task-by-task parallelism.
- **Merges:** default `--no-auto-merge` → the merge-pr cycle (fix CI + comments, then merge).
  `--auto-merge` → the **dumb** fast path (`gh pr merge --auto`: merges on CI-green, **skips review
  comments** — this is what merged a PR dirty (skipping unresolved review threads); opt in only when you truly want speed over review).

### 3. `--mode print`
Quick one-shot `claude -p` with JSON output, no PR/merge — for read-only analysis/reports.

## Picking the flow (the rule — and the trap)

- **Default to the AI developer.** Almost everything is the `pr` flow.
- **Only use `--mode claudetm` when the operator explicitly asks for the planner** — *"use claudetm
  **start**"*, *"plan this with claudetm"*, *"use the claudetm planner"*.
- **⚠️ The trap:** operators copy their manual `claude` invocation as the goal — and that text often
  mentions *"use parallel agents"* and *"use `claudetm merge-pr`"*. **That is a work-prompt for the AI
  developer, not a request to run `claudetm start`.** `claudetm merge-pr` ≠ `claudetm start`. When
  unsure, it's the default `pr` flow.

## What C&C sets up before handing off (`prepareRepo`)

Per dispatch, on the chosen box: **clone** the repo if missing · **trust** the checkout
(`hasTrustDialogAccepted` in `~/.claude.json`, else headless `claude -p` hangs on the trust gate) ·
**deliver the `.env`** from Bitwarden (workers can't reach the vault — only main can). The agent installs
deps itself. `cnc sync-repos --all` does this proactively so every box mirrors the whole workspace.

## Model

Everything defaults to **opus 4.8** (`claude-opus-4-8`). No fable. Override per project with
`project.yml: model:` or per dispatch with `--model`. GLM boxes (`agent: glm`) route to z.ai instead.

## Monitor & control (orchestrator's job)

| do | command |
|---|---|
| flight log (all goals + state) | `cnc goals` |
| per-box health | `cnc status` |
| tail a run's log | `cnc logs <team> [-f]` |
| shell into a box | `cnc ssh <team>` |
| stop a run (resets claudetm state) | `cnc stop <team> [<slug>]` |
| verify it shipped (merged ≠ done) | `cnc deploy-check <org/repo>` |

## Direction / future

The `pr` flow is a single sequential developer. Planned: give it real parallelism — instruct `Task`
fan-out, or dispatch **several `claude -p` developers** across boxes (each a slice) and reconcile. See
[agents.md](agents.md).
