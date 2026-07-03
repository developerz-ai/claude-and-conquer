// cnc secrets <org>... | --all  [--set-creds <org>] [--sync]
//
// Runs on the MAIN controller box ONLY — Bitwarden/Vaultwarden lives here, not on the workers.
// The workers are pure Claude-Max coding boxes (git via the shared ssh key). This copies each
// org's non-secret bw.yml into ~/.cnc/bw/, optionally sets that org's creds (from $CNC_BW_* env,
// never argv/repo), and renders ~/workspace/<org>/.env locally from the vault.
import { REPO_ROOT, argAfter } from "../lib/inventory.ts";
import { c, fail } from "../lib/cli.ts";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const BWDIR = join(HOME, ".cnc", "bw");
const argv = process.argv.slice(2);
const sync = argv.includes("--sync");
const setCredsOrg = argAfter(argv, "--set-creds");

const orgsRoot = join(REPO_ROOT, "orgs");
const known = existsSync(orgsRoot) ? readdirSync(orgsRoot).filter((o) => existsSync(join(orgsRoot, o, "bw.yml"))) : [];
const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--set-creds");
let orgs = argv.includes("--all") || positional.includes("all") ? known : positional;
if (orgs.length === 0 && setCredsOrg) orgs = [setCredsOrg];
if (orgs.length === 0) {
  console.log(`orgs with BW config: ${known.join(", ") || "(none)"}`);
  fail("usage: cnc secrets <org>... | --all  [--set-creds <org>] [--sync]   (main box only)");
}

mkdirSync(BWDIR, { recursive: true });

// Pin bw 2024.9.0 — newer CLIs (2025+/2026) break against Vaultwarden with
// "Account cryptographic state is required is null" on unlock. This version logs in + unlocks clean.
const BW_VER = "2024.9.0";
if (Bun.spawnSync(["bash", "-lc", `[ "$(bw --version 2>/dev/null)" = "${BW_VER}" ]`]).exitCode !== 0) {
  console.log(c.dim(`installing bw CLI ${BW_VER} locally…`));
  Bun.spawnSync(["bash", "-lc", `cd /tmp && curl -sL "https://github.com/bitwarden/clients/releases/download/cli-v${BW_VER}/bw-linux-${BW_VER}.zip" -o bw.zip && unzip -oq bw.zip -d ~/.local/bin && chmod +x ~/.local/bin/bw`], { stdio: ["inherit", "inherit", "inherit"] });
}

const creds = { BW_CLIENTID: process.env.CNC_BW_CLIENTID, BW_CLIENTSECRET: process.env.CNC_BW_CLIENTSECRET, BW_PASSWORD: process.env.CNC_BW_PASSWORD };
const sh = (v: string) => `'${v.replaceAll("'", `'\\''`)}'`;

for (const org of orgs) {
  const cfgSrc = join(orgsRoot, org, "bw.yml");
  if (!existsSync(cfgSrc)) { console.log(`${c.yellow("–")} ${org}: no orgs/${org}/bw.yml`); continue; }
  writeFileSync(join(BWDIR, `${org}.yml`), readFileSync(cfgSrc));
  const line = [c.dim(`${org}:cfg✓`)];

  if (setCredsOrg === org) {
    if (!creds.BW_PASSWORD && !creds.BW_CLIENTID) fail("--set-creds needs $CNC_BW_PASSWORD and/or $CNC_BW_CLIENTID + $CNC_BW_CLIENTSECRET");
    const body = Object.entries(creds).filter(([, v]) => v).map(([k, v]) => `${k}=${sh(v!)}`).join("\n") + "\n";
    const f = join(BWDIR, `${org}.secret`);
    writeFileSync(f, body, { mode: 0o600 });
    chmodSync(f, 0o600);
    line.push(c.green("creds✓"));
  }

  if (sync) {
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
