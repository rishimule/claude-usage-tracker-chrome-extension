import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectPlan } from "../../src/lib/detect-plan";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  const raw = readFileSync(resolve(__dirname, "../fixtures/api", name), "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

const cases: Array<[string, "Free" | "Pro" | "Team" | "Enterprise" | "API"]> = [
  ["free-bootstrap.json", "Free"],
  ["pro-bootstrap.json", "Pro"],
  ["team-bootstrap.json", "Team"],
  ["enterprise-usage.json", "Enterprise"],
  ["console-spend.json", "API"],
];

describe("detectPlan", () => {
  for (const [file, expected] of cases) {
    const payload = loadFixture(file);
    const isEmpty = !payload || (typeof payload === "object" && Object.keys(payload as object).length === 0);
    (isEmpty ? it.skip : it)(`classifies ${file} as ${expected}`, () => {
      expect(detectPlan(payload)).toBe(expected);
    });
  }

  it("returns 'Unknown' for unrecognized payloads", () => {
    expect(detectPlan({})).toBe("Unknown");
    expect(detectPlan(null)).toBe("Unknown");
    expect(detectPlan({ unrelated: "thing" })).toBe("Unknown");
  });

  it("does not throw on malformed input", () => {
    expect(() => detectPlan(12345 as unknown)).not.toThrow();
    expect(detectPlan(12345 as unknown)).toBe("Unknown");
  });
});
