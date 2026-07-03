// cnc deploy-check <org/repo> — flight-controller verification that work SHIPPED.
// Merged PRs mean nothing until the deploy is live: hit every health URL.
import { findProject } from "../lib/projects.ts";
import { c, fail } from "../lib/cli.ts";

const orgRepo = process.argv[2];
if (!orgRepo) fail("usage: cnc deploy-check <org/repo>");
const p = findProject(orgRepo);
const urls = [
  ...new Set([...(p.deploy?.health ?? []), ...(p.deploy?.url ? [p.deploy.url] : [])]),
];
if (urls.length === 0) {
  fail(`${orgRepo} has no deploy.health/deploy.url in ${p.dir}/project.yml`);
}

let ok = true;
for (const url of urls) {
  try {
    const started = performance.now();
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const ms = Math.round(performance.now() - started);
    const good = res.ok;
    ok &&= good;
    console.log(`${good ? c.green("✓") : c.red("✗")} ${url} → ${res.status} (${ms}ms)`);
  } catch (e) {
    ok = false;
    console.log(`${c.red("✗")} ${url} → ${(e as Error).message}`);
  }
}

if (p.deploy?.method === "gitops-argocd") {
  console.log(
    c.dim(
      `\ngitops: merged main → image built → ArgoCD rolls it out. Stack: ${p.deploy.infra_repo ?? "?"}/${p.deploy.stack ?? "?"}`,
    ),
  );
}
process.exit(ok ? 0 : 1);
