// cnc gh-setup <selector> [--key <path>] — give boxes the operator's GitHub identity.
//
// Copies THIS machine's ssh key + `gh` token to each selected box so it can clone private
// repos and push PRs as the same account. Reuses the local `gh auth token` (piped over stdin,
// never printed) and the local key (default ~/.ssh/id_ed25519 — your GitHub SSH key).
// The key/token are the operator's own creds going onto the operator's own boxes; nothing is
// written to this repo.
import { selectTeams, type Team } from "../lib/inventory.ts";
import { sshTarget, sshExec } from "../lib/ssh.ts";
import { c, fail } from "../lib/cli.ts";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const argv = process.argv.slice(2);
const keyArg = ((i) => (i >= 0 ? argv[i + 1] : undefined))(argv.indexOf("--key"));
const keyPath = (keyArg ?? join(homedir(), ".ssh", "id_ed25519")).replace(/^~/, homedir());
const sel = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--key");
if (sel.length === 0 && !argv.includes("--all")) fail("usage: cnc gh-setup [--all | --pool <p> | <team>...] [--key <path>]");
if (!existsSync(keyPath) || !existsSync(`${keyPath}.pub`)) fail(`key not found: ${keyPath}(.pub)`);
const teams = selectTeams([...sel, ...(argv.includes("--all") ? ["--all"] : [])]);

const token = new TextDecoder().decode(Bun.spawnSync(["gh", "auth", "token"]).stdout).trim();
if (!token) fail("no local `gh auth token` — run `gh auth login` here first");
const keyName = basename(keyPath);

const SSH_OPTS = ["-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes"];
async function scp(t: Team, files: string[]) {
  const args = ["scp", ...SSH_OPTS, ...(t.ssh_port ? ["-P", String(t.ssh_port)] : []), ...files, `${sshTarget(t)}:.ssh/`];
  return (await Bun.spawn(args, { stdout: "ignore", stderr: "ignore" }).exited) === 0;
}

const CONFIGURE =
  `chmod 600 ~/.ssh/${keyName}; chmod 644 ~/.ssh/${keyName}.pub; ` +
  `ssh-keyscan -t ed25519,rsa github.com 2>/dev/null >> ~/.ssh/known_hosts; sort -u ~/.ssh/known_hosts -o ~/.ssh/known_hosts; ` +
  `grep -q "Host github.com" ~/.ssh/config 2>/dev/null || printf 'Host github.com\\n  HostName github.com\\n  User git\\n  IdentityFile ~/.ssh/${keyName}\\n  IdentitiesOnly yes\\n' >> ~/.ssh/config; chmod 600 ~/.ssh/config`;

const ENSURE_GH =
  `command -v gh >/dev/null || (sudo mkdir -p -m 755 /etc/apt/keyrings && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null && sudo apt-get update -qq && sudo apt-get install -y -qq gh)`;

for (const t of teams) {
  const log: string[] = [];
  await sshExec(t, "mkdir -p ~/.ssh && chmod 700 ~/.ssh");
  await sshExec(t, ENSURE_GH, { timeoutMs: 180_000 });
  log.push((await scp(t, [keyPath, `${keyPath}.pub`])) ? c.green("key✓") : c.red("key✗"));
  await sshExec(t, CONFIGURE);
  const auth = await sshExec(t, "gh auth login --hostname github.com --with-token && gh auth setup-git 2>/dev/null", { stdin: token });
  log.push(auth.code === 0 ? c.green("gh✓") : c.red("gh✗"));
  const v = await sshExec(t, "ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -T git@github.com 2>&1 | head -1");
  const who = v.stdout.match(/Hi (\S+?)!/)?.[1];
  log.push(who ? c.green(`git@github:${who}`) : c.yellow("git-auth?"));
  console.log(`${c.bold(t.id)}  ${log.join("  ")}`);
}
console.log(c.dim("\nrepos will clone on next `cnc bootstrap <team>` (or `cnc provision`)."));
