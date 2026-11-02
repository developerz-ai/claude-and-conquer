# orgs/ — per-org config (NON-SECRET)

One directory per org: `orgs/<org>/`. Holds the *connection + manifest* for that org's
Bitwarden (Vaultwarden) vault and the list of env vars agents need. **Never a password or token.**

Each org runs its **own** Bitwarden server with its own account. The **main controller box** holds
them all — one org per vault data dir — and workers get no vault at all.

| file | purpose |
|---|---|
| `bw.yml` | BW `server` URL + `account` email + `items:` manifest (env var → vault item/field). Identity + mapping only. |
| `env.example` | the env var names this org's boxes expect (no values). |

## bw.yml schema

```yaml
server: https://vaultwarden.example.com   # the org's Bitwarden/Vaultwarden server
account: someone@example.com              # BW account email (identity, NOT a secret)
items:                                     # ENV_VAR -> where to read it in the unlocked vault
  GITHUB_TOKEN:      { item: "github pat",       field: password }
  ANTHROPIC_API_KEY: { item: "anthropic api key", field: password }
```
`field` ∈ `password | username | uri | notes | totp` (default `password`). Item names must
match what exists in the vault; missing items are skipped (warned), not fatal.

## Secret flow (nothing secret is stored here)

The vaults live on the **MAIN controller box only** — workers are pure Claude-Max coding boxes:
no `bw` CLI, no per-box org config, no vault.

1. `bw.yml` (this repo) → copied to the main box at `~/.cnc/bw/<org>.yml`.
2. Master password → written **on the main box only** at `~/.cnc/bw/<org>.secret` (chmod 600),
   via `cnc secrets <org> --set-creds <org>` (reads `CNC_BW_PASSWORD` env, never argv/repo).
3. On the main box, `bw-sync <org>` (run by `cnc secrets --sync`) unlocks the vault and renders
   `~/workspace/<org>/.env` (chmod 600, gitignored) for agents to source.

Run it all with `cnc secrets <org> [--set-creds <org>] [--sync]`. See `docs/secrets.md`.
