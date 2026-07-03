// Fleet inventory loader. 1 VPS = 1 team. Never re-parse the YAML by hand —
// load teams through this module so schema defaults live in one place.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

export interface ClaudeAccount {
  email: string;
  subscription?: string; // max | pro | team
}

export interface Team {
  id: string;
  host: string; // dns name or IP used for ssh
  ssh_user: string;
  ssh_port?: number;
  wg_ip?: string;
  pool?: string; // capacity pool for auto-assignment (default: "default")
  state?: "ready" | "provisioning" | "retired";
  claude: ClaudeAccount;
  agent?: "claude" | "glm"; // coding agent this box runs: claude (Anthropic Max, default) | glm (z.ai)
  local?: boolean; // the main controller box itself — run goals here, no ssh
  workspace?: string; // remote workspace root (default: ~/workspace)
  repos?: string[]; // org/repo assigned to this team
  tags?: string[];
  notes?: string;
  file: string;
}

export const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const TEAMS_DIR = join(REPO_ROOT, "fleet", "teams");

export function loadTeams(): Team[] {
  const files = readdirSync(TEAMS_DIR).filter(
    (f) => f.endsWith(".yml") && !f.startsWith("_"),
  );
  return files.map((f) => {
    const raw = Bun.YAML.parse(readFileSync(join(TEAMS_DIR, f), "utf8")) as Omit<
      Team,
      "file"
    >;
    const id = raw.id ?? f.replace(/\.yml$/, "");
    return {
      workspace: "~/workspace",
      pool: "default",
      state: "ready",
      ...raw,
      id,
      file: join("fleet", "teams", f),
    } as Team;
  });
}

export function activeTeams(): Team[] {
  return loadTeams().filter((t) => t.state !== "retired");
}

export function findTeam(id: string): Team {
  const team = loadTeams().find((t) => t.id === id);
  if (!team) {
    const known = loadTeams().map((t) => t.id).join(", ") || "(none)";
    throw new Error(`unknown team "${id}" — known teams: ${known}`);
  }
  return team;
}

export function teamForRepo(orgRepo: string): Team | undefined {
  return activeTeams().find((t) => (t.repos ?? []).includes(orgRepo));
}

/** Selector: --all | --pool <p> | --tag <t> | team id(s). */
export function selectTeams(argv: string[]): Team[] {
  const teams = activeTeams();
  if (argv.includes("--all") || argv.length === 0) return teams;
  const pool = argAfter(argv, "--pool");
  if (pool) return teams.filter((t) => t.pool === pool);
  const tag = argAfter(argv, "--tag");
  if (tag) return teams.filter((t) => (t.tags ?? []).includes(tag));
  const ids = argv.filter((a) => !a.startsWith("-"));
  return ids.map(findTeam);
}

export function argAfter(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
