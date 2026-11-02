// Credential command — the rules, in one pure place.
//
// `cnc secrets` takes the credential org from --set-creds <org> OR --set-password <org>:
// the two spellings are EXACT aliases (same org, same env vars, same file, same exit code).
// Every rejection rule lives here so the CLI can refuse a bad request BEFORE it touches the
// disk (no mkdir, no bw download, no writes) and so the check script can exercise the rules
// offline, against a temp dir, with dummy values only.
//
// Credential material comes from the env ONLY — never argv, never the repo. Diagnostics may
// name env-var KEYS and the file path; they never carry a value.
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

/** Credential material — env only, never argv, never the repo. */
export interface CredentialEnv {
  BW_CLIENTID?: string;
  BW_CLIENTSECRET?: string;
  BW_PASSWORD?: string;
}

/** The canonical credential flag. --set-password is an exact alias of --set-creds. */
export const CREDS_FLAG = "--set-creds" as const;

/** Every spelling of the credential flag the CLI accepts. */
export const CREDS_FLAG_ALIASES = ["--set-creds", "--set-password"] as const;
export type CredsFlag = (typeof CREDS_FLAG_ALIASES)[number];

/** The keys written to ~/.cnc/bw/<org>.secret, in file order. */
export const CREDS_KEYS = ["BW_CLIENTID", "BW_CLIENTSECRET", "BW_PASSWORD"] as const;

export interface SecretsPlan {
  /** orgs to process — every one of them has an orgs/<org>/bw.yml */
  targets: string[];
  /** the org whose credentials are being set, when a credential flag was given */
  credsOrg?: string;
  /** the canonical credential flag this plan is about */
  credsFlag?: typeof CREDS_FLAG;
  /** render ~/workspace/<org>/.env from the vault after copying the config */
  sync: boolean;
}

export type PlanResult = { ok: true; plan: SecretsPlan } | { ok: false; error: string };

/** The org arguments: neither flags nor flag values. */
export function positionalOrgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      if ((CREDS_FLAG_ALIASES as readonly string[]).includes(a)) i++; // the flag takes a value
      continue;
    }
    if (a.startsWith("-")) continue;
    out.push(a);
  }
  return out;
}

/** Is there credential material in the env? A master password, or an API-key pair. */
export function hasMaterial(creds: CredentialEnv): boolean {
  if (creds.BW_PASSWORD?.trim()) return true;
  return Boolean(creds.BW_CLIENTID?.trim() && creds.BW_CLIENTSECRET?.trim());
}

/**
 * Turn argv into a validated plan. Pure: no filesystem, no network, no writes.
 * A rejection comes back as { ok: false, error } — the caller turns that into exit 1
 * before it touches the disk.
 */
export function planSecrets(argv: string[], knownOrgs: string[], creds: CredentialEnv): PlanResult {
  const known = new Set(knownOrgs);

  // 1. the credential flag: --set-creds and --set-password are exact aliases.
  const asked: { flag: CredsFlag; org: string }[] = [];
  for (const f of CREDS_FLAG_ALIASES) {
    const i = argv.indexOf(f);
    if (i < 0) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      return {
        ok: false,
        error: `${f}: needs an <org> — usage: cnc secrets <org>... | --all  [--set-creds <org> | --set-password <org>] [--sync]`,
      };
    }
    asked.push({ flag: f, org: value });
  }
  if (asked.length === 2 && asked[0]!.org !== asked[1]!.org) {
    return {
      ok: false,
      error: `--set-creds and --set-password are aliases — they must name the same org (got "${asked[0]!.org}" and "${asked[1]!.org}")`,
    };
  }

  const credsOrg = asked[0]?.org;
  const flag = asked[0]?.flag ?? CREDS_FLAG;

  // 2. the credential org must be a known org: orgs/<org>/bw.yml has to exist.
  if (credsOrg !== undefined && !known.has(credsOrg)) {
    return {
      ok: false,
      error: `${flag}: unknown org "${credsOrg}" — no orgs/${credsOrg}/bw.yml (known: ${knownOrgs.join(", ") || "(none)"})`,
    };
  }

  // 3. the env must carry credential material — the diagnostic names keys, never values.
  if (credsOrg !== undefined && !hasMaterial(creds)) {
    return {
      ok: false,
      error: `${flag}: needs $CNC_BW_PASSWORD, or $CNC_BW_CLIENTID + $CNC_BW_CLIENTSECRET`,
    };
  }

  // 4. the orgs to process: the listed ones that have a bw.yml, plus the credential org.
  const positionals = positionalOrgs(argv);
  const all = argv.includes("--all") || positionals.includes("all");
  const wanted = all ? knownOrgs : positionals.filter((o) => o !== "all");
  const targets: string[] = [];
  for (const org of wanted) if (known.has(org) && !targets.includes(org)) targets.push(org);
  // a known credential org is always processed, listed or not
  if (credsOrg !== undefined && !targets.includes(credsOrg)) targets.push(credsOrg);

  if (targets.length === 0) {
    // name the orgs that matched nothing — the known list alone never says what was asked for
    const unmatched = positionals.filter((o) => o !== "all" && !known.has(o));
    return {
      ok: false,
      error: `no org with a bw config to process — unmatched org(s): ${unmatched.join(", ") || "(none)"} (known: ${knownOrgs.join(", ") || "(none)"}) — usage: cnc secrets <org>... | --all  [--set-creds <org> | --set-password <org>] [--sync]`,
    };
  }

  const plan: SecretsPlan = { targets, sync: argv.includes("--sync") };
  if (credsOrg !== undefined) {
    plan.credsOrg = credsOrg;
    plan.credsFlag = CREDS_FLAG;
  }
  return { ok: true, plan };
}

/**
 * Write ~/.cnc/bw/<org>.secret — mode 600, KEY='value' lines.
 * Returns the path and the keys written; the values never leave this function.
 */
export function writeSecretFile(
  dir: string,
  org: string,
  creds: CredentialEnv,
): { path: string; keys: string[] } {
  const keys = CREDS_KEYS.filter((k) => creds[k]?.trim());
  if (keys.length === 0) throw new Error("no credential material to write");
  const body = keys.map((k) => `${k}=${quote(creds[k]!)}`).join("\n") + "\n";
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${org}.secret`);
  writeFileSync(path, body, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { path, keys: [...keys] };
}

/** Single-quote a value for the KEY='value' file format. */
function quote(v: string): string {
  return `'${v.replaceAll("'", `'\\''`)}'`;
}
