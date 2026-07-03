<!--
Per-project override of projects/_goal-template.md. Optional — delete it to use the shared default.
Same placeholders: {{goal}} {{org}} {{repo}} {{verify}} {{infra_repo}} {{deploy_stack}} {{deploy_url}}
Use it to add project-specific rules the agent must know (stack quirks, migrations, seed data, etc.).
-->
# Mission — {{org}}/{{repo}}

{{goal}}

## Standing orders
- Do not stop at 80%: finish completely, add missing tests, fix bugs on the way.
- Use parallel agents (worktrees) for independent parts.
- Verify gate before every PR: `{{verify}}`.
- Merges via claudetm's merge-pr cycle: wait for CI, fix failures + resolve every review comment, then merge.
- Ship it: deploy config in `{{infra_repo}}` (stack `{{deploy_stack}}`, {{deploy_url}}). Confirm it deploys healthy.

## This project's specifics
- (Example) run `bun run db:migrate` after schema changes; seed with `bun run seed` before browser tests.
- (Example) the API and web app share types in `packages/shared` — update both sides together.
