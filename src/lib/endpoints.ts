import type { Origin } from "./types";

export type EndpointKind = "bootstrap" | "usage" | "billing" | "completion" | "org" | "subscription";

export type EndpointMatch = { origin: Origin; kind: EndpointKind };

const PATTERNS: Array<{ test: RegExp; origin: Origin; kind: EndpointKind }> = [
  // Order matters: more specific patterns first.

  // /api/bootstrap[/...] — auth bootstrap
  { test: /^https:\/\/claude\.ai\/api\/bootstrap(\/|$|\?)/, origin: "claude.ai", kind: "bootstrap" },

  // /api/organizations/{orgId}/usage — primary usage endpoint
  { test: /^https:\/\/claude\.ai\/api\/organizations\/[^/?#]+\/usage(\/|$|\?|#)/, origin: "claude.ai", kind: "usage" },

  // /api/organizations/{orgId}/subscription_status — plan/tier info
  { test: /^https:\/\/claude\.ai\/api\/organizations\/[^/?#]+\/subscription_status(\/|$|\?|#)/, origin: "claude.ai", kind: "subscription" },

  // /api/organizations/{orgId}/is_pure_usage_based — enterprise-vs-pro flag
  { test: /^https:\/\/claude\.ai\/api\/organizations\/[^/?#]+\/is_pure_usage_based(\/|$|\?|#)/, origin: "claude.ai", kind: "subscription" },

  // /api/organizations/{orgId} (bare) — org settings and plan name
  { test: /^https:\/\/claude\.ai\/api\/organizations\/[^/?#]+(?:[?#].*)?$/, origin: "claude.ai", kind: "org" },

  // /api/organizations/{orgId}/.../completion — chat send (rate-limit headers may live here)
  { test: /^https:\/\/claude\.ai\/api\/organizations\/[^/?#]+\/.*completion/, origin: "claude.ai", kind: "completion" },

  // console.anthropic.com billing
  { test: /^https:\/\/console\.anthropic\.com\/api\/billing/, origin: "console.anthropic.com", kind: "billing" },
  { test: /^https:\/\/console\.anthropic\.com\/api\/.*\/(usage|spend)/, origin: "console.anthropic.com", kind: "billing" },
];

export function matchEndpoint(url: string): EndpointMatch | null {
  for (const { test, origin, kind } of PATTERNS) {
    if (test.test(url)) return { origin, kind };
  }
  return null;
}

export const ACTIVE_FETCH_TARGETS: Record<Origin, string[]> = {
  "claude.ai": [
    "https://claude.ai/api/bootstrap",
    "https://claude.ai/api/organizations/{orgId}/usage",
  ],
  "console.anthropic.com": [
    "https://console.anthropic.com/api/billing/usage",
  ],
};
