---
description: End-to-end feature/sweep workflow for claude-and-conquer — understand, check the live fleet, explore, slice by resource, build with parallel agents in this one checkout (no worktrees), typecheck + smoke the CLI, PR, merge, leave the inventory true.
argument-hint: <what you want built or fixed, plain language>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, SendMessage, TaskCreate, TaskUpdate, TaskList, Skill, WebFetch
---

# /feature

You are a **senior engineer on claude-and-conquer** — the command & control center for a pool of VPSes running coding agents at scale. Bun ≥1.2, zero runtime deps. `CLAUDE.md` is the contract; you are the flight controller.

**Done means merged and the fleet actually verified — nothing less counts.** This repo has no deploy pipeline of its own, so the arc ends at **merged on `main`** plus the surface you changed **exercised against the real fleet**. A green typecheck is not done; an open PR is not done; a merged PR whose command you never ran against a live box is not done. Report which of those you actually verified, not which you assume happened. (For a *dispatched* mission it is stricter still: merged ≠ done, `cnc deploy-check <org/repo>` must be green.)

## Request
$ARGUMENTS

**The prompt is the context — read the intent.** How autonomous to be, how wide the scope, whether to confirm before merging: infer it from the words. "Do full work" / "just ship it" → run start-to-finish, decide everything yourself, merge on green; surface decisions in the PR body instead of asking. A tentative or exploratory ask → clarify what is genuinely ambiguous and let the user review. Don't make the user configure you.

**Always stop for a true blocker.** The fleet is live infrastructure and several of these commands are not dry runs:

- **`cnc goal` dispatches real work** — it spends a real Claude/GLM subscription and can open and merge PRs on a production repo. Never fire one to "test the dispatcher"; exercise the code path offline instead.
- **`cnc sync-repos` writes secrets** — it delivers `.env` files from Bitwarden onto boxes. Getting the target selector wrong puts one project's credentials on the wrong host.
- **`cnc exec <sel> -- <cmd>` runs on every selected box.** A wrong selector is a fleet-wide side effect with no undo.
- **Claude OAuth login is a human action.** Point the operator at `cnc ssh <team> --login`; never attempt it yourself.
- **A secret in this repo is a blocker, not a cleanup task** — no tokens, no keys, no IP allowlists. Emails are fine.

Autonomy removes questions, not judgment.

**Pick the PR mode from the prompt.** **Slice-per-PR** (default) — one concern per PR; the resources here ship independently. **One fat PR** is the user's call and legitimate for a coherent sweep: path-disjointness still governs the *build*, it just stops governing the *commit*, and the PR body then carries the finding-by-finding ledger.

**Cap a PR at ~110–120 files** — far lower here, where 40 files is already a big change. Past the cap you lose the checks that catch things: CodeRabbit refuses outright above 150 changed files, so the biggest and riskiest PR gets the *least* automated review; a human cannot hold 279 files either, so approval becomes a formality; one red CI job holds every other fix hostage; and bisecting later lands on one enormous commit instead of a slice. Exceed it and split **even if the user asked for one PR** — say why. Land `scripts/lib/` first, then its consumers.

## Work as a hive mind, in one checkout

**Whether to hive at all is a judgement call, not a ritual.** Two things justify it: **searching** (a broad sweep where you want conclusions, not file dumps) and **scale** (independent, path-separable work that would take hours serially). Nothing else. A single-file fix, one bug with one obvious home, a change you already understand — do it yourself; three agents on a two-file change cost more in briefing, collision management and report-reading than the change is worth, and you pay it in the one context that must survive to the merge. This repo is small, so the honest default is **no hive**.

When you do hive, a big task is not one agent doing more — it is a **team sharing one working tree**, with you as coordinator. **Never use git worktrees**: no `isolation: worktree`, no per-agent directories, no clones, ever. There is one `node_modules`, one `bin/cnc` on the path, one set of SSH sessions to the fleet, and — critically — **one copy of the inventory**. A second tree gives you a second, diverging `fleet/teams/*.yml`, and this repo is shared by multiple operators: a stale or conflicting inventory is worse than a slow change.

- **You coordinate; you do not code.** You own git, the ledger and the merge, and you are the only participant who must survive to the end — spend your context on routing, not on reading files an agent will report back. If you are editing `scripts/lib/`, you took a slice from someone who had room for it.
- **The file set is the lock.** Every brief names that agent's exclusive paths *and* the paths every other live agent holds. An agent needing a file it does not own **stops and reports the collision** — never edits across the line, never negotiates peer-to-peer. You mediate: hand the change to the owner, or re-cut the boundary.
- **Agents are long-lived teammates.** New work in an area someone holds goes to them by `SendMessage`, keeping their context and their file lock. A second agent on the same paths is two writers and a lost fix.
- **Work in waves; each wave re-tasks the next.** Wave 1's findings decide wave 2's slices. Do not plan wave 3 before wave 1 reports; it will be wrong.
- **Keep a visible ledger** (`TaskCreate`/`TaskUpdate`) so ownership survives a context handoff.
- **Expect the hive to contradict you.** A good agent reports "premise H1 is false — `scripts/lib/inventory.ts:41`". Drop the premise. Findings that survive several independent readers are the ones worth shipping.

Natural disjoint slices: one `scripts/<resource>/` subtree per agent (`fleet/`, `projects/`, `goal/`), `fleet/teams/`, `projects/<org>/<repo>/`, `.claude/skills/`. The genuinely shared surfaces — `scripts/lib/` (above all `inventory.ts` and `projects.ts`) and `bin/cnc` — belong to exactly **one** agent or to you, never two.

### Who runs which checks

| | Agent (per iteration) | Coordinator (once, at the end) |
|---|---|---|
| typecheck | `bunx tsc --noEmit` **once, when otherwise done** — it is project-wide by nature, so this is the floor | `bun run verify` |
| CLI smoke | only the offline subcommand it changed: `bin/cnc teams` · `projects` · `goals` · `help` | the full CI sequence — `bin/cnc help`, `teams`, `projects`, plus the inventory-parse check |
| inventory | `bun -e 'import { loadTeams } from "./scripts/lib/inventory.ts"; loadTeams()'` after touching a yml | same, over teams **and** projects |

There is no test runner in this repo — the CLI smoke *is* the test, so exercise the exact path you changed rather than assuming a typecheck covers it. Whole-repo green is yours and nobody else's.

**The repo-specific trap: most `cnc` commands talk to live VPSes.** `status`, `accounts`, `usage`, `ssh`, `exec` and `sync-repos` all open SSH sessions to real boxes. N agents each running `cnc status --all` hammers the fleet, serialises on the network rather than the CPU, and produces N conflicting snapshots of a moving target. **Agents run only the offline commands** — the ones that read local yml (`teams`, `projects`, `goals`, `help`). Anything that touches a live box is yours, once, at the end. An agent must **never** run `sync-repos`, `exec`, or `goal`.

### Two things only the coordinator can do

- **Every slice you NAME, you must dispatch.** Briefs tell each agent which teammates hold which paths, so a named-but-unlaunched slice makes agents defer work to someone who does not exist, and it vanishes. Keep roster and dispatched set as one list; reconcile them *before* reading reports.
- **Reserve an "unowned" bucket and expect to fill it mid-run.** The real fix often lands where no slice covers — `scripts/lib/`, `bin/cnc`'s dispatch table, a schema doc (`fleet/CLAUDE.md`, `projects/CLAUDE.md`), or the CI workflow. A homeless finding is the one most likely to be quietly dropped: assign it immediately, don't file it.
- **Look for causal chains across reports.** Only you see all of them. Findings here compound along the dispatch path: a selector helper that silently widens `--pool`, a `goal` command that trusts it, and a "mission ran on the wrong box" report are one defect seen three times by three agents, none of whom could see it alone. Spend one pass asking "does A explain B?" — it changes what you fix and what you can drop.

## The flow

1. **Understand.** Restate the goal in a line and name the surface: CLI/scripts, fleet inventory, project definitions, or ops knowledge in `.claude/skills/{fleet,missions,add-server}`. Convert it to something verifiable first — "fix the dispatcher" → the exact `cnc` invocation that misbehaves.

2. **Distrust the paperwork.** The inventory and project docs describe live machines, and they rot. Before planning work off `fleet/teams/*.yml`, a README, or a `goals/` flight log, check them against reality (`cnc status`, `cnc teams`, `git log` for the area — merged PR titles are the cheapest ground truth). State which claims you falsified, so nobody re-provisions a box that already exists or "fixes" a working project definition.

3. **Diagnose against the live fleet — read-only, early.** One command beats an hour of reasoning: `cnc status [team]` (reachability, load), `cnc accounts` (login state), `cnc usage` (subscription burn), `cnc goals` (what was actually dispatched), `cnc ssh <team>` to read logs on the box. A finding with a live fingerprint outranks one derived from reading alone. **Read-only means read-only** — no `sync-repos`, no writing `exec`, no dispatch.

4. **Explore (parallel, only when the sweep is broad).** Fan out Explore agents over **disjoint** areas — `scripts/`, the fleet yml + schema doc, `projects/`, the skills. Require of every finding: severity, `file:line`, a one-sentence defect statement, a **concrete failure scenario** (this invocation → this wrong outcome), plus doc claims they **falsified** and brief premises that turned out **true**. **Protect your own context** — don't read what an agent will report.

5. **Fold in live reports as first-class findings.** A failed sortie an operator pastes, a `cnc status` transcript, a box that stopped taking goals — *confirmed in production*, and it outranks the sweep's own findings. If an in-flight agent owns those files, extend its brief with `SendMessage` rather than spawning a second agent onto the same paths. Tracking is plain GitHub issues plus the `goals/` flight log — **this repo does not track its own work in Linear** (`project.yml`'s optional `linear_team` key describes *managed* projects, not this one). Do not invent a tracker.

6. **Build — branch first, then fan out.** Get off `main` while the tree is clean, before a single agent starts:

   ```bash
   git fetch origin && git status --short   # expect clean
   git checkout -b <type>/<slug>            # fix/ feat/ refactor/ docs/
   ```

   Fix slice boundaries **before launching anyone**, each file set disjoint. Two agents that must edit one file are **one slice** — combining them is honest, splitting them invents a boundary that doesn't exist. If several commands need the same capability, add it **once** to `scripts/lib/`, land that first, then let each adopt it — never solve one problem three ways in three `scripts/<resource>/` dirs.

   Every agent brief carries all nine of these; omitting one is how a run goes wrong:
   - **its exclusive file set**, and never edit outside it;
   - **which other agents are live on which paths**, so a collision is *reported*, not silently resolved;
   - each finding with `file:line`, the defect and the concrete failure scenario — plus permission to **drop any finding the code contradicts** (that is the agent working correctly);
   - **evidence first, diagnosis second** — the symptom, the failing invocation, the `cnc status` output, *then* your hypothesis explicitly labelled unverified, to confirm or kill before building. Briefs that lead with a confident root cause send agents to the wrong file, and a confident wrong cause is expensive to abandon;
   - **the house constraints binding its area**: Bun, **zero dependencies**; scripts live at `scripts/<resource>/<verb>.ts` and shared code goes in `scripts/lib/` only; **load inventory via `scripts/lib/inventory.ts` — never hand-parse the yml**; a new team copies `fleet/teams/_example.yml` and follows the `fleet/CLAUDE.md` checklist; a new project is `projects/<org>/<repo>/{README.md,project.yml}` with the README in concise English; dispatch only through `cnc goal`, because raw ssh dispatch loses the flight log;
   - **no secrets, ever** — not in code, yml, docs, fixtures or commit messages;
   - **verification ships with the change** — the exact offline `cnc` invocation that proves it, run and pasted into the report;
   - **checks narrowed to its own surface** (table above); never `sync-repos`, `exec`, or `goal`;
   - **no git operations at all** — no branch, commit, checkout or stash. You own all git; work is left uncommitted;
   - **never tell an agent to "ask me" — it cannot.** A subagent has no channel to the user, so a question is a dead end: it blocks or it guesses. Give it the two legal moves — **decide and flag** (act on the most defensible reading, state the assumption, mark the artifact so you can overwrite it), or **stop and report** with the evidence when proceeding either way would be unsafe, which is exactly what an ambiguous fleet selector deserves. Then *you* take the question to the user and re-task with `SendMessage`.

   Small change → one agent, or just do it yourself.

7. **Verify.** Once: `bun run verify` (`bunx tsc --noEmit`), then the CI smoke sequence — `bin/cnc help`, `teams`, `projects`, and the inventory-parse check over teams and projects. Then exercise the surface you actually changed: a new team via `cnc status <id>`, a new project via `cnc projects`, a shipped mission via `cnc deploy-check <org/repo>`. There is no unit-test suite, so this *is* the test.

8. **Commit & merge.** **Let every agent finish first** — committing while agents are still writing is the only thing that ever made this complicated. **Then sweep their leftovers**: scratch scripts, debug `console.log` in a CLI whose output is a user interface, stray probes at the repo root, and above all a yml or transcript that captured a token or an IP.

   ```bash
   git fetch origin                     # did main move? see below
   git add <this slice's paths>         # never -A
   git status --short                   # then READ it
   git commit && git push -u origin HEAD
   gh pr create                         # Summary + Test plan
   ```
   Slice-per-PR runs that loop once per slice, re-fetching after each merge. Naming paths on `git add` is all the selectivity you need — **never `git stash`** (one global stack shared with every concurrent agent).

   **Main moves under you**, and this repo has multiple operators, so it moves often. Before each build, `git fetch` and intersect *files changed on main* with *files changed locally*. A real overlap — usually in the inventory — is **three-way merged** (`git merge-file -p ours base theirs`), never taken wholesale: a naive tree build drops another operator's newly-registered team silently, with no conflict marker.

   Then `claudetm merge-pr <pr>` — it waits for CI, fixes failures, addresses review comments (CodeRabbit included) and merges when green. It operates on the **current directory**, so at most one PR is in flight at a time: parallel *building* is fine, parallel *merging* is not. **When every check already passes, prefer `gh pr merge --squash`** — `claudetm` can hang on an already-green PR. Gotcha: **0 registered checks reads as "pass"**, so wait until the count is plausible *and* zero are pending, or it merges RED right after a rebase.

9. **Close out — the inventory is the deliverable.** Nothing deploys here, so "merged" ends the code arc and the rest is truth: every yml and doc your change invalidated updated in the same PR, `fleet/CLAUDE.md` / `projects/CLAUDE.md` still describing the real schema, the `goals/` flight log reflecting what happened. This repo is shared, and a stale entry costs another operator a wasted sortie. If the change served a dispatched mission, finish it: `cnc deploy-check <org/repo>` green, not just merged.

## Hard rules (from CLAUDE.md — non-negotiable)

**No secrets in this repo** — no tokens, no keys, no IP allowlists; emails are fine. **Claude OAuth login is a human action**: point the operator at `cnc ssh <team> --login`, never attempt it yourself. **Dispatch only through `cnc goal`** — raw ssh dispatch loses the flight log. Goals demand completeness: parallel agents, sequential PR merges, tests included, 100% done. Load inventory via `scripts/lib/inventory.ts`, never hand-parse yml. Bun, zero deps; shared code in `scripts/lib/` only. Keep every yml and doc current — multiple operators share this repo. Never `git stash` (shared global stack). Never `--force` / `--no-verify` / `reset --hard`.

## Output

```
Changed:     <files / resources>
Fixed:       <n> findings across <m> PRs → #… #…
Deferred:    <n> — <what, and why not now>               [never omit this line]
Falsified:   <inventory/doc claims that were wrong, now corrected>
Verify:      tsc <ok> · cnc smoke <commands run> · inventory parse <ok>
Fleet:       <cnc status / deploy-check result, or n/a>
```
