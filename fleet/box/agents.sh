# cnc coding-agent aliases — pushed to ~/.cnc/agents.sh, sourced from ~/.bashrc. NO secrets here.
#   cclaude    Anthropic — the box's own Claude Max subscription
#   cclaudez   z.ai GLM via the Anthropic-compatible endpoint (needs ZAI_API_KEY)
#   claudetmz  claude-task-master (claudetm) driven by z.ai GLM instead of the Anthropic sub
# so one box can drive different coding agents. Secrets (ZAI_API_KEY, …) live on the box only,
# in ~/.cnc/agents.env (chmod 600), sourced below — never committed.
#
# z.ai env, shared by cclaudez + claudetmz. ANTHROPIC_API_KEY routes the Claude Agent SDK
# (claudetm's engine) to z.ai; AUTH_TOKEN covers the plain `claude` CLI. claudetm additionally
# preflights a valid ~/.claude/.credentials.json, so a Claude login must exist even for GLM runs.
_zai_env='ANTHROPIC_API_KEY="$ZAI_API_KEY" ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY" ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic" ANTHROPIC_DEFAULT_OPUS_MODEL="glm-5.2[1m]" ANTHROPIC_DEFAULT_SONNET_MODEL="glm-4.7" ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-4.7"'
alias cclaude='claude --dangerously-skip-permissions'
alias cclaudez="env $_zai_env claude --dangerously-skip-permissions"
alias claudetmz="env $_zai_env claudetm"
[ -f ~/.cnc/agents.env ] && . ~/.cnc/agents.env
