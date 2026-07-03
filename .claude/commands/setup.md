---
description: Onboard a new fork — interview the operator, personalize orgs/projects/servers/docs, provision the fleet, hand off auth
---

Set up this command center from a fresh fork. Extra context from the operator: $ARGUMENTS

You are the flight controller onboarding a **new fork** of claude-and-conquer. The operator just
cloned it and started you. Get from zero to a working, personalized fleet — asking only for what
you cannot discover. Drive the `cnc` scaffolding scripts; don't hand-write boilerplate.

## Steps

1. **Interview** the operator (only what you can't infer):
   - **Servers:** for each box — host/IP, ssh user, one Claude Max account email. 1 VPS = 1 team.
   - **Orgs & projects:** which orgs (e.g. `acme`, `widgets`, …), which repos per org, a
     one-line English pitch for each, deploy target (usually `<org>/infrastructure` via GitOps),
     and the model (default **opus 4.8** — `claude-opus-4-8`).
   - **Secrets:** each org's Bitwarden/Vaultwarden server + account. **Do not** take the master
     password or API key into the repo — those go straight to the box (step 5).

2. **Personalize the repo** with the scaffolding scripts (they write the right shapes):
   - Team per box:   `cnc new-team <id> --host <h> --user <u> --email <e> --repo <org/repo> ...`
   - Project per repo: `cnc new-project <org/repo> --team <id> --url <https://…>`
   - Per-org BW config: create `orgs/<org>/bw.yml` (server + account + items manifest — **no secrets**)
     and `orgs/<org>/env.example`. Schema: `orgs/CLAUDE.md`.
   - Then **edit the generated READMEs** so each project's pitch is real (the scripts leave a
     placeholder). Update the top-level `README.md` and `docs/` to name the actual orgs/fleet.
   - Confirm: `cnc projects` and `cnc teams` list everything.

3. **Provision each box** (automatable): `cnc provision <team>` = `bootstrap` (tmux/git/gh/bun/
   claude/claudetm/uv + workspace + repo clones) → `optimize` (no swap, IO=none, file limits;
   add `--persist` for fstab + `mitigations=off`, needs reboot) → `secrets` (push per-org BW config).

4. **Hand off the human steps** (auth is the ONLY thing you cannot do) — per team:
   ```
   cnc ssh <team> --login            # /login the Claude subscription as <email>
   cnc ssh <team> -- gh auth login   # GitHub for PRs / private repos
   ```

5. **Wire secrets** once the operator gives you each org's Bitwarden creds — keep them out of
   argv/repo, pass via env (they land in a 600 file on the box only):
   ```
   CNC_BW_CLIENTID=user.xxx CNC_BW_CLIENTSECRET=yyy CNC_BW_PASSWORD=… \
     cnc secrets <team> --set-password <org> --sync
   ```
   Use an **API key** (not email+password — the `bw` CLI password login 404s on Vaultwarden).
   Full design + how to get the API key: `docs/secrets.md`.

6. **Verify & first mission.** `cnc status` + `cnc accounts` all green. Then shake down the
   pipeline with a small `/goal` (e.g. a docs-only goal) and confirm `cnc goals` tracks it, and
   `cnc deploy-check <org/repo>` after it merges.

Keep every yml and doc current as you go — the fleet is only as good as its inventory.
