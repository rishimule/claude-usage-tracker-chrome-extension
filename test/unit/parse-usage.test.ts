import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseUsage } from "../../src/lib/parse-usage";
import type { Plan } from "../../src/lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  const raw = readFileSync(resolve(__dirname, "../fixtures/api", name), "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

const cases: Array<{ file: string; plan: Plan; expected: "messages" | "spend" | "rate" }> = [
  { file: "free-bootstrap.json", plan: "Free", expected: "messages" },
  { file: "pro-bootstrap.json", plan: "Pro", expected: "messages" },
  { file: "team-bootstrap.json", plan: "Team", expected: "messages" },
  { file: "enterprise-usage.json", plan: "Enterprise", expected: "spend" },
  { file: "console-spend.json", plan: "API", expected: "spend" },
];

// Note: message-rate-limit-headers.json is intentionally NOT in this list. It captures
// HTTP headers (a wrapper { url, status, headers, body }), used by the intercept/transport
// layer to document shape — not a body that parseUsage is meant to consume directly.

describe("parseUsage", () => {
  for (const { file, plan, expected } of cases) {
    const payload = loadFixture(file);
    const isEmpty = !payload || (typeof payload === "object" && Object.keys(payload as object).length === 0);
    (isEmpty ? it.skip : it)(`extracts a ${expected} metric from ${file} on ${plan}`, () => {
      const metric = parseUsage(plan, payload);
      expect(metric).not.toBeNull();
      expect(metric!.type).toBe(expected);

      if (metric!.type === "messages") {
        expect(metric.remaining).toBeGreaterThanOrEqual(0);
        expect(metric.resetsAt).toBeGreaterThan(0);
        expect(["5h", "daily"]).toContain(metric.window);
      } else if (metric!.type === "spend") {
        expect(metric.usedCents).toBeGreaterThanOrEqual(0);
        expect(metric.limitCents).toBeGreaterThan(0);
        expect(metric.pct).toBeGreaterThanOrEqual(0);
        expect(metric.pct).toBeLessThanOrEqual(100);
      } else {
        expect(metric.pct).toBeGreaterThanOrEqual(0);
        expect(metric.pct).toBeLessThanOrEqual(100);
        expect(metric.resetsAt).toBeGreaterThan(0);
      }
    });
  }

  it("returns null on malformed input", () => {
    expect(parseUsage("Pro", null)).toBeNull();
    expect(parseUsage("Pro", { totally: "unrelated" })).toBeNull();
  });
});
