// SSH primitives. All remote execution in this repo goes through here.
import type { Team } from "./inventory.ts";

export interface ExecResult {
  team: string;
  code: number;
  stdout: string;
  stderr: string;
}

export function sshTarget(team: Team): string {
  return `${team.ssh_user}@${team.host}`;
}

function baseArgs(team: Team, batch: boolean): string[] {
  const args = ["ssh"];
  if (batch) args.push("-o", "BatchMode=yes");
  args.push("-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=accept-new");
  if (team.ssh_port) args.push("-p", String(team.ssh_port));
  args.push(sshTarget(team));
  return args;
}

/** Run a command on the team VPS non-interactively. Optional stdin payload. */
export async function sshExec(
  team: Team,
  command: string,
  opts: { stdin?: string; timeoutMs?: number } = {},
): Promise<ExecResult> {
  // Login shell so PATH includes ~/.bun/bin, ~/.local/bin (claude, claudetm, bun).
  // A `local` team (the main controller box) runs commands right here — no ssh.
  const spawnArgs = team.local
    ? ["bash", "-lc", command]
    : [...baseArgs(team, true), `bash -lc ${shq(command)}`];
  const proc = Bun.spawn(spawnArgs, {
    stdin: opts.stdin !== undefined ? new TextEncoder().encode(opts.stdin) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = opts.timeoutMs ?? 60_000;
  const killer = setTimeout(() => proc.kill(), timeout);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(killer);
  return { team: team.id, code, stdout: stdout.trim(), stderr: stderr.trim() };
}

/** Replace this process with an interactive ssh session (operator use). */
export function sshInteractive(team: Team, command?: string): never {
  if (team.local) {
    const proc = Bun.spawnSync(command ? ["bash", "-lc", command] : ["bash", "-l"], { stdio: ["inherit", "inherit", "inherit"] });
    process.exit(proc.exitCode ?? 1);
  }
  const args = baseArgs(team, false);
  args.splice(1, 0, "-t");
  if (command) args.push(`bash -lc ${shq(command)}`);
  const proc = Bun.spawnSync(args, { stdio: ["inherit", "inherit", "inherit"] });
  process.exit(proc.exitCode ?? 1);
}

/** Single-quote a string for POSIX shells. */
export function shq(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

/** Run fn over teams concurrently, preserving order. */
export async function mapTeams<T>(
  teams: Team[],
  fn: (t: Team) => Promise<T>,
): Promise<T[]> {
  return Promise.all(teams.map(fn));
}
