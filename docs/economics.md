# Economics — why pool subscriptions

Claude subscriptions are heavily subsidized relative to API pricing. As of mid-2026, documented power-user numbers:

- ~10B tokens over 8 months on a $100/mo Max sub — $15,000+ API-equivalent for $800 (**~94% saved**).
- $1,588 of API-equivalent tokens in one month on a $200 Max 20x plan (**~8x**).
- Typical heavy Claude Code usage runs **15–30× cheaper** on a subscription than per-token API.
- Break-even is tiny: ~$3.33/day API-equivalent on Max 5x, ~$6.67/day on Max 20x. A single busy claudetm session clears that before lunch.

The consequence: **the unit of coding capacity is a Max subscription running near its window limits.** One sub can't parallelize past its 5h-window caps — but N subs on N VPSes can. That's this repo: keep every subscription in the pool warm (but not throttled — see the `CNC_BURN_LIMIT` pre-flight in dispatch), spread goals across teams, and measure yield with `cnc usage` (ccusage API-equivalent dollars = value extracted per sub).

Rules of thumb:

- A sub sitting idle is wasted subsidy; a sub pinned at its cap blocks its team. `cnc usage --days 1` daily; rebalance pools when one team is consistently hot.
- Prefer more Max 5x boxes over fewer 20x boxes for wide parallel work — window caps are per-account, so more accounts = more concurrent claudetm sessions.
- Sources: [Apiyi cost analysis](https://help.apiyi.com/en/claude-max-vs-api-pay-per-use-pricing-comparison-claude-code-savings-guide-en.html) · [Product Compass](https://www.productcompass.pm/p/claude-code-pricing) · [Build This Now break-even guide](https://www.buildthisnow.com/blog/guide/development/claude-code-max-plan-vs-api) · [IntuitionLabs pricing](https://intuitionlabs.ai/articles/claude-pricing-plans-api-costs) (all as of 2026-07).
