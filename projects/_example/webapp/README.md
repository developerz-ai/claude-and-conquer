# webapp (example — copy this directory shape to projects/<your-org>/<your-repo>/)

Describe the project here in concise English. This is the first thing agents and humans read — what it is, the stack, the rules of engagement.

- **What:** customer-facing web app for Acme.
- **Stack:** Bun monorepo — Hono API, SolidJS frontend, Drizzle → Postgres.
- **Verify gate:** `bun run verify` (typecheck + lint + tests). Green locally ⇒ green CI.
- **PR flow:** branch `<type>/<slug>`, conventional commits, one concern per PR, tests ship with code.
- **Deploy:** GitOps — merge to `main` → CI builds → registry → ArgoCD rollout. Stack lives in `acme/infrastructure`.
