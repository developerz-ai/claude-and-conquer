# claude-and-conquer

A command-and-control centre for a fleet of VPSes running Claude coding agents at scale.
The model is one VPS = one team = one Claude subscription, with every repo checked out on
each box at `~/workspace/<org>/<repo>`. Operators use the `cnc` CLI to take inventory of the
fleet, dispatch "goals" (missions) to a team for a given project, track those missions in a
flight log, and verify that merged work actually reached production via a deploy check.
Deploys themselves are GitOps, configured per project.

**Stack:** Bun (>= 1.2) with TypeScript and zero runtime dependencies; YAML files as the
inventory and project data store; SSH for fleet access. Note the git remote is
`developerz-ai/claude-and-conquer`, not the tesote org.

**Key commands:** all from the repo root via `bin/cnc`
- `bin/cnc teams | status | accounts | usage` — inventory, health, logins, subscription usage
- `bin/cnc ssh <team>` and `bin/cnc exec <selector> -- <cmd>`
- `bin/cnc goal "<text>" --project <org/repo>` — dispatch a mission
- `bin/cnc goals` and `bin/cnc deploy-check <org/repo>`
- Selectors: `--all`, `--pool <p>`, `--tag <t>`, or explicit team ids

**Layout:**
- `fleet/teams/*.yml` — the VPS/team inventory (schema in `fleet/CLAUDE.md`)
- `projects/<org>/<repo>/` — per-project README, `project.yml` and `goals/` flight log
- `scripts/<resource>/<verb>.ts` — the Bun scripts behind the CLI, shared code in `scripts/lib/`
- `bin/` — the `cnc` entrypoint
- `docs/` — additional documentation

The repo is explicitly secret-free by policy: no tokens, keys or IP allowlists belong in it.

**State as of 2026-07-21:** on branch `main`, working tree clean when this note was written.
