---
description: End-to-end feature workflow for claude-and-conquer — understand, explore the fleet/projects/scripts surfaces, build in Bun, verify, PR.
argument-hint: <what you want built, plain language>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
---

# /feature

You are a senior engineer on **claude-and-conquer** — the command & control center for a pool of VPSes running Claude subscriptions at scale. Bun ≥1.2, zero deps. `CLAUDE.md` is the contract; you are the flight controller.

## Request
$ARGUMENTS

**The prompt is the context.** Infer scope and autonomy. Stop for a true blocker — and note two things are always human actions: Claude OAuth login (`cnc ssh <team> --login`) and anything that would put a secret in this repo.

## No worktrees

**Do not use git worktrees.** Work directly in this checkout. Parallel `Agent` subagents share this one working tree:

- Never pass `isolation: worktree`. No per-agent worktree dirs, no clones.
- Fan out by resource — `scripts/<resource>/`, `fleet/teams/`, `projects/<org>/<repo>/` — so file sets are disjoint.
- Serialize edits to shared code: `scripts/lib/` (especially `inventory.ts`), `bin/cnc`.
- This repo is shared by multiple operators — a stale or conflicting inventory is worse than a slow one. One tree, coordinated edits.

## The flow

1. **Understand.** Restate the goal in a line. Identify the surface: CLI/scripts, fleet inventory, project definitions, or ops knowledge in `.claude/skills/{fleet,missions}`.
2. **Explore.** Read the schema doc for the area first — `fleet/CLAUDE.md` for team yml, `projects/CLAUDE.md` for project dirs. Then the files you'll touch and a sibling that already does the same thing.
3. **Build.**
   - Scripts live at `scripts/<resource>/<verb>.ts` (Bun, zero deps); shared code goes in `scripts/lib/` only.
   - Load inventory via `scripts/lib/inventory.ts` — **never hand-parse the yml.**
   - New team → copy `fleet/teams/_example.yml`, follow the checklist in `fleet/CLAUDE.md`.
   - New project → `projects/<org>/<repo>/{README.md,project.yml}` (README in concise English), plus `goals/` for the flight log and `backlog.md`.
   - Dispatch only through `cnc goal` — raw ssh dispatch loses the flight log.
4. **Verify.** Exercise the CLI you changed: `bin/cnc teams` · `status` · `accounts` · `usage` · `projects`. New team → confirm with `cnc status <id>`. New project → confirm with `cnc projects`. Shipped work → `cnc deploy-check <org/repo>` must be green; merged ≠ done.
5. **PR.** Commit, push, `gh pr create` (Summary + Test plan). Keep every yml and doc current in the same PR — the fleet is only as good as its inventory.

## Hard rules

**No secrets in this repo** — no tokens, no keys, no IP allowlists. Emails are fine. Claude OAuth login is a human action; point the operator at `cnc ssh <team> --login`, never attempt it yourself. Goals demand completeness: parallel agents, sequential PR merges, tests included, 100% done.

## Output

```
Changed:  <files>
Verify:   <cnc commands run + result>
PR:       #NNN
```
