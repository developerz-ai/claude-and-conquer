# Onboarding a sub-VPS

One VPS = one team = one Claude Max login. The main VPS is the controller (runs this repo, holds
`~/workspace/<org>/<repo>` clones, and is the **only** box with Bitwarden). Sub-VPSes are pure
coding workers: receive goals, run `claudetm`, git via the shared ssh key, Chromium for browser tests.

**Golden rule:** no secrets in this repo. Master passwords, API keys, and tokens live *on the box*
(the main box for Bitwarden; `~/.cnc/agents.env` for agent keys). This repo holds only the account
**email** and Bitwarden **server URL** (identity, not secrets).

## 1. Add the box to inventory

Fill in `fleet/teams/vps-N.yml` (host, `ssh_user`, `claude.email`) — or scaffold with
`cnc new-team`. Then either the one-shot `cnc provision vps-N` (gh-setup → bootstrap → optimize),
or step by step:

```
cnc bootstrap vps-N        # tmux/git/gh/bun/claude/claudetm/uv + Chromium (Playwright) + clone repos
cnc optimize  vps-N        # dev tuning: no swap, IO=none, file limits (runtime, safe)
cnc optimize  vps-N --persist   # also: swap off in fstab + mitigations=off in GRUB (needs reboot)
```

`bootstrap` installs **Chromium via Playwright** (`~/.cache/ms-playwright`) so browser test suites
(e.g. a project's `bun run test:browser`) run on the box.

## 2. GitHub — `cnc gh-setup` (access parity with the main box)

Give the worker the **same GitHub access as this main box** — its clone/push identity:

```
cnc gh-setup vps-N            # copies this machine's ssh key + `gh` token to the box
cnc gh-setup vps-N --key ~/.ssh/id_ed25519   # pick a specific key (default: id_ed25519)
```

Reuses the local `gh auth token` (piped over stdin, never printed) and the chosen ssh key, adds
GitHub to `known_hosts`, runs `gh auth setup-git`. After this, private repos clone on the next
`cnc bootstrap` / `cnc provision`. (`cnc provision` runs `gh-setup` first, so it's automatic.)
No per-box `gh auth login` needed.

## 3. Human auth (the ONE thing that can't be automated)

```
cnc ssh vps-N --login              # Claude subscription /login as the box's claude.email
```

Verify: `cnc status vps-N && cnc accounts vps-N` should be green with no email mismatch.

## 4. Bitwarden — on the MAIN box only (full design: [secrets.md](secrets.md))

Workers get **no** Bitwarden. Secrets live with the commander: each org's vault is unlocked on the
main box, and any Claude session here pulls from it. Non-secret connection + item manifest lives in
`orgs/<org>/bw.yml`; creds go only to `~/.cnc/bw/<org>.secret` (600) via env (never argv/repo):

```
CNC_BW_CLIENTID=user.xxxx CNC_BW_CLIENTSECRET=yyyy CNC_BW_PASSWORD=… \
  cnc secrets <org> --set-creds <org> --sync      # writes on-box secret file (600) + renders .env
cnc bw <org>                                        # unlock + show items
cnc bw <org> -- get notes ".env <app>"              # ad-hoc pull for a Claude session
```

> ⚠️ Use an **API key** (not email+master-password — broken on Vaultwarden) and the pinned
> **`bw` 2024.9.0** (newer CLIs fail `unlock`). Get `client_id`/`client_secret` from the vault web
> UI — **Account Settings → Security → Keys → View API Key**. `cnc secrets` installs the pinned bw.

## 5. MCP servers per org (Slack, Discord, Linear, …)

Run the org integrations where Bitwarden is — **the main box** — reading tokens from the vault, never
inlining literals:

```
claude mcp add linear --scope user -- npx -y @linear/mcp-server \
  --api-key "$(cnc bw <org> -- get password 'linear api key')"
# Slack / Discord: source SLACK_BOT_TOKEN / DISCORD_BOT_TOKEN from the vault via `cnc bw <org> -- get …`
```

Verify with `claude mcp list`.

## 6. Ready

Flip `state: ready` in the team yml once bootstrap + login are done, commit, and dispatch:

```
/goal finish the dashboards — parallel agents, claudetm merge-pr each PR, deploy to ../infrastructure, 100%
```
