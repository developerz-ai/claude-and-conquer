// bun:test suite for the fleet inventory loaders (scripts/lib/inventory.ts,
// scripts/lib/projects.ts): repo-root resolution and the YAML they read.
// Path expectations are POSIX (repo targets Linux boxes and ubuntu CI).
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadTeams, REPO_ROOT, repoRootFromModuleUrl, type Team } from "./inventory.ts";
import { loadProjects, type Project } from "./projects.ts";

describe("repoRootFromModuleUrl", () => {
  test("decodes percent-encoded URLs (spaces, non-ASCII)", () => {
    expect(
      repoRootFromModuleUrl("file:///home/u/my%20repos/k%C3%B8%20cnc/scripts/lib/inventory.ts"),
    ).toBe("/home/u/my repos/kø cnc");
  });

  test("leaves ordinary URLs unchanged", () => {
    expect(repoRootFromModuleUrl("file:///home/u/cnc/scripts/lib/inventory.ts")).toBe("/home/u/cnc");
    expect(repoRootFromModuleUrl(new URL("file:///home/u/cnc/scripts/lib/inventory.ts"))).toBe(
      "/home/u/cnc",
    );
  });
});

describe("the real checkout", () => {
  test("REPO_ROOT resolves cleanly and both loaders run", () => {
    expect(REPO_ROOT).not.toMatch(/%[0-9A-Fa-f]{2}/);
    expect(existsSync(join(REPO_ROOT, "fleet", "teams"))).toBe(true);
    expect(statSync(join(REPO_ROOT, "fleet", "teams")).isDirectory()).toBe(true);
    expect(Array.isArray(loadTeams())).toBe(true);
    expect(Array.isArray(loadProjects())).toBe(true);
  });
});

describe("encoded checkout path — the ENOENT this guards", () => {
  test("loaders work from a root whose path has a space and 'ø'", async () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), "cnc root ø-"));
    const lib = join(root, "scripts", "lib");
    mkdirSync(lib, { recursive: true });
    mkdirSync(join(root, "fleet", "teams"), { recursive: true });
    mkdirSync(join(root, "projects", "acme", "api"), { recursive: true });
    for (const f of ["inventory.ts", "projects.ts"]) {
      writeFileSync(join(lib, f), readFileSync(join(REPO_ROOT, "scripts", "lib", f)));
    }
    writeFileSync(
      join(root, "fleet", "teams", "team-a.yml"),
      [
        "id: team-a",
        "host: team-a.infra.example.com",
        "ssh_user: operator",
        "claude:",
        "  email: agent-team-a@example.com",
        "",
      ].join("\n"),
    );
    writeFileSync(join(root, "projects", "acme", "api", "project.yml"), "pool: default\n");
    try {
      const inv = await import(pathToFileURL(join(lib, "inventory.ts")).href);
      const projects = await import(pathToFileURL(join(lib, "projects.ts")).href);
      expect(inv.REPO_ROOT).toBe(root);
      expect(inv.loadTeams().map((t: Team) => t.id)).toContain("team-a");
      expect(projects.loadProjects().map((p: Project) => `${p.org}/${p.repo}`)).toContain(
        "acme/api",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
