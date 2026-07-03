# Secrets — per-org Bitwarden / Vaultwarden (main box only)

**Bitwarden lives only on the main controller box, never on the workers.** The workers are pure
Claude-Max coding boxes (git via the shared ssh key, Chromium for browser tests). The main box holds
every org's vault, so any Claude session running here can pull a secret when it needs one. Nothing
secret is ever committed to this repo.

Each org runs its **own** Vaultwarden (or Bitwarden) server with its own account:

| org | server | account (identity, not a secret) |
|---|---|---|
| acme | `https://vault.acme.example` | `ops@acme.example` |
| widgets | `https://vault.widgets.example` | `ops@widgets.example` |

Multiple org vaults coexist on the one main box via an isolated per-org data dir
(`~/.cnc/bw/<org>.data`) — each org stays logged into its own server side by side.

## Security model — what lives where

| in this repo (identity/config only) | on the MAIN box only (secret, 600) |
|---|---|
| `orgs/<org>/bw.yml` — server URL, account email, item→env manifest | `~/.cnc/bw/<org>.secret` — API key + master password |
| `orgs/<org>/env.example` — env var **names** | `~/.cnc/bw/<org>.data/` — per-org bw CLI state |
| — | `~/workspace/<org>/.env` — rendered secrets (gitignored) |

Everything under `~/.cnc/bw/` and `~/workspace/*/.env` is `chmod 600` and never leaves the main box.

## ⚠️ Pin `bw` 2024.9.0

- **Email + master-password login is broken** against Vaultwarden — the newer `bw` CLIs return
  `{"statusCode":404}`. Use **API-key login** instead; the master password is only for `bw unlock`.
- **Newer `bw` CLIs (2025+/2026) also break `unlock`** on Vaultwarden with
  `Account cryptographic state is required is null or undefined`. Pin **`bw` 2024.9.0** — it logs in
  and unlocks clean. `cnc secrets` installs exactly this version (from the GitHub release) and won't
  silently upgrade.

### Get the API key (per org, once)

In that org's Vaultwarden **web vault**: **Account Settings → Security → Keys → View API Key** →
a `client_id` (`user.xxxxxxxx`) and a `client_secret`. These are `BW_CLIENTID` / `BW_CLIENTSECRET`.

Sources: [Arch bug #74175](https://bugs.archlinux.org/task/74175),
[Bitwarden community forums](https://community.bitwarden.com/t/cli-login-fail-master-password-fail/69906).

## Setting it up (on the main box)

Creds are passed via **env vars only** — never argv, never the repo. `cnc secrets --set-creds`
writes whatever of `BW_CLIENTID` / `BW_CLIENTSECRET` / `BW_PASSWORD` are present to the on-box
secret file (600):

```bash
CNC_BW_CLIENTID='user.xxxx' \
CNC_BW_CLIENTSECRET='yyyy' \
CNC_BW_PASSWORD='<master password>' \
  bin/cnc secrets acme --set-creds acme --sync
```

`cnc secrets <org>... | --all [--set-creds <org>] [--sync]`:
1. installs `bw` 2024.9.0 locally if missing,
2. copies `orgs/<org>/bw.yml` → `~/.cnc/bw/<org>.yml`,
3. `--set-creds <org>` → writes `~/.cnc/bw/<org>.secret` (600) from `$CNC_BW_*`,
4. `--sync` → runs `bw-sync <org>` → renders `~/workspace/<org>/.env` from the manifest.

## Ad-hoc access — `cnc bw` (for a Claude session)

Because BW is main-only, a Claude session on the main box pulls secrets with `cnc bw`, which unlocks
the org vault and injects a live session:

```bash
cnc bw acme                           # unlock + show item count
cnc bw acme -- list items             # raw bw, session injected
cnc bw acme -- get notes ".env webapp"
```

A real vault can hold a lot (per-app `.env`s, service creds, tokens),
so the `items:` manifest in `orgs/<org>/bw.yml` is best tuned to the real item names you actually want
rendered into `~/workspace/<org>/.env`; anything unmapped is still reachable directly via `cnc bw`.

## The manifest (`orgs/<org>/bw.yml`)

```yaml
server: https://vaultwarden.example.com
account: someone@example.com
items:                                      # ENV_VAR -> vault item / field
  GITHUB_TOKEN:      { item: "github pat",       field: password }
  ANTHROPIC_API_KEY: { item: "anthropic api key", field: password }
```
`field` ∈ `password | username | uri | notes | totp` (default `password`). Item names must match the
vault; missing items are warned and skipped, not fatal.

## The vault is also the write-source

`bw` does full CRUD on items/collections. Store a new org secret **in the vault**
(`cnc bw <org> -- create item …` or the web UI), add a manifest line, and re-run
`cnc secrets <org> --sync`. This is how a future Claude, given only an org's BW creds, fills
everything back out.
