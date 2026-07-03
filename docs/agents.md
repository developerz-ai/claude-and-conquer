# Coding agents per box

A box isn't locked to one model or one vendor. Each VPS can drive **several coding agents**,
selected by a shell alias. All aliases live in `fleet/box/agents.sh`, which `cnc bootstrap` pushes
to `~/.cnc/agents.sh` and sources from `~/.bashrc`. That file is **secret-free** and committed.

| alias | agent | notes |
|---|---|---|
| `cclaude` | Anthropic | the box's own Claude **Max** subscription (`claude --dangerously-skip-permissions`) |
| `cclaudez` | z.ai **GLM** | Anthropic-compatible endpoint `https://api.z.ai/api/anthropic`; models `glm-5.2[1m]` / `glm-4.7`. Needs `ZAI_API_KEY`. Set a box's `agent: glm` to use it. |
| `claudetmz` | z.ai **GLM** via `claudetm` | `claude-task-master` (plan → PRs → merge) driven by GLM instead of the Anthropic sub. Same z.ai env as `cclaudez`. |

### claudetm on a GLM box — the credential gate

`claudetm` (claude-task-master) routes model calls through the Claude Agent SDK, which uses
`ANTHROPIC_API_KEY` when set and only falls back to `~/.claude/.credentials.json` otherwise. So z.ai
needs **`ANTHROPIC_API_KEY=$ZAI_API_KEY`** (not just `ANTHROPIC_AUTH_TOKEN`, which covers the plain
`claude` CLI) — `cnc goal` injects it automatically for `agent: glm` boxes, and the `claudetmz` alias
sets it for interactive use.

Catch: `claudetm` **preflights a valid `~/.claude/.credentials.json`** before it will start, even on a
GLM box. So a creds file must exist there. `cnc provision` **seeds it from the main box**; the z.ai
key then takes precedence, so calls go to z.ai and never burn the Anthropic subscription. Confirmed by
claudetm's own warning at startup: *"claude.ai connectors are disabled because ANTHROPIC_API_KEY … takes
precedence over your claude.ai login."*

## Two layers: aliases (repo) vs creds (box)

- **Aliases** — `fleet/box/agents.sh`. No secrets. Same on every box.
- **Creds** — `~/.cnc/agents.env` on the box only (chmod 600), sourced by `agents.sh`. Holds
  `export ZAI_API_KEY=…` (and any other agent tokens). **Never committed.** An alias like `cclaudez`
  is present everywhere but only *works* on a box that has the matching cred set.

So enabling z.ai on a box = drop its key into `~/.cnc/agents.env` (600); the `cclaudez` alias is
already there. That's why one box can run GLM while others run the Anthropic sub.

> Note: **Bitwarden (`cnc secrets` / `cnc bw`) runs on the main box only** — the workers just code.
> Org integration secrets and MCP live with the commander; see [secrets.md](secrets.md).

## Adding another agent (Codex, etc.)

Same recipe — a box can be configured with Codex or any other CLI agent:

1. Add an alias/config block to `fleet/box/agents.sh` (secret-free — reference an env var, e.g.
   `$OPENAI_API_KEY`, don't inline the key).
2. Put the cred in `~/.cnc/agents.env` on the box(es) that should run it (chmod 600).
3. Re-run `cnc bootstrap <team>` (or push `agents.sh`) so the alias lands.

## The two goal flows

`cnc goal` has two modes (see `.claude/commands/goal.md`):
- **`pr` (default)** — a single `claude -p` **AI developer**: does the work (multi-repo aware, since
  every repo is mirrored under `~/workspace`), opens focused PR(s), merges each with `claudetm merge-pr`.
  **Sequential** — one agent, no worktree parallelism (it *can* spawn `Task` sub-agents but usually won't).
- **`claudetm` (`--mode claudetm`)** — the `claudetm start` planner: **parallel agents in worktrees**,
  many PRs, structured. Better for wide PR-farming on one repo.

## Direction / future

- **Parallel agents for the `pr` flow.** The AI developer is sequential today. Give it real
  parallelism — either instruct it to fan out via the `Task` tool for independent parts, or have
  `cnc goal` dispatch **several `claude -p` developers** across boxes, each owning a slice, then
  reconcile. (Flagged by the operator — the sequential single-agent `pr` flow is the current limit.)
- **Agent per mission.** Let `cnc goal` pick the agent (cheap GLM for mechanical passes, Claude for
  hard reasoning) the way it already picks the box by free-ness + usage headroom.
