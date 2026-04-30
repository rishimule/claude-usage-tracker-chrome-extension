import { describe, it, expect } from "vitest";
import { formatMetric, formatPlanLabel } from "../../src/lib/format";
import type { Metric } from "../../src/lib/types";

const fixedNow = new Date("2026-04-29T12:00:00Z").getTime();

describe("formatPlanLabel", () => {
  it("renders all plan names", () => {
    expect(formatPlanLabel("Free")).toBe("Free");
    expect(formatPlanLabel("Pro")).toBe("Pro");
    expect(formatPlanLabel("Team")).toBe("Team");
    expect(formatPlanLabel("Enterprise")).toBe("Enterprise");
    expect(formatPlanLabel("API")).toBe("API");
    expect(formatPlanLabel("Unknown")).toBe("Unknown");
  });
});

describe("formatMetric", () => {
  it("formats messages metric with 5h reset", () => {
    const m: Metric = {
      type: "messages",
      remaining: 15,
      resetsAt: new Date("2026-04-29T16:00:00Z").getTime(),
      window: "5h",
    };
    const out = formatMetric(m, { now: fixedNow, locale: "en-US", timeZone: "UTC" });
    expect(out).toBe("15 messages left · resets 16:00");
  });

  it("singularizes 1 message", () => {
    const m: Metric = {
      type: "messages",
      remaining: 1,
      resetsAt: new Date("2026-04-29T13:30:00Z").getTime(),
      window: "5h",
    };
    expect(formatMetric(m, { now: fixedNow, locale: "en-US", timeZone: "UTC" }))
      .toBe("1 message left · resets 13:30");
  });

  it("formats spend metric", () => {
    const m: Metric = { type: "spend", usedCents: 42048, limitCents: 50000, pct: 84 };
    expect(formatMetric(m, { now: fixedNow, locale: "en-US", timeZone: "UTC" }))
      .toBe("$420.48 / $500.00 (84%)");
  });

  it("rounds spend cents correctly", () => {
    const m: Metric = { type: "spend", usedCents: 1, limitCents: 100, pct: 1 };
    expect(formatMetric(m, { now: fixedNow, locale: "en-US", timeZone: "UTC" }))
      .toBe("$0.01 / $1.00 (1%)");
  });

  it("formats rate metric with 5h window", () => {
    const m: Metric = {
      type: "rate",
      pct: 73,
      resetsAt: new Date("2026-04-29T13:30:00Z").getTime(),
      window: "5h",
    };
    expect(formatMetric(m, { now: fixedNow, locale: "en-US", timeZone: "UTC" }))
      .toBe("5h: 73% · resets 13:30");
  });

  it("formats rate metric with 7d window using date+time", () => {
    const m: Metric = {
      type: "rate",
      pct: 22,
      resetsAt: new Date("2026-05-04T08:00:00Z").getTime(),
      window: "7d",
    };
    expect(formatMetric(m, { now: fixedNow, locale: "en-US", timeZone: "UTC" }))
      .toBe("7d: 22% · resets May 4, 08:00");
  });
});
