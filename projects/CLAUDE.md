# projects/ — the registry of what we command

One directory per repo: `projects/<org>/<repo>/`. Load through `scripts/lib/projects.ts`.

| file | purpose |
|---|---|
| `README.md` | **concise English** description: what the project is, stack, key features, where it's deployed. This is what agents and humans read first — keep it tight and current. |
| `project.yml` | machine-readable descriptor (schema below) |
| `goals/` | dispatched-goal records (`<date>-<slug>.yml`, written by `cnc goal`) + optional `backlog.md` of goals to run next |
| `goal-template.md` | **optional** per-project mission template. `cnc goal` renders it (or the shared `projects/_goal-template.md`) around your goal text, so every mission carries the same standing orders — merge-pr cycle, verify gate, ship-to-infra. Placeholders: `{{goal}}` `{{org}}` `{{repo}}` `{{verify}}` `{{infra_repo}}` `{{deploy_stack}}` `{{deploy_url}}`. |

## project.yml schema

| field | req | notes |
|---|---|---|
| `github` | | `owner/name`; defaults to `<org>/<repo>` |
| `team` | | pinned team id; omit to auto-assign from `pool` |
| `pool` | | pool to draw a team from; default `default` |
| `path` | | remote checkout; default `<workspace>/<org>/<repo>` |
| `model` | | default `claude-opus-4-8` |
| `verify` | | command that must pass before a PR, e.g. `bun run verify` |
| `deploy.method` | | `gitops-argocd` / `docker-compose` / `coolify` / ... |
| `deploy.infra_repo` | | repo describing the deployment, e.g. `acme/infrastructure` |
| `deploy.stack` | | path inside the infra repo |
| `deploy.url` | | production URL |
| `deploy.health` | | URLs that must return 2xx — `cnc deploy-check` hits these |
| `linear_team` | | Linear team key if issues live there |

## Rules

- No secrets here. GH tokens / Linear keys live on the team VPS (`gh auth`, env), never in this repo.
- Every goal dispatched with `cnc goal` leaves a record in `goals/` — that is the flight log.
- Adding a project: create `README.md` + `project.yml`, assign a team (or pool), then `cnc projects` to confirm it loads.
