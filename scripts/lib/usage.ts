// Subscription burn gauge — reads the ACTIVE 5h billing block on a team's box
// via ccusage. Used as a pre-flight check before dispatching goals: claudetm
// runs subagents in parallel and can exhaust a Max window fast.
import type { Team } from "./inventory.ts";
import { sshExec } from "./ssh.ts";

export interface ActiveBlock {
  costUSD: number; // API-equivalent cost of the active block
  totalTokens: number;
}

export async function activeBlock(team: Team): Promise<ActiveBlock | null> {
  const r = await sshExec(team, `bunx ccusage@latest blocks --json --active`, {
    timeoutMs: 120_000,
  });
  if (r.code !== 0) return null;
  try {
    const data = JSON.parse(r.stdout);
    const block = (data.blocks ?? []).find((b: any) => b.isActive) ?? data.blocks?.[0];
    if (!block) return { costUSD: 0, totalTokens: 0 };
    return {
      costUSD: block.costUSD ?? 0,
      totalTokens: block.totalTokens ?? 0,
    };
  } catch {
    return null;
  }
}

/** Burn ceiling per active block (API-equiv USD) before dispatch refuses. */
export const BURN_LIMIT = Number(process.env.CNC_BURN_LIMIT ?? 50);
