import type { Origin } from "./types";

export type EndpointKind = "bootstrap" | "usage" | "billing" | "completion";

export type EndpointMatch = { origin: Origin; kind: EndpointKind };

const PATTERNS: Array<{ test: RegExp; origin: Origin; kind: EndpointKind }> = [
  { test: /^https:\/\/claude\.ai\/api\/bootstrap(\/|$|\?)/, origin: "claude.ai", kind: "bootstrap" },
  { test: /^https:\/\/claude\.ai\/api\/organizations\/[^/]+\/usage/, origin: "claude.ai", kind: "usage" },
  { test: /^https:\/\/claude\.ai\/api\/organizations\/[^/]+\/.*completion/, origin: "claude.ai", kind: "completion" },
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
