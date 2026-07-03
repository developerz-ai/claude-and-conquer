---
name: fleet
description: Operate the VPS fleet — status, accounts, usage, ssh, exec. Use when asked about servers, teams, Claude logins, or subscription usage.
---

# Fleet operations

All fleet state lives in `fleet/teams/*.yml` (schema: `fleet/CLAUDE.md`). All commands run from repo root.

| want | run |
|---|---|
| inventory | `bin/cnc teams` |
| health (ssh, claude auth, disk, running goals) | `bin/cnc status` |
| who's logged in / needs auth | `bin/cnc accounts` |
| token/cost per subscription | `bin/cnc usage --days 7` |
| run a command everywhere | `bin/cnc exec --all -- <cmd>` |
| shell into a box | `bin/cnc ssh <team>` |

Rules:
- Claude subscription login is a **human** action: tell the operator to run `bin/cnc ssh <team> --login` in their terminal — never attempt the OAuth flow yourself.
- `unreachable` in status → check host/ssh_user in the team yml, then the VPN (`wg_ip`).
- Email mismatch in accounts → the wrong subscription is burning on that box; flag it to the operator immediately.
- Adding capacity = new yml in `fleet/teams/` (copy `_example.yml`) + bootstrap checklist in `fleet/CLAUDE.md`.
