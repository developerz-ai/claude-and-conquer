---
name: add-server
description: Add one or more VPSes to the fleet and stand up their dev environment — scaffold the team yml, bootstrap tools, optimize the box, hand off login. Use when asked to add a server/box/team, grow the fleet, or set up a dev environment on a VPS.
---

# Add a server (or several) to the fleet

1 VPS = 1 team = 1 Claude Max login. Everything is automatable **except** the Claude OAuth login
and (for private repos) `gh auth` — those are human steps you hand off.

## Per new box

1. **Scaffold the team** (never hand-edit yml if a script exists):
   ```
   cnc new-team <id> --host <host> --user <ssh_user> --email <claude@acct> \
       --pool <org> --repo <org/repo> --repo <org/other>
   ```
   Writes `fleet/teams/<id>.yml` (state `provisioning`). Confirm with `cnc teams` and
   reachability with `cnc status <id>`.

2. **Provision — one shot:** `cnc provision <id>` runs, in order:
   | step | does |
   |---|---|
   | `gh-setup`  | copies this main box's ssh key + `gh` token → worker gets the **same GitHub access as main** (so private repos clone). Reuses local `gh auth token`; pick a key with `--key`. |
   | `bootstrap` | tmux/git/gh/bun/claude/claudetm/uv, `cclaude` alias, workspace, repo clones |
   | `optimize`  | dev tuning: `swapoff` + `swappiness=0`, IO scheduler `none` + readahead, inotify/file-max/nofile up |

   Add `--persist` to also disable swap in fstab and set `mitigations=off` in GRUB (**needs a reboot**:
   `cnc exec <id> -- sudo reboot`). There is no `--sync` flag — secrets are a main-controller concern
   (step 3).

3. **Secrets — on the MAIN controller box only** (see `docs/secrets.md`) — pass the org's Bitwarden
   creds via env, never argv/repo. Use an **API key** (`bw` password login 404s on Vaultwarden):
   ```
   CNC_BW_CLIENTID=user.xxx CNC_BW_CLIENTSECRET=yyy CNC_BW_PASSWORD=… \
     cnc secrets <org> --set-creds <org> --sync      # --set-password <org> is an exact alias
   ```
   The credential command takes an **org** (not a team id), and `--set-password` is an exact alias
   of `--set-creds` — same org, same env vars, same file, same exit code.

   **Precondition:** the org needs `orgs/<org>/bw.yml` (server + account + `items:` manifest —
   identity only, no secrets; copy `orgs/_example/`, schema in `orgs/CLAUDE.md`). Without it
   `cnc secrets` skips the org: it prints `– <org>: no orgs/<org>/bw.yml` and writes nothing.

   With the manifest in place, the password/key land in `~/.cnc/bw/<org>.secret` (chmod 600) on the
   **main** box; `.env` is rendered to `~/workspace/<org>/.env` (600, gitignored) there too.

   Workers get **no** vault — no `bw` CLI, no per-box org config. They are pure Claude-Max coding
   boxes; their `.env` arrives from the controller: `cnc sync-repos` mirrors the repos **and** their
   `.env` onto the boxes, or `cnc env <team> <org/repo>` pushes one vault item to one box.

4. **Hand off the human steps:**
   ```
   cnc ssh <id> --login            # /login the Claude subscription as the box's email
   cnc ssh <id> -- gh auth login   # GitHub (private repos / PRs)
   ```

5. **Flip to ready:** once bootstrapped + logged in, set `state: ready` in the yml, commit, and
   verify: `cnc status <id>` + `cnc accounts <id>` green (no email mismatch).

## Several at once

Scaffold each with `cnc new-team`, then provision the batch with a selector:
```
cnc provision --pool <org>       # or: cnc provision vps-4 vps-5 vps-6
cnc optimize  --all --persist    # then reboot the batch when convenient
```
`cnc exec <selector> -- <cmd>` runs anything fleet-wide. Auth (`--login`, `gh auth`) stays per-box
and human. Keep the inventory current — capacity is only real once `cnc status` is green.
