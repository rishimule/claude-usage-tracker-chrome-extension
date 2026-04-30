// src/lib/types.ts

export type Plan = "Free" | "Pro" | "Team" | "Enterprise" | "API" | "Unknown";

export type MessageMetric = {
  type: "messages";
  remaining: number;
  resetsAt: number; // epoch ms
  window: "5h" | "daily";
};

export type SpendMetric = {
  type: "spend";
  usedCents: number;
  limitCents: number;
  pct: number; // 0..100, integer
};

export type RateMetric = {
  type: "rate";
  pct: number; // 0..100, integer
  resetsAt: number; // epoch ms
  window: "5h" | "7d";
};

export type Metric = MessageMetric | SpendMetric | RateMetric;

export type State =
  | { kind: "loading" }
  | { kind: "error"; reason: "unauth" | "network" | "parse" | "unknown" }
  | {
      kind: "ok";
      plan: Plan;
      metric: Metric;
      freshAt: number; // epoch ms
      degraded?: boolean;
    };

export type Origin = "claude.ai" | "console.anthropic.com";
