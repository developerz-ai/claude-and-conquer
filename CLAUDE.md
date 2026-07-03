# Claude and Conquer — command & control center

Pool of VPSes + Claude subscriptions doing coding at super scale. You are the **flight controller**: dispatch goals to team VPSes, track missions, ensure work ships to production.

## Model

- 1 VPS = 1 team, running a coding agent — `claude` (Anthropic Max) or `glm` (z.ai GLM). Every box mirrors the **whole** workspace at `~/workspace/<org>/<repo>` — identical to local.
- **C&C's job = the stuff is there:** every repo cloned + its `.env` (secrets) delivered from Bitwarden on every box (`cnc sync-repos`). The worker can't reach Bitwarden — only we can. The **agent does the rest itself** (deps, build, tests, PRs).
- **The orchestrator picks the box:** `cnc goal` round-robins by state/load across ready boxes (any box can run any goal, since all mirror the workspace). `--team`/`--pool` override.
- Teams run `claudetm start` (plans → parallel agents → PRs → sequential `claudetm merge-pr` until green) or one-shot `claude -p`.
- Deploys are GitOps per project (`project.yml` → `deploy:`). Merged ≠ done — `cnc deploy-check` must be green.

## Commands (from repo root, Bun ≥1.2, zero deps)

| do | run |
|---|---|
| inventory / health / logins / usage | `bin/cnc teams` · `status` · `accounts` · `usage` |
| shell / fleet-wide command | `bin/cnc ssh <team>` · `exec <sel> -- <cmd>` |
| mirror repos + secrets to boxes | `bin/cnc sync-repos [sel] [--deps]` |
| dispatch mission (auto-picks box) | `bin/cnc goal "<text>" --project <org/repo>` |
| track / verify shipped | `bin/cnc goals` · `deploy-check <org/repo>` |

Selectors: `--all` | `--pool <p>` | `--tag <t>` | team ids.

## Structure

- `fleet/teams/*.yml` — inventory. Schema: `fleet/CLAUDE.md`. Load via `scripts/lib/inventory.ts`, never hand-parse.
- `projects/<org>/<repo>/` — README (concise English), `project.yml`, `goals/` (flight log + `backlog.md`). Schema: `projects/CLAUDE.md`.
- `scripts/<resource>/<verb>.ts` — Bun scripts; shared code in `scripts/lib/` only.
- `.claude/commands/goal.md` — the `/goal` dispatcher. `.claude/skills/{fleet,missions}` — ops knowledge.

## Rules

- Dispatch only through `cnc goal` — it records the sortie in `projects/.../goals/`. Raw ssh dispatch loses the flight log.
- Goals demand completeness: parallel agents, sequential PR merges, tests included, 100% done. Use `/goal` — it appends the standing orders.
- Claude OAuth login is a human action: point the operator at `cnc ssh <team> --login`. Never attempt it yourself.
- No secrets in this repo — no tokens, no keys, no IP allowlists. Emails are fine.
- New team: copy `fleet/teams/_example.yml`, follow the checklist in `fleet/CLAUDE.md`, confirm with `cnc status <id>`.
- New project: `projects/<org>/<repo>/{README.md,project.yml}`, confirm with `cnc projects`.
- This repo is shared by multiple operators — keep every yml and doc current; the fleet is only as good as its inventory.
