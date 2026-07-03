// Tiny CLI output helpers — no dependencies.
const isTTY = process.stdout.isTTY ?? false;

export const c = {
  green: (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
};

export function table(headers: string[], rows: string[][]): void {
  const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => plain(r[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell + " ".repeat(widths[i] - plain(cell).length))
      .join("  ");
  console.log(c.bold(line(headers)));
  console.log(c.dim(widths.map((w) => "-".repeat(w)).join("  ")));
  for (const r of rows) console.log(line(r));
}

export function fail(msg: string): never {
  console.error(c.red(`error: ${msg}`));
  process.exit(1);
}
