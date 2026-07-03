// cnc new-team <id> --host <h> --user <u> --email <e> [--pool p] [--sub max] [--repo org/repo]...
// Scaffolds fleet/teams/<id>.yml (state: provisioning). Secrets never live here.
import { argAfter, REPO_ROOT } from "../lib/inventory.ts";
import { c, fail } from "../lib/cli.ts";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const id = argv[0];
if (!id || id.startsWith("-")) fail("usage: cnc new-team <id> --host <h> --user <u> --email <e> [--pool p] [--sub max] [--repo org/repo]...");
const host = argAfter(argv, "--host");
const user = argAfter(argv, "--user");
const email = argAfter(argv, "--email");
if (!host || !user || !email) fail("need --host, --user, and --email");
const pool = argAfter(argv, "--pool") ?? "default";
const sub = argAfter(argv, "--sub") ?? "max";
const repos = argv.reduce<string[]>((a, v, i) => (v === "--repo" && argv[i + 1] ? [...a, argv[i + 1]] : a), []);

const file = join(REPO_ROOT, "fleet", "teams", `${id}.yml`);
if (existsSync(file)) fail(`${file} already exists`);

const yml = `id: ${id}
host: ${host}
ssh_user: ${user}
pool: ${pool}
state: provisioning # -> ready once bootstrapped + claude logged in
claude:
  email: ${email}
  subscription: ${sub}
workspace: ~/workspace
repos:
${repos.length ? repos.map((r) => `  - ${r}`).join("\n") : "  []"}
tags: [tag:${pool}]
`;
writeFileSync(file, yml);
console.log(`${c.green("✓")} wrote fleet/teams/${id}.yml`);
console.log(c.dim(`next: cnc provision ${id}   (bootstrap + optimize + secrets), then cnc ssh ${id} --login`));
