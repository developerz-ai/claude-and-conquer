#!/usr/bin/env bun
// Offline checks for the credential command (`cnc secrets`).
//
// Bun + node:assert, zero dependencies — the typecheck gate must not depend on test-runner
// typings. Everything runs offline: the CLI is invoked against a temp HOME (never the real
// one) with a stub `bw`, so nothing is downloaded and no credential value exists anywhere
// but the dummy constants below.
import { deepStrictEqual, equal, notEqual, ok } from "node:assert";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planSecrets, positionalOrgs, writeSecretFile, type CredentialEnv } from "../lib/secrets.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const CNC = join(REPO_ROOT, "bin", "cnc");

// Dummy values — the real ones never reach this script, a temp file or the output.
const DUMMY_PASSWORD = "dummy-master-password-2f8c";
const DUMMY_CLIENTID = "user.dummy-client-id";
const DUMMY_CLIENTSECRET = "dummy-client-secret";

const homes: string[] = [];
let checks = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
    process.exit(1);
  }
  checks++;
  console.log(`ok   ${name}`);
}

/** A temp HOME with a stub `bw` (pinned version) so the CLI never downloads anything. */
function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "cnc-secrets-"));
  homes.push(home);
  const bin = join(home, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  const stub = join(bin, "bw");
  writeFileSync(stub, '#!/bin/sh\ncase "$1" in --version) echo 2024.9.0;; esac\nexit 0\n');
  chmodSync(stub, 0o755);
  // `bash -l` resets PATH on some hosts — put the stub back for the login shell.
  writeFileSync(join(home, ".profile"), 'export PATH="$HOME/.local/bin:$PATH"\n');
  return home;
}

/** Run the real CLI against a temp HOME. Returns the exit code and stdout+stderr. */
function runCli(args: string[], home: string, creds?: CredentialEnv): { code: number; output: string } {
  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: home,
    PATH: `${join(home, ".local", "bin")}:${process.env.PATH ?? ""}`,
  };
  delete env.CNC_BW_PASSWORD;
  delete env.CNC_BW_CLIENTID;
  delete env.CNC_BW_CLIENTSECRET;
  if (creds) {
    if (creds.BW_PASSWORD) env.CNC_BW_PASSWORD = creds.BW_PASSWORD;
    if (creds.BW_CLIENTID) env.CNC_BW_CLIENTID = creds.BW_CLIENTID;
    if (creds.BW_CLIENTSECRET) env.CNC_BW_CLIENTSECRET = creds.BW_CLIENTSECRET;
  }
  const r = Bun.spawnSync([CNC, ...args], { env, stdout: "pipe", stderr: "pipe" });
  const dec = new TextDecoder();
  return { code: r.exitCode ?? -1, output: dec.decode(r.stdout) + dec.decode(r.stderr) };
}

/** The orgs this repo knows about (each has an orgs/<org>/bw.yml). */
function repoKnownOrgs(): string[] {
  const root = join(REPO_ROOT, "orgs");
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((o) => existsSync(join(root, o, "bw.yml")));
}

const CREDS = { BW_CLIENTID: DUMMY_CLIENTID, BW_CLIENTSECRET: DUMMY_CLIENTSECRET, BW_PASSWORD: DUMMY_PASSWORD };

check("--set-creds and --set-password produce an identical plan", () => {
  const known = ["acme", "widgets"];
  const a = planSecrets(["--set-creds", "acme"], known, CREDS);
  const b = planSecrets(["--set-password", "acme"], known, CREDS);
  ok(a.ok && b.ok, "both spellings must plan");
  if (!a.ok || !b.ok) return;
  deepStrictEqual(a.plan, b.plan);
  equal(a.plan.credsOrg, "acme");
  equal(a.plan.credsFlag, "--set-creds");
  deepStrictEqual(a.plan.targets, ["acme"]);
  equal(a.plan.sync, false);
  // a known credential org is processed even when it is not listed
  const c = planSecrets(["--set-password", "widgets"], known, CREDS);
  ok(c.ok && c.plan.targets.includes("widgets"), "the credential org must be a target");
});

check("the plan rejects a credential org with no orgs/<org>/bw.yml", () => {
  const p = planSecrets(["--set-creds", "no-such-org"], ["acme"], CREDS);
  ok(!p.ok, "an unknown org must be rejected");
  if (p.ok) return;
  ok(p.error.includes("no-such-org"), "the diagnostic must name the org");
  ok(!p.error.includes(DUMMY_PASSWORD), "the diagnostic must not carry a credential value");
});

check("the plan rejects a credential flag with no value", () => {
  for (const flag of ["--set-creds", "--set-password"]) {
    const p = planSecrets([flag], ["acme"], CREDS);
    ok(!p.ok, `${flag} without a value must be rejected`);
  }
});

check("the plan rejects both credential flags naming different orgs", () => {
  const p = planSecrets(["--set-creds", "acme", "--set-password", "widgets"], ["acme", "widgets"], CREDS);
  ok(!p.ok, "two different orgs must be rejected");
});

check("the plan rejects an env with no credential material", () => {
  const p = planSecrets(["--set-creds", "acme"], ["acme"], {});
  ok(!p.ok, "an empty env must be rejected");
  if (p.ok) return;
  ok(p.error.includes("CNC_BW_PASSWORD"), "the diagnostic must name the env var");
  ok(!p.error.includes("dummy"), "the diagnostic must not carry a credential value");
});

check("the CLI rejects a credential org that matches no orgs/<org>/bw.yml", () => {
  const home = tempHome();
  const a = runCli(["secrets", "--set-creds", "no-such-org"], home, CREDS);
  const b = runCli(["secrets", "--set-password", "no-such-org"], home, CREDS);
  notEqual(a.code, 0, "--set-creds must exit nonzero");
  notEqual(b.code, 0, "--set-password must exit nonzero");
  ok(a.output.includes("no-such-org"), "the diagnostic must name the org");
  ok(b.output.includes("no-such-org"), "the diagnostic must name the org");
  // the two spellings are indistinguishable: same diagnostic, only the flag name differs
  equal(a.output.split("--set-creds").join("<FLAG>"), b.output.split("--set-password").join("<FLAG>"));
  ok(!a.output.includes(DUMMY_PASSWORD), "no credential value may reach stdout/stderr");
  ok(!b.output.includes(DUMMY_PASSWORD), "no credential value may reach stdout/stderr");
  // a rejected request touches nothing
  ok(!existsSync(join(home, ".cnc")), "a rejected request must not write anything");
});

check("the CLI refuses a request that matches no org, naming it and writing nothing", () => {
  const p = planSecrets(["no-such-org"], ["acme"], CREDS);
  ok(!p.ok, "a request that processes no org must be rejected");
  if (!p.ok) ok(p.error.includes("no-such-org"), "the refusal must name the org");

  const home = tempHome();
  const r = runCli(["secrets", "no-such-org"], home, CREDS);
  notEqual(r.code, 0, "a request matching no org must exit nonzero");
  ok(r.output.includes("no-such-org"), "the refusal must name the org");
  ok(!r.output.includes(DUMMY_PASSWORD), "no credential value may reach stdout/stderr");
  ok(!existsSync(join(home, ".cnc")), "a refused request must not write anything");
});

check("the CLI rejects a credential flag with no value and an env with no credential material", () => {
  const home = tempHome();
  const noValue = runCli(["secrets", "--set-password"], home, CREDS);
  notEqual(noValue.code, 0, "a flag without a value must exit nonzero");
  const org = repoKnownOrgs()[0]!;
  const noMaterial = runCli(["secrets", "--set-creds", org], home);
  notEqual(noMaterial.code, 0, "an env without credential material must exit nonzero");
  ok(noMaterial.output.includes("CNC_BW_PASSWORD"), "the diagnostic must name the env var");
  ok(!existsSync(join(home, ".cnc")), "a rejected request must not write anything");
});

check("writeSecretFile writes <dir>/<org>.secret, mode 600, KEY='value' lines", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "cnc-bw-")), "bw");
  const { path, keys } = writeSecretFile(dir, "acme", {
    BW_CLIENTID: "cid",
    BW_CLIENTSECRET: "csec",
    BW_PASSWORD: "pw'x",
  });
  equal(path, join(dir, "acme.secret"));
  deepStrictEqual(keys, ["BW_CLIENTID", "BW_CLIENTSECRET", "BW_PASSWORD"]);
  equal(readFileSync(path, "utf8"), "BW_CLIENTID='cid'\nBW_CLIENTSECRET='csec'\nBW_PASSWORD='pw'\\''x'\n");
  equal(statSync(path).mode & 0o777, 0o600);
  // no material, no file
  const empty = join(dir, "empty.secret");
  let threw = false;
  try {
    writeSecretFile(dir, "empty", {});
  } catch {
    threw = true;
  }
  ok(threw, "writing without credential material must fail");
  ok(!existsSync(empty), "no file may be written without credential material");
});

check("cnc secrets <org> --set-password <org> writes the same file as --set-creds", () => {
  const orgs = repoKnownOrgs();
  ok(orgs.length > 0, "this repo must have an orgs/<org>/bw.yml to exercise the write path");
  const org = orgs[0]!;

  const homeA = tempHome();
  const a = runCli(["secrets", org, "--set-creds", org], homeA, CREDS);
  equal(a.code, 0, `cnc secrets ${org} --set-creds ${org} must succeed: ${a.output}`);
  const homeB = tempHome();
  const b = runCli(["secrets", org, "--set-password", org], homeB, CREDS);
  equal(b.code, 0, `cnc secrets ${org} --set-password ${org} must succeed: ${b.output}`);

  const fileA = join(homeA, ".cnc", "bw", `${org}.secret`);
  const fileB = join(homeB, ".cnc", "bw", `${org}.secret`);
  ok(existsSync(fileA) && existsSync(fileB), "both spellings must write the secret file");
  equal(statSync(fileA).mode & 0o777, 0o600, "the secret file must be mode 600");
  equal(statSync(fileB).mode & 0o777, 0o600, "the secret file must be mode 600");
  equal(readFileSync(fileB, "utf8"), readFileSync(fileA, "utf8"), "both spellings must write the same file");
  ok(readFileSync(fileB, "utf8").includes(`BW_PASSWORD='${DUMMY_PASSWORD}'`), "the secret file must hold the credential");
  // the file stays in the temp HOME, never the real one
  ok(fileB.startsWith(homeB), "the secret file must stay in the temp HOME");
  for (const out of [a.output, b.output]) {
    ok(!out.includes(DUMMY_PASSWORD), "no credential value may reach stdout/stderr");
    ok(!out.includes(DUMMY_CLIENTSECRET), "no credential value may reach stdout/stderr");
    ok(!out.includes(DUMMY_CLIENTID), "no credential value may reach stdout/stderr");
    ok(out.includes("creds✓"), "the success line stays creds✓");
  }
});

check("the API-key route: CLIENTID+CLIENTSECRET alone plans ok and writes those two keys", () => {
  const apiKeyOnly: CredentialEnv = { BW_CLIENTID: DUMMY_CLIENTID, BW_CLIENTSECRET: DUMMY_CLIENTSECRET };
  const orgs = repoKnownOrgs();
  ok(orgs.length > 0, "this repo must have an orgs/<org>/bw.yml to exercise the write path");
  const org = orgs[0]!;

  // no master password in the env: the API-key pair alone is material
  const p = planSecrets(["--set-password", org], orgs, apiKeyOnly);
  ok(p.ok, "the API-key route must plan without a master password");
  if (p.ok) equal(p.plan.credsOrg, org);

  const dir = join(mkdtempSync(join(tmpdir(), "cnc-bw-apikey-")), "bw");
  const { keys } = writeSecretFile(dir, org, apiKeyOnly);
  deepStrictEqual(keys, ["BW_CLIENTID", "BW_CLIENTSECRET"], "only the two API-key keys may be written");

  const home = tempHome();
  const r = runCli(["secrets", org, "--set-password", org], home, apiKeyOnly);
  equal(r.code, 0, `the API-key route must succeed: ${r.output}`);
  const file = join(home, ".cnc", "bw", `${org}.secret`);
  ok(existsSync(file), "the secret file must be written");
  const body = readFileSync(file, "utf8");
  ok(body.includes("BW_CLIENTID="), "BW_CLIENTID must be written");
  ok(body.includes("BW_CLIENTSECRET="), "BW_CLIENTSECRET must be written");
  ok(!body.includes("BW_PASSWORD"), "a key absent from the env must not be written");
  ok(!r.output.includes(DUMMY_CLIENTID), "no credential value may reach stdout/stderr");
  ok(!r.output.includes(DUMMY_CLIENTSECRET), "no credential value may reach stdout/stderr");
  ok(r.output.includes("creds✓"), "the success line stays creds✓");
});

check("--all targets every known org", () => {
  const known = repoKnownOrgs();
  ok(known.length > 0, "this repo must have an orgs/<org>/bw.yml");

  const p = planSecrets(["--all"], known, CREDS);
  ok(p.ok, "--all must plan");
  if (p.ok) deepStrictEqual(p.plan.targets, known, "--all must target every known org");

  const home = tempHome();
  const r = runCli(["secrets", "--all"], home);
  equal(r.code, 0, `cnc secrets --all must succeed: ${r.output}`);
  for (const org of known) {
    ok(existsSync(join(home, ".cnc", "bw", `${org}.yml`)), `cnc secrets --all must process ${org}`);
  }
});

check("a listed org with no bw.yml is skipped, the credential org is still processed", () => {
  const org = repoKnownOrgs()[0]!;
  const home = tempHome();
  const r = runCli(["secrets", "no-such-org", "--set-password", org], home, CREDS);
  equal(r.code, 0, `the credential org must still be processed: ${r.output}`);
  ok(r.output.includes("no-such-org"), "the skipped org must be named");
  ok(existsSync(join(home, ".cnc", "bw", `${org}.secret`)), "the credential org must still get its secret file");
});

check("positionalOrgs reads the org arguments, not the flags", () => {
  deepStrictEqual(positionalOrgs(["acme", "--set-creds", "widgets", "--sync"]), ["acme"]);
  deepStrictEqual(positionalOrgs(["--set-password", "widgets", "acme"]), ["acme"]);
  deepStrictEqual(positionalOrgs(["--all"]), []);
});

for (const home of homes) rmSync(home, { recursive: true, force: true });
console.log(`\n${checks} checks passed`);
