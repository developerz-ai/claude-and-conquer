// cnc provision <selector> [--persist] [--sync] — one-shot new-box setup.
// Runs, per selected team: bootstrap -> optimize -> secrets (push per-org BW config).
// This is the "stand up / re-tune a dev box" button the add-server skill drives.
//   --persist  optimize also writes fstab + GRUB mitigations=off (reboot needed)
//   --sync     secrets also renders ~/workspace/<org>/.env (needs creds already set)
import { selectTeams, REPO_ROOT } from "../lib/inventory.ts";
import { sshExec } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

// GLM boxes run z.ai for tokens, but claudetm still preflights ~/.claude/.credentials.json.
// Seed it from this (main) box so the gate passes; the z.ai key (ANTHROPIC_API_KEY, injected at
// dispatch) then takes precedence so calls route to z.ai, never burning the Anthropic sub.
async function seedCreds(t: ReturnType<typeof selectTeams>[number]) {
  const src = join(homedir(), ".claude", ".credentials.json");
  if (!existsSync(src)) {
    console.log(c.yellow("  no local ~/.claude/.credentials.json to seed — log Claude in on main first"));
    return;
  }
  const r = await sshExec(
    t,
    "mkdir -p ~/.claude && umask 077 && cat > ~/.claude/.credentials.json && chmod 600 ~/.claude/.credentials.json",
    { stdin: readFileSync(src, "utf8") },
  );
  console.log(r.code === 0
    ? c.dim("  seeded ~/.claude/.credentials.json (claudetm gate)")
    : c.yellow(`  cred seed failed: ${r.stderr || r.stdout}`));
}

const argv = process.argv.slice(2);
const persist = argv.includes("--persist");
const sel = argv.filter((a) => a !== "--persist");
if (sel.length === 0) fail("usage: cnc provision [--all | --pool <p> | <team>...] [--persist]");
const teams = selectTeams(sel);
if (teams.length === 0) fail("no teams matched the selector");

const CNC = join(REPO_ROOT, "bin", "cnc");
function run(args: string[]) {
  console.log(c.dim(`\n$ cnc ${args.join(" ")}`));
  const p = Bun.spawnSync([CNC, ...args], { stdio: ["inherit", "inherit", "inherit"] });
  if (p.exitCode) console.log(c.yellow(`  (${args[0]} exited ${p.exitCode} — continuing)`));
}

for (const t of teams) {
  console.log(c.bold(`\n══ provisioning ${t.id} (${t.ssh_user}@${t.host}) ══`));
  run(["gh-setup", t.id]); // operator's GitHub identity first, so bootstrap can clone private repos
  run(["bootstrap", t.id]);
  run(["optimize", t.id, ...(persist ? ["--persist"] : [])]);
  if ((t.agent ?? "claude") === "glm" && !t.local) {
    console.log(c.dim("  glm box: seeding Claude creds for claudetm preflight"));
    await seedCreds(t);
  }
}
// Note: Bitwarden secrets are NOT provisioned per box — they live on the main controller only
// (`cnc secrets`). Workers are pure Claude-Max coding boxes.
const needLogin = teams.filter((t) => (t.agent ?? "claude") !== "glm" && !t.local);
if (needLogin.length) {
  console.log(c.bold("\nhuman steps left (Claude OAuth — cannot be automated):"));
  for (const t of needLogin) console.log(`  cnc ssh ${t.id} --login`);
} else {
  console.log(c.dim("\nno human login step needed (GLM boxes use z.ai; creds seeded from main)."));
}
