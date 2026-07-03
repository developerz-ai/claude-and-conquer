<!--
Default mission template. `cnc goal` renders this around your goal text before sending it to the
worker, so every mission carries the same standing orders. A project can override it with its own
projects/<org>/<repo>/goal-template.md (same placeholders). Placeholders:
  {{goal}} {{org}} {{repo}} {{verify}} {{infra_repo}} {{deploy_stack}} {{deploy_url}}
-->
# Mission — {{org}}/{{repo}}

{{goal}}

## Standing orders (non-negotiable)
- **Depth:** do not stop at 80%. Finish the feature completely, add missing unit/integration tests,
  and fix bugs you find on the way. 100% done.
- **Parallelism:** use parallel agents (git worktrees) for independent parts.
- **Verify gate:** run `{{verify}}` and make it green before opening any PR.
- **Merges = claudetm merge-pr cycle:** for each PR, wait for CI, **fix failures and resolve every
  review comment (CodeRabbit, reviewers)**, then merge. Never merge a PR with unresolved threads.
- **Ship it, don't just merge it:** the deploy config lives in `{{infra_repo}}` (stack
  `{{deploy_stack}}`). Make sure the change actually deploys — update the infra/stack if needed and
  confirm the deploy is healthy. Merged ≠ done.
