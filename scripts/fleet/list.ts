// cnc teams — inventory view, no network calls.
import { activeTeams } from "../lib/inventory.ts";
import { table } from "../lib/cli.ts";

const teams = activeTeams();
table(
  ["TEAM", "POOL", "HOST", "CLAUDE ACCOUNT", "REPOS"],
  teams.map((t) => [
    t.id,
    t.pool ?? "default",
    `${t.ssh_user}@${t.host}`,
    t.claude?.email ?? "?",
    (t.repos ?? []).join(", ") || "-",
  ]),
);
