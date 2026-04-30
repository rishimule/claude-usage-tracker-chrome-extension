import type { Plan } from "./types";

const PRO_DISCRIMINATORS = ["claude_pro", "pro", "individual_pro"];
const TEAM_DISCRIMINATORS = ["claude_team", "team", "small_business"];
const ENTERPRISE_DISCRIMINATORS = ["enterprise", "claude_enterprise"];
const FREE_DISCRIMINATORS = ["free", "claude_free", "individual_free"];
const API_DISCRIMINATORS = ["api", "developer", "console"];

export function detectPlan(payload: unknown): Plan {
  if (!isObject(payload)) return "Unknown";

  const tier = readTierString(payload);
  if (tier) {
    if (matches(tier, ENTERPRISE_DISCRIMINATORS)) return "Enterprise";
    if (matches(tier, TEAM_DISCRIMINATORS)) return "Team";
    if (matches(tier, PRO_DISCRIMINATORS)) return "Pro";
    if (matches(tier, FREE_DISCRIMINATORS)) return "Free";
    if (matches(tier, API_DISCRIMINATORS)) return "API";
  }

  if ("workspace" in payload && isObject(payload.workspace)) {
    if ("billing" in payload.workspace || "monthly_spend" in payload.workspace) return "API";
  }

  if ("extra_usage" in payload && isObject(payload.extra_usage)) {
    if ("monthly_limit" in payload.extra_usage) return "Enterprise";
  }

  return "Unknown";
}

function readTierString(payload: Record<string, unknown>): string | null {
  const candidates = [
    "organization_type",
    "subscription_tier",
    "tier",
    "plan",
    "plan_name",
  ];
  if (isObject(payload.organization)) {
    const org = payload.organization;
    if (isObject(org.settings)) {
      for (const key of candidates) {
        const v = org.settings[key];
        if (typeof v === "string") return v.toLowerCase();
      }
    }
    for (const key of candidates) {
      const v = org[key];
      if (typeof v === "string") return v.toLowerCase();
    }
  }
  for (const key of candidates) {
    const v = payload[key];
    if (typeof v === "string") return v.toLowerCase();
  }
  return null;
}

function matches(value: string, list: readonly string[]): boolean {
  return list.some((d) => value === d || value.includes(d));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
