# webapp (example — copy this directory shape to projects/<your-org>/<your-repo>/)

Describe the project here in concise English. This is the first thing agents and humans read — what it is, the stack, the rules of engagement.

- **What:** customer-facing web app for Acme.
- **Stack:** Bun monorepo — Hono API, SolidJS frontend, Drizzle → Postgres.
- **Verify gate:** `bun run verify` (typecheck + lint + tests). Green locally ⇒ green CI.
- **PR flow:** branch `<type>/<slug>`, conventional commits, one concern per PR, tests ship with code.
- **Deploy:** This example uses GitOps — merge to `main` → CI builds → registry → ArgoCD rollout. Its
  stack lives in `acme/infrastructure`. `gitops-argocd`, `docker-compose`, and `coolify` are supported;
  select the method configured for each project.
