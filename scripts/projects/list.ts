// cnc projects — the registry: what we command, who owns it, where it deploys.
import { loadProjects } from "../lib/projects.ts";
import { teamForRepo } from "../lib/inventory.ts";
import { table } from "../lib/cli.ts";

table(
  ["PROJECT", "TEAM", "MODEL", "DEPLOY", "VERIFY"],
  loadProjects().map((p) => [
    `${p.org}/${p.repo}`,
    p.team ?? teamForRepo(`${p.org}/${p.repo}`)?.id ?? `(pool: ${p.pool ?? "default"})`,
    p.model ?? "claude-fable-5",
    p.deploy?.method ?? "-",
    p.verify ?? "-",
  ]),
);
