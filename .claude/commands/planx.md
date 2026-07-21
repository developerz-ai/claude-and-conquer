---
description: Write a concise, self-contained multi-file execution plan to docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/ for another AI to implement.
argument-hint: [what you want done]
allowed-tools: Write, Read, Glob, Grep, Bash, Agent
---

# /planx

Produce a plan another AI can execute with zero extra context. Plan only — no implementation, no fleet dispatch, no edits outside the plan dir.

## Goal
$ARGUMENTS

## Steps

1. **Resolve path.** `date +%Y`, `date +%m`, `date +%d`. Dir = `docs/plans/<YYYY>/<MM>/<DD>/`. Next number = highest existing `1NN-*` + 1, else `101`. Slug = kebab-case, ≤5 words. Plan dir: `docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/`.

2. **Explore.** Read the schema doc for the area first — `fleet/CLAUDE.md` (team yml), `projects/CLAUDE.md` (project dirs). Then map files to touch (`file:line`): `scripts/<resource>/<verb>.ts`, `scripts/lib/`, `bin/cnc`, `fleet/teams/*.yml`, `projects/<org>/<repo>/`, `.claude/skills/{fleet,missions}`. Executors work in this checkout — no worktrees, no clones.

3. **Write the plan as multiple files** — never one big `plan.md`. Always `overview.md` plus one `<NN>-<aspect>.md` per separable area (e.g. `01-cli.md`, `02-inventory.md`, `03-projects.md`, `04-skills.md`). Keep file sets disjoint by resource so slices can run in parallel in one shared checkout.

   **`overview.md`** — Goal (1-2 sentences) · Context (Bun ≥1.2, zero deps; `bin/cnc` CLI; inventory in `fleet/teams/*.yml` loaded via `scripts/lib/inventory.ts`; projects in `projects/<org>/<repo>/` with `project.yml` + `goals/`; GitOps deploys verified by `cnc deploy-check`) with reference patterns as `file:line` · Plan files in execution order · Done when · Risks / open questions.

   **Each `<NN>-<aspect>.md`** — Files to change (`path:line`) · Steps (ordered, concrete) · Verify (the `cnc` commands that prove it: `teams`, `status <id>`, `projects`, `deploy-check <org/repo>`) · Done when.

4. **Write a `status.yml`** in the plan dir: `plan`, `title`, `status` (not_started | in_progress | blocked | complete | superseded), `created_by`/`owner` from `git config user.name`, `worked_by: ""`, `percent`, `current_focus`, `slices` (status + percent each), `evidence: []`, `notes`, `last_updated`. Valid YAML — the only tracker; slices stay reference maps.

## Rules
- Terse. Fragments over sentences. Tables for structured data. `file:line` refs over prose. No checkboxes. Point at code, don't paste it.
- Shared code goes in `scripts/lib/` only; scripts are `scripts/<resource>/<verb>.ts`. Inventory is loaded via `scripts/lib/inventory.ts` — never hand-parsed.
- Dispatch happens only through `cnc goal` (it records the sortie). Never plan raw ssh dispatch.
- **No secrets in this repo** — no tokens, keys, or IP allowlists in any plan file. Emails are fine.
- Claude OAuth login is a human action (`cnc ssh <team> --login`) — put it in Risks, never in Steps.
- Merged ≠ done: any shipping slice ends at `cnc deploy-check <org/repo>` green.
- This repo is shared by multiple operators — a slice that changes the fleet also updates the yml and docs.
- Executors work directly in this checkout — never plan around git worktrees or per-agent clones.

## Output
```
✓ docs/plans/<YYYY>/<MM>/<DD>/<1NN>-<slug>/overview.md
  + 01-<aspect>.md, … + status.yml
Next: run an executor on overview.md.
```
