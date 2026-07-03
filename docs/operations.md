# Operations runbook

## Bring a new team online

1. Provision the VPS (see your infra repo). Ubuntu 24.04, ssh key for each operator.
2. Add `fleet/teams/<id>.yml` (copy `_example.yml`, `state: provisioning`).
3. `cnc bootstrap <id>` — installs tmux/git/gh/bun/claude/claudetm, `cclaude` alias, workspace layout, and clones the team's repos.
4. Auth (human — the only out-of-Claude steps):
   - `cnc ssh <team> --login` — Claude subscription `/login` as the yml's `claude.email`.
   - `cnc ssh <team> -- gh auth login` — GitHub token with repo+PR scope.
   - Optional: Linear API key in the repo's env if the project uses Linear.
5. Re-run `cnc bootstrap <id>` if private repo clones were skipped before gh auth.
6. Flip yml to `state: ready`. Verify: `cnc status <id>` and `cnc accounts <id>` green.

New fork? Start Claude in the repo and run `/setup` — it does all of the above and interviews you for the inventory.

## Daily flight check

```bash
cnc status          # anything unreachable? logged out? disk full?
cnc goals           # what's flying; anything finished/gone that needs review
cnc usage --days 1  # subscription burn per team
```

## Dispatching work

- Backlogs: `projects/<org>/<repo>/goals/backlog.md` — one goal per line, work top-down.
- `/goal <text>` in a commander Claude session (preferred — appends standing orders), or `cnc goal "<text>" --project <org/repo>` directly.
- Watch live: `cnc ssh <team> -- tmux attach -t <session>` (detach: `Ctrl-b d`).
- Logs: `cnc ssh <team> -- tail -f '~/.cnc/logs/<file>'`.

## When a mission lands

1. `cnc goals` shows the session finished.
2. Check PRs merged on GitHub (claudetm merges sequentially; stragglers: run `claudetm merge-pr <n>` in the repo on the box).
3. `cnc deploy-check <org/repo>` — green health = done. Red = investigate rollout (ArgoCD/infra repo) before calling it complete.

## Troubleshooting

| symptom | fix |
|---|---|
| `unreachable` in status | host/ssh_user in yml; VPN up? try `cnc ssh <team>` |
| `logged out` in accounts | `cnc ssh <team> --login` (human OAuth) |
| email mismatch | wrong sub burning on that box — re-login with the right account |
| goal session gone instantly | `cnc ssh <team> -- cat '~/.cnc/logs/<file>'` — usually claudetm/config missing in the repo |
| Claude throttled (Max limit) | `cnc usage` to see burn; shift the project to another pool/team |
| tmux session name collision | slugs truncate at 40 chars — re-dispatch with distinct leading words |
