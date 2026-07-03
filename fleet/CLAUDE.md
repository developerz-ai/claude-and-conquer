# fleet/ — team inventory

1 VPS = 1 team. One YAML file per team in `fleet/teams/<id>.yml`. Files starting with `_` are ignored (templates).

Load through `scripts/lib/inventory.ts` (`loadTeams/findTeam/selectTeams`) — never re-parse YAML by hand.

## Schema

| field | req | notes |
|---|---|---|
| `id` | ✓ | team name; defaults to filename |
| `host` | ✓ | dns or IP used for ssh |
| `ssh_user` | ✓ | per-operator user, not shared root |
| `ssh_port` | | default 22 |
| `wg_ip` | | wireguard IP if behind VPN |
| `pool` | | capacity pool for auto-assignment; default `default` |
| `state` | | `ready` (default) / `provisioning` / `retired` |
| `claude.email` | ✓ | the Claude subscription account logged in on this box |
| `claude.subscription` | | `max` / `pro` / `team` |
| `agent` | | coding agent this box runs: `claude` (Anthropic Max, default) or `glm` (z.ai; dispatch injects the z.ai env — `ANTHROPIC_API_KEY`+`BASE_URL` — needs `ZAI_API_KEY` in `~/.cnc/agents.env`). GLM boxes still need a valid `~/.claude/.credentials.json` because `claudetm` preflights it; `cnc provision` seeds it from main, and the z.ai key then takes precedence so calls route to z.ai, not Anthropic |
| `local` | | `true` for the main controller box — `cnc` runs its commands/goals here directly, no ssh |
| `workspace` | | remote workspace root; default `~/workspace` (repos at `<workspace>/<org>/<repo>`) |
| `repos` | | `org/repo` list this team owns |
| `tags` | | free-form selectors for `--tag` |

## Rules

- A human must OAuth-login each Claude account on its box: `cnc ssh <id> --login`. This cannot be automated.
- `cnc accounts` flags logged-out boxes and email mismatches.
- Never put credentials in these files — only the account *email* (identity, not secret).
- New team checklist: VPS bootstrapped → `claude` + `claudetm` + `bun` + `gh auth` + `tmux` installed → repos cloned to `~/workspace/<org>/<repo>` → yml added here → `cnc status <id>` green.
