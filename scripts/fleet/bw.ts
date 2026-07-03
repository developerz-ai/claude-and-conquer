// cnc bw <org> [-- <bw args...>] — access an org's Bitwarden vault on the MAIN box.
//
// Bitwarden lives only here (the controller), so any Claude session on the main box can pull a
// secret when it needs one. Unlocks with the org's stored creds (~/.cnc/bw/<org>.secret, isolated
// per-org data dir), then runs the given bw subcommand with a live session. No args → status.
//   cnc bw acme                           # unlock + show item count
//   cnc bw acme -- list items             # raw bw, session injected
//   cnc bw acme -- get notes ".env webapp"
import { c, fail } from "../lib/cli.ts";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const org = argv[0];
if (!org || org.startsWith("-")) fail("usage: cnc bw <org> [-- <bw args...>]");
const sep = argv.indexOf("--");
const bwArgs = sep >= 0 ? argv.slice(sep + 1) : [];

const HOME = homedir();
const secretPath = join(HOME, ".cnc", "bw", `${org}.secret`);
const cfgPath = join(HOME, ".cnc", "bw", `${org}.yml`);
if (!existsSync(secretPath) || !existsSync(cfgPath)) fail(`no BW creds for ${org} — run: cnc secrets ${org} --set-creds ${org}`);

const cfg = Bun.YAML.parse(readFileSync(cfgPath, "utf8")) as { server: string; account: string };
const secret: Record<string, string> = {};
for (const line of readFileSync(secretPath, "utf8").split("\n")) {
  if (/^\s*#/.test(line)) continue;
  const m = line.match(/^\s*(\w+)\s*=\s*['"]?(.*?)['"]?\s*$/);
  if (m) secret[m[1]] = m[2];
}
const env: Record<string, string> = {
  ...(process.env as Record<string, string>),
  PATH: `${join(HOME, ".local", "bin")}:${process.env.PATH ?? ""}`,
  BITWARDENCLI_APPDATA_DIR: join(HOME, ".cnc", "bw", `${org}.data`),
  BW_PASSWORD: secret.BW_PASSWORD ?? "",
  ...(secret.BW_CLIENTID ? { BW_CLIENTID: secret.BW_CLIENTID, BW_CLIENTSECRET: secret.BW_CLIENTSECRET ?? "" } : {}),
};

async function bw(a: string[], extra: Record<string, string> = {}) {
  const p = Bun.spawn(["bw", ...a], { env: { ...env, ...extra }, stdout: "pipe", stderr: "pipe" });
  const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  return { code, out: out.trim() };
}

await bw(["config", "server", cfg.server]);
if ((await bw(["login", "--check"])).code !== 0) await bw(["login", "--apikey"]);
const unlock = await bw(["unlock", "--passwordenv", "BW_PASSWORD", "--raw"]);
if (unlock.code !== 0) fail(`unlock failed for ${org} — check creds in ~/.cnc/bw/${org}.secret`);
const session = unlock.out;
await bw(["sync"], { BW_SESSION: session });

if (bwArgs.length === 0) {
  const items = await bw(["list", "items"], { BW_SESSION: session });
  let n = 0;
  try { n = JSON.parse(items.out).length; } catch {}
  console.log(`${c.green(org)} unlocked · ${n} items · ${cfg.server}`);
  console.log(c.dim(`  cnc bw ${org} -- list items   |   cnc bw ${org} -- get notes "<item name>"`));
} else {
  const p = Bun.spawn(["bw", ...bwArgs, "--session", session], { env, stdout: "inherit", stderr: "inherit" });
  process.exit(await p.exited);
}
