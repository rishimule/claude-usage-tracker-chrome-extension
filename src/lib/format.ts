import type { Metric, Plan } from "./types";

export type FormatOptions = {
  now: number;
  locale: string;
  timeZone: string;
};

export function formatPlanLabel(plan: Plan): string {
  return plan;
}

export function formatMetric(metric: Metric, opts: FormatOptions): string {
  switch (metric.type) {
    case "messages":
      return formatMessages(metric.remaining, metric.resetsAt, opts);
    case "spend":
      return formatSpend(metric.usedCents, metric.limitCents, metric.pct);
    case "rate":
      return formatRate(metric.pct, metric.resetsAt, metric.window, opts);
  }
}

function formatMessages(remaining: number, resetsAt: number, opts: FormatOptions): string {
  const noun = remaining === 1 ? "message" : "messages";
  return `${remaining} ${noun} left · resets ${formatHHMM(resetsAt, opts)}`;
}

function formatSpend(usedCents: number, limitCents: number, pct: number): string {
  return `$${centsToDollars(usedCents)} / $${centsToDollars(limitCents)} (${pct}%)`;
}

function formatRate(pct: number, resetsAt: number, window: "5h" | "7d", opts: FormatOptions): string {
  const reset = window === "7d" ? formatMonthDayTime(resetsAt, opts) : formatHHMM(resetsAt, opts);
  return `${window}: ${pct}% · resets ${reset}`;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatHHMM(epochMs: number, opts: FormatOptions): string {
  return new Intl.DateTimeFormat(opts.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: opts.timeZone,
  }).format(new Date(epochMs));
}

function formatMonthDayTime(epochMs: number, opts: FormatOptions): string {
  const month = new Intl.DateTimeFormat(opts.locale, { month: "short", timeZone: opts.timeZone }).format(
    new Date(epochMs),
  );
  const day = new Intl.DateTimeFormat(opts.locale, { day: "numeric", timeZone: opts.timeZone }).format(
    new Date(epochMs),
  );
  const hhmm = formatHHMM(epochMs, opts);
  return `${month} ${day}, ${hhmm}`;
}
