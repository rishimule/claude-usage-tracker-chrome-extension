import type { Metric, Plan } from "./types";

export function parseUsage(plan: Plan, payload: unknown): Metric | null {
  if (!isObject(payload)) return null;

  if (plan === "Free" || plan === "Pro" || plan === "Team") {
    return parseMessages(payload) ?? parseRate(payload);
  }
  if (plan === "Enterprise") {
    return parseSpend(payload);
  }
  if (plan === "API") {
    return parseSpend(payload);
  }
  return null;
}

function parseMessages(payload: Record<string, unknown>): Metric | null {
  const blocks = [payload, payload.limits, payload.rate_limits, payload.message_rate_limit].filter(isObject);
  for (const block of blocks) {
    const remaining = readNumber(block, ["remaining", "messages_remaining", "remaining_messages"]);
    const resetsAt = readEpochMs(block, ["resets_at", "reset_at", "next_reset"]);
    if (remaining !== null && resetsAt !== null) {
      const windowKey = readString(block, ["window"]);
      const window: "5h" | "daily" =
        windowKey === "daily" || windowKey === "1d" ? "daily" : "5h";
      return { type: "messages", remaining, resetsAt, window };
    }
  }
  return null;
}

function parseRate(payload: Record<string, unknown>): Metric | null {
  const blocks = [payload.rate_limits, payload].filter(isObject);
  for (const block of blocks) {
    const five = isObject(block.five_hour) ? block.five_hour : null;
    const seven = isObject(block.seven_day) ? block.seven_day : null;
    const target = five ?? seven;
    if (!target) continue;
    const pctRaw = readNumber(target, ["used_percentage", "utilization", "percent_used"]);
    const reset = readEpochMs(target, ["resets_at", "reset_at"]);
    if (pctRaw === null || reset === null) continue;
    const pct = Math.max(0, Math.min(100, Math.round(pctRaw)));
    const window: "5h" | "7d" = five ? "5h" : "7d";
    return { type: "rate", pct, resetsAt: reset, window };
  }
  return null;
}

function parseSpend(payload: Record<string, unknown>): Metric | null {
  const candidates: Array<Record<string, unknown>> = [];
  candidates.push(payload);
  if (isObject(payload.extra_usage)) candidates.push(payload.extra_usage);
  if (isObject(payload.workspace)) candidates.push(payload.workspace);
  if (isObject(payload.workspace) && isObject(payload.workspace.billing)) {
    candidates.push(payload.workspace.billing);
  }

  for (const block of candidates) {
    const usedCents =
      readCents(block, ["used_credits", "used_cents", "spend_cents", "current_spend_cents"]) ??
      dollarsToCents(readNumber(block, ["used_dollars", "spend_dollars", "current_spend"]));
    const limitCents =
      readCents(block, ["monthly_limit", "limit_cents", "spend_limit_cents", "monthly_limit_cents"]) ??
      dollarsToCents(readNumber(block, ["monthly_limit_dollars", "spend_limit_dollars", "limit_dollars"]));

    if (usedCents !== null && limitCents !== null && limitCents > 0) {
      const pct = Math.max(0, Math.min(100, Math.round((usedCents / limitCents) * 100)));
      return { type: "spend", usedCents, limitCents, pct };
    }
  }
  return null;
}

function readNumber(o: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function readCents(o: Record<string, unknown>, keys: readonly string[]): number | null {
  const n = readNumber(o, keys);
  return n === null ? null : Math.round(n);
}

function dollarsToCents(n: number | null): number | null {
  return n === null ? null : Math.round(n * 100);
}

function readString(o: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string") return v;
  }
  return null;
}

function readEpochMs(o: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
    }
    if (typeof v === "string") {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
