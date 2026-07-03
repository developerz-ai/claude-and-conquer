// Project registry loader. One descriptor per repo: projects/<org>/<repo>/project.yml
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./inventory.ts";

export interface Deploy {
  method?: string; // e.g. gitops-argocd, docker-compose, coolify
  infra_repo?: string; // repo describing the deployment, e.g. acme/infrastructure
  stack?: string; // path inside infra repo, e.g. stacks/webapp
  url?: string;
  health?: string[]; // URLs that must return 2xx after a deploy
}

export interface Project {
  org: string;
  repo: string;
  github?: string; // owner/name on GitHub (defaults to org/repo)
  team?: string; // pinned team id; omit to auto-assign from pool
  pool?: string; // pool to pick from when no team pinned
  path?: string; // remote checkout (default: <workspace>/<org>/<repo>)
  model?: string; // model for claude -p / claudetm (default: claude-fable-5)
  setup?: string; // install deps / prep the dev env after clone, e.g. "bun install" (default: bun install if package.json)
  env_item?: string; // Bitwarden item whose notes are the repo's .env (default: ".env <repo>")
  verify?: string; // command that must pass before PR, e.g. "bun run verify"
  deploy?: Deploy;
  linear_team?: string; // Linear team key if issues are tracked there
  notes?: string;
  dir: string; // projects/<org>/<repo>
}

const PROJECTS_DIR = join(REPO_ROOT, "projects");

export function loadProjects(): Project[] {
  const out: Project[] = [];
  if (!existsSync(PROJECTS_DIR)) return out;
  for (const org of readdirSync(PROJECTS_DIR)) {
    const orgDir = join(PROJECTS_DIR, org);
    if (org.startsWith("_") || !statSync(orgDir).isDirectory()) continue;
    for (const repo of readdirSync(orgDir)) {
      const file = join(orgDir, repo, "project.yml");
      if (!existsSync(file)) continue;
      const raw = Bun.YAML.parse(readFileSync(file, "utf8")) as Partial<Project>;
      out.push({
        model: "claude-fable-5",
        ...raw,
        org,
        repo,
        github: raw.github ?? `${org}/${repo}`,
        dir: join("projects", org, repo),
      } as Project);
    }
  }
  return out;
}

export function findProject(orgRepo: string): Project {
  const p = loadProjects().find((x) => `${x.org}/${x.repo}` === orgRepo);
  if (!p) {
    const known = loadProjects().map((x) => `${x.org}/${x.repo}`).join(", ") || "(none)";
    throw new Error(`unknown project "${orgRepo}" — known: ${known}`);
  }
  return p;
}

export function remotePath(p: Project, workspace = "~/workspace"): string {
  return p.path ?? `${workspace}/${p.org}/${p.repo}`;
}
