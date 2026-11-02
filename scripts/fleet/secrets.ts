// cnc secrets <org>... | --all  [--set-creds <org> | --set-password <org>] [--sync]
//
// Runs on the MAIN controller box ONLY — Bitwarden/Vaultwarden lives here, not on the workers.
// The workers are pure Claude-Max coding boxes (git via the shared ssh key). This copies each
// org's non-secret bw.yml into ~/.cnc/bw/, optionally sets that org's creds (from $CNC_BW_* env,
// never argv/repo), and renders ~/workspace/<org>/.env locally from the vault.
//
// --set-creds and --set-password are EXACT aliases: same org, same env vars, same file, same
// exit code. Every rejection rule lives in scripts/lib/secrets.ts, so a bad request is refused
// before anything touches the disk.
import { REPO_ROOT } from "../lib/inventory.ts";
import { c, fail } from "../lib/cli.ts";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { planSecrets, positionalOrgs, writeSecretFile } from "../lib/secrets.ts";

const HOME = homedir();
const BWDIR = join(HOME, ".cnc", "bw");
const argv = process.argv.slice(2);

const orgsRoot = join(REPO_ROOT, "orgs");
const known = existsSync(orgsRoot) ? readdirSync(orgsRoot).filter((o) => existsSync(join(orgsRoot, o, "bw.yml"))) : [];

const creds = { BW_CLIENTID: process.env.CNC_BW_CLIENTID, BW_CLIENTSECRET: process.env.CNC_BW_CLIENTSECRET, BW_PASSWORD: process.env.CNC_BW_PASSWORD };

// Validate FIRST: a rejected request must not mkdir, download bw or write anything.
const planned = planSecrets(argv, known, creds);
if (!planned.ok) fail(planned.error);
const plan = planned.plan;

// A listed org with no orgs/<org>/bw.yml is skipped, with a warning naming it.
for (const org of positionalOrgs(argv)) {
  if (org !== "all" && !plan.targets.includes(org)) console.log(`${c.yellow("–")} ${org}: no orgs/${org}/bw.yml — skipped`);
}

mkdirSync(BWDIR, { recursive: true });

// Pin bw 2024.9.0 — newer CLIs (2025+/2026) break against Vaultwarden with
// "Account cryptographic state is required is null" on unlock. This version logs in + unlocks clean.
const BW_VER = "2024.9.0";
if (Bun.spawnSync(["bash", "-lc", `[ "$(bw --version 2>/dev/null)" = "${BW_VER}" ]`]).exitCode !== 0) {
  console.log(c.dim(`installing bw CLI ${BW_VER} locally…`));
  Bun.spawnSync(["bash", "-lc", `cd /tmp && curl -sL "https://github.com/bitwarden/clients/releases/download/cli-v${BW_VER}/bw-linux-${BW_VER}.zip" -o bw.zip && unzip -oq bw.zip -d ~/.local/bin && chmod +x ~/.local/bin/bw`], { stdio: ["inherit", "inherit", "inherit"] });
}

for (const org of plan.targets) {
  const cfgSrc = join(orgsRoot, org, "bw.yml");
  if (!existsSync(cfgSrc)) { console.log(`${c.yellow("–")} ${org}: no orgs/${org}/bw.yml`); continue; }
  writeFileSync(join(BWDIR, `${org}.yml`), readFileSync(cfgSrc));
  const line = [c.dim(`${org}:cfg✓`)];

  if (plan.credsOrg === org) {
    // "creds✓" may only be printed once the file really holds the credentials.
    const { path } = writeSecretFile(BWDIR, org, creds);
    if (!existsSync(path) || statSync(path).size === 0) fail(`could not write ${path} — credentials NOT set`);
    line.push(c.green("creds✓"));
  }

  if (plan.sync) {
    const r = Bun.spawnSync([process.execPath, join(REPO_ROOT, "fleet", "box", "bw-sync.ts"), org], {
      env: { ...process.env, WORKSPACE: join(HOME, "workspace") }, stdout: "pipe", stderr: "pipe",
    });
    const out = new TextDecoder().decode(r.stdout).trim();
    const err = new TextDecoder().decode(r.stderr).trim();
    line.push(r.exitCode === 0 ? c.green("sync✓") : c.red("sync✗"));
    if (out) console.log(c.dim("  " + out));
    if (r.exitCode !== 0 && err) console.log(c.dim("  " + err.split("\n").slice(-4).join("\n  ")));
  }
  console.log(`${c.bold(org)}  ${line.join("  ")}`);
}
