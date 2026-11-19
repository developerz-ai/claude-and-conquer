# Standards

The coding, structure and testing rules this repo already follows, each with the file it comes
from. `CLAUDE.md` is the source of truth; this page collects the rules in one place.

## Runtime and dependencies

| Rule | Source |
|---|---|
| Bun only, at least 1.2.21: the YAML loaders call `Bun.YAML.parse`, first shipped in that release | `CLAUDE.md`, `package.json` (`engines.bun`) |
| Zero runtime dependencies; only `@types/bun` and `typescript` as dev dependencies | `CLAUDE.md`, `package.json` |
| TypeScript strict, no emit, Bun types, `.ts` import extensions | `tsconfig.json` |
| CLI output helpers (colour, tables) are local code, not a library | `scripts/lib/cli.ts` |

## Structure

| Rule | Source |
|---|---|
| One entry point, `bin/cnc`, dispatching each command to one script | `bin/cnc` |
| Scripts live at `scripts/<resource>/<verb>.ts`; shared code only in `scripts/lib/` | `CLAUDE.md` |
| Team inventory is one YAML per team in `fleet/teams/<id>.yml`, loaded only through `scripts/lib/inventory.ts`; never hand-parse YAML | `fleet/CLAUDE.md` |
| Each project is `projects/<org>/<repo>/` with `README.md`, `project.yml` and `goals/`, loaded through `scripts/lib/projects.ts` | `projects/CLAUDE.md` |
| Files starting with `_` are templates and are skipped by the loaders | `fleet/CLAUDE.md`, `fleet/teams/_example.yml` |
| Goals are dispatched only through `cnc goal`, which writes the flight-log record under the project's `goals/` | `CLAUDE.md`, `projects/CLAUDE.md` |

## Secrets and the public tree

| Rule | Source |
|---|---|
| No secrets in the repo: no tokens, keys or IP allowlists; account emails are allowed | `CLAUDE.md`, `fleet/CLAUDE.md` |
| `.env` files and `*.secret` are ignored; only `*.example` variants are tracked | `.gitignore` |
| The repo is public: the tracked tree names no private host, repository or home directory | `scripts/public-tree.test.ts` |
| Credentials are delivered to boxes from Bitwarden on the main box only | `docs/secrets.md` |

## Testing and the gate

| Rule | Source |
|---|---|
| `bun run verify` typechecks (`tsc --noEmit`); `bun run test` runs `bun test` plus the offline credential checks | `package.json` |
| Tests are offline: the credential checks run the CLI against a temp `HOME` and a stub `bw` | `scripts/fleet/secrets.check.ts` |
| A guard proves it fires on a stub input before it is trusted | `scripts/public-tree.test.ts`, `.github/workflows/ci.yml` |
| CI runs on Bun 1.2.21 and latest: typecheck, tests, credential checks, offline `cnc` smoke, the `cnc goal` usage guard, and an inventory parse | `.github/workflows/ci.yml`, `.github/scripts/goal-usage.sh` |

## Working in the checkout

| Rule | Source |
|---|---|
| No worktrees; parallel agents split disjoint files in the one checkout | `CLAUDE.md` |
| Claude OAuth login is a human action (`cnc ssh <team> --login`), never automated | `CLAUDE.md`, `fleet/CLAUDE.md` |
| Keep every YAML and doc current: the repo is shared by several operators | `CLAUDE.md` |
