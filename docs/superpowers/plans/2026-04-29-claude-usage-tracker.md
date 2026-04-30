# Claude Usage Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that injects a persistent usage-tracker footer into the Claude web app (`claude.ai`) and Anthropic Console (`console.anthropic.com`).

**Architecture:** Two execution worlds in the page (isolated content script for DOM and message bridging; MAIN-world script for fetch/XHR interception) plus a service worker that performs authoritative cookie-authenticated fetches and broadcasts state to all matching tabs. Pure detection / parsing / formatting code lives in a `lib/` layer and is fully unit-tested against recorded fixtures.

**Tech Stack:** TypeScript source compiled with `tsc`. Vitest for unit + DOM snapshot tests (with `happy-dom`). esbuild only as a single bundling step in `scripts/build.mjs`. No framework on the UI — vanilla DOM in a closed Shadow Root. Node 20+.

**Reference spec:** `docs/superpowers/specs/2026-04-29-claude-usage-tracker-design.md`.

---

## File Structure

Files created or modified by this plan:

```
package.json                              # npm config + scripts
tsconfig.json                             # TS compile config (ES2022, strict, ESM, no DOM in lib output for tests)
vitest.config.ts                          # vitest config; happy-dom env for DOM tests
.gitignore                                # node_modules, dist, .DS_Store
.eslintrc.cjs                             # minimal lint config
scripts/build.mjs                         # one-shot build: tsc + esbuild bundles + asset copy
manifest.json                             # MV3 manifest (top-level so unpacked-load works on dist/)
src/
  background.ts                           # service worker entry
  content/
    content.ts                            # isolated-world entry
    page-context.ts                       # MAIN-world entry
    footer.css                            # shadow-root scoped styles
    footer.html                           # shadow-root template
  lib/
    types.ts                              # State, Plan, Metric
    detect-plan.ts                        # JSON payload -> Plan
    parse-usage.ts                        # JSON payload -> Metric
    format.ts                             # Metric -> human string
    endpoints.ts                          # URL pattern table + matcher
    selectors.ts                          # DOM scrape fallbacks (versioned)
    color.ts                              # usage-percent -> color tier
icons/
  16.png 32.png 48.png 128.png            # placeholders (transparent PNGs)
test/
  fixtures/
    api/                                  # recorded JSON responses
      free-bootstrap.json
      pro-bootstrap.json
      team-bootstrap.json
      enterprise-usage.json
      console-spend.json
      message-rate-limit-headers.json
    dom/                                  # recorded HTML snippets
      account-menu.html
      settings-usage-page.html
      chat-header-with-limit.html
  unit/
    format.test.ts
    detect-plan.test.ts
    parse-usage.test.ts
    endpoints.test.ts
    selectors.test.ts
    color.test.ts
  integration/
    footer.test.ts                        # happy-dom render of content.ts wired to a stub message bus
README.md                                 # short usage / dev / load-unpacked notes
```

Each `lib/*.ts` is pure (no `chrome.*`, no `window`). They are imported by the two glue layers (`content/*` and `background.ts`) and by tests. This keeps the testable surface large and the untestable surface (browser glue) thin.

---

## Branch & commit conventions

- Work on the existing branch `docs/usage-tracker-spec` for tasks that only touch docs/configs, then create a feature branch `feat/usage-tracker` after the spec branch is merged. (If the spec branch is still open at start of implementation, branch `feat/usage-tracker` from it.)
- Conventional Commits subjects, imperative mood, ≤ 72 chars. No AI attribution anywhere.
- One logical change per commit. Each task ends with a commit.

---

## Task 1: Bootstrap the repo

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.eslintrc.cjs`

- [ ] **Step 1.1: Initialize npm**

Run: `npm init -y`
Expected: creates `package.json` with default fields.

- [ ] **Step 1.2: Replace `package.json` with project config**

```json
{
  "name": "claude-usage-tracker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.260",
    "@types/node": "^20.11.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "esbuild": "^0.20.0",
    "eslint": "^8.57.0",
    "happy-dom": "^14.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 1.3: Install deps**

Run: `npm install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 1.4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "outDir": "dist/tsc",
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false
  },
  "include": ["src/**/*", "test/**/*", "scripts/**/*"]
}
```

- [ ] **Step 1.5: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    globals: false,
    reporters: "default",
    coverage: { enabled: false },
  },
});
```

- [ ] **Step 1.6: Write `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.log
.env
.env.*
coverage/
```

- [ ] **Step 1.7: Write minimal `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  ignorePatterns: ["dist/", "node_modules/"],
};
```

- [ ] **Step 1.8: Verify the toolchain**

Run: `npm run typecheck`
Expected: no errors (no source files yet, but tsc should succeed).

Run: `npx vitest run`
Expected: "no test files found", exit 0.

- [ ] **Step 1.9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .eslintrc.cjs
git commit -m "chore: bootstrap typescript + vitest toolchain"
```

---

## Task 2: Define shared types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 2.1: Write the file**

```ts
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
```

- [ ] **Step 2.2: Verify it compiles**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 2.3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): define State, Plan, Metric"
```

---

## Task 3: Implement + test `color.ts`

This is the smallest pure module. Use it as the "TDD warmup" before tackling parsers.

**Files:**
- Create: `test/unit/color.test.ts`
- Create: `src/lib/color.ts`

- [ ] **Step 3.1: Write the failing tests**

```ts
// test/unit/color.test.ts
import { describe, it, expect } from "vitest";
import { usageColor } from "../../src/lib/color";

describe("usageColor", () => {
  it("returns 'green' below 50%", () => {
    expect(usageColor(0)).toBe("green");
    expect(usageColor(49)).toBe("green");
  });
  it("returns 'yellow' from 50% to 69%", () => {
    expect(usageColor(50)).toBe("yellow");
    expect(usageColor(69)).toBe("yellow");
  });
  it("returns 'orange' from 70% to 89%", () => {
    expect(usageColor(70)).toBe("orange");
    expect(usageColor(89)).toBe("orange");
  });
  it("returns 'red' at 90% and above", () => {
    expect(usageColor(90)).toBe("red");
    expect(usageColor(100)).toBe("red");
    expect(usageColor(150)).toBe("red");
  });
  it("clamps negatives to 'green'", () => {
    expect(usageColor(-5)).toBe("green");
  });
});
```

- [ ] **Step 3.2: Run, confirm failure**

Run: `npx vitest run test/unit/color.test.ts`
Expected: FAIL — module `src/lib/color` not found.

- [ ] **Step 3.3: Write the implementation**

```ts
// src/lib/color.ts
export type ColorTier = "green" | "yellow" | "orange" | "red";

export function usageColor(pct: number): ColorTier {
  if (pct >= 90) return "red";
  if (pct >= 70) return "orange";
  if (pct >= 50) return "yellow";
  return "green";
}
```

- [ ] **Step 3.4: Run, confirm pass**

Run: `npx vitest run test/unit/color.test.ts`
Expected: PASS, 5 assertions.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/color.ts test/unit/color.test.ts
git commit -m "feat(color): add usage-percent color tier helper"
```

---

## Task 4: Implement + test `format.ts`

**Files:**
- Create: `test/unit/format.test.ts`
- Create: `src/lib/format.ts`

- [ ] **Step 4.1: Write failing tests**

```ts
// test/unit/format.test.ts
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
```

- [ ] **Step 4.2: Run, confirm failure**

Run: `npx vitest run test/unit/format.test.ts`
Expected: FAIL — module `src/lib/format` not found.

- [ ] **Step 4.3: Write the implementation**

```ts
// src/lib/format.ts
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
```

- [ ] **Step 4.4: Run, confirm pass**

Run: `npx vitest run test/unit/format.test.ts`
Expected: PASS, 6 cases.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/format.ts test/unit/format.test.ts
git commit -m "feat(format): render Metric to display string"
```

---

## Task 5: Discovery — record real fixtures

This is a **manual recording task**. Subsequent parser tests assert against the resulting JSON files, so they must exist before Tasks 6–7 begin. If you do not have a Pro/Team/Enterprise account, record what you have and leave the others as a single line: `{}` — the parsers will return `null` for them and the unit tests will skip those cases (see Step 6.1 conditional).

**Files:**
- Create: `test/fixtures/api/free-bootstrap.json`
- Create: `test/fixtures/api/pro-bootstrap.json`
- Create: `test/fixtures/api/team-bootstrap.json`
- Create: `test/fixtures/api/enterprise-usage.json`
- Create: `test/fixtures/api/console-spend.json`
- Create: `test/fixtures/api/message-rate-limit-headers.json`
- Create: `test/fixtures/dom/account-menu.html`
- Create: `test/fixtures/dom/settings-usage-page.html`
- Create: `test/fixtures/dom/chat-header-with-limit.html`

- [ ] **Step 5.1: Record `claude.ai` API responses**

For each available account tier:
1. Open `https://claude.ai` in Chrome, sign in.
2. Open DevTools → Network tab → enable "Preserve log".
3. Reload the page. Filter by `bootstrap` and `organization`. Right-click the response → "Copy" → "Copy response".
4. Paste into the matching fixture file.
5. Click into a chat, send one message. Filter by `messages` or `rate`. If the response includes `x-rate-limit-*` headers or a `limits` block, save it to `message-rate-limit-headers.json` as a JSON object: `{ "url": "...", "status": 200, "headers": {...}, "body": {...} }`.
6. Open Settings → Usage. Capture any XHR with "usage" in the path → `enterprise-usage.json`.

- [ ] **Step 5.2: Record `console.anthropic.com` spend**

Sign in to `https://console.anthropic.com`, navigate to Settings → Billing or Usage. Capture the JSON response that contains the spend-versus-limit numbers → `console-spend.json`.

- [ ] **Step 5.3: Record DOM snapshots**

For each fixture:
1. Open the relevant page on `claude.ai`.
2. Right-click the relevant region in the Elements panel → "Copy" → "Copy outerHTML".
3. Wrap in `<!doctype html><html><body>…</body></html>` shell.
4. Save to the corresponding `test/fixtures/dom/*.html` file.

- [ ] **Step 5.4: Strip secrets**

Open every fixture file. Replace any:
- session id / cookie value / Bearer token → `"REDACTED"`
- email or full name → `"user@example.com"` / `"User Example"`
- org id / workspace id → `"org-redacted"`

- [ ] **Step 5.5: Commit**

```bash
git add test/fixtures
git commit -m "test(fixtures): add recorded API + DOM fixtures"
```

---

## Task 6: Implement + test `detect-plan.ts`

The parser inspects a payload and returns one of `Plan`. Tests are *driven by* the fixtures from Task 5 — the test reads each fixture and asserts the expected plan label. If a fixture is `{}` (i.e. you didn't have access to that tier), that case `it.skip`'s itself.

**Files:**
- Create: `test/unit/detect-plan.test.ts`
- Create: `src/lib/detect-plan.ts`

- [ ] **Step 6.1: Write failing tests**

```ts
// test/unit/detect-plan.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectPlan } from "../../src/lib/detect-plan";

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
```

- [ ] **Step 6.2: Run, confirm failure**

Run: `npx vitest run test/unit/detect-plan.test.ts`
Expected: FAIL — module `src/lib/detect-plan` not found.

- [ ] **Step 6.3: Write implementation**

The exact discriminators depend on what you observe in the recorded fixtures. The structure below covers the common shapes Anthropic uses (organization with a `settings.organization_type` or `tier` field, plus the API console's `workspace.billing` block). Update the `*_DISCRIMINATORS` arrays as needed once the fixtures are in hand — only the strings change, not the structure.

```ts
// src/lib/detect-plan.ts
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

  // Console payloads identify themselves by a workspace + billing object.
  if ("workspace" in payload && isObject(payload.workspace)) {
    if ("billing" in payload.workspace || "monthly_spend" in payload.workspace) return "API";
  }

  // Enterprise payloads identify themselves by an extra_usage / monthly_limit block.
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
  // organization.settings.organization_type
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
```

- [ ] **Step 6.4: Run, confirm pass**

Run: `npx vitest run test/unit/detect-plan.test.ts`
Expected: PASS for the fixtures you recorded; SKIP for the empty ones; PASS for the malformed-input cases.

If a recorded fixture surprises the parser, **do not weaken the test**: instead, look at the actual shape, identify the right discriminator, and add it to the appropriate `*_DISCRIMINATORS` list. Re-run.

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/detect-plan.ts test/unit/detect-plan.test.ts
git commit -m "feat(detect-plan): classify org payload to Plan"
```

---

## Task 7: Implement + test `parse-usage.ts`

**Files:**
- Create: `test/unit/parse-usage.test.ts`
- Create: `src/lib/parse-usage.ts`

- [ ] **Step 7.1: Write failing tests**

```ts
// test/unit/parse-usage.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseUsage } from "../../src/lib/parse-usage";
import type { Plan } from "../../src/lib/types";

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
```

- [ ] **Step 7.2: Run, confirm failure**

Run: `npx vitest run test/unit/parse-usage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Write implementation**

```ts
// src/lib/parse-usage.ts
import type { Metric, Plan } from "./types";

export function parseUsage(plan: Plan, payload: unknown): Metric | null {
  if (!isObject(payload)) return null;

  if (plan === "Free" || plan === "Pro" || plan === "Team") {
    return parseMessages(payload) ?? parseRate(payload);
  }
  if (plan === "Enterprise") {
    return parseSpend(payload, "enterprise");
  }
  if (plan === "API") {
    return parseSpend(payload, "api");
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

function parseSpend(payload: Record<string, unknown>, source: "enterprise" | "api"): Metric | null {
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
      // Heuristic: <1e12 means seconds, otherwise ms.
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
```

- [ ] **Step 7.4: Run, confirm pass**

Run: `npx vitest run test/unit/parse-usage.test.ts`
Expected: PASS for recorded fixtures; SKIP for empty ones.

If a parser case fails on a real fixture, inspect the JSON, identify the right field name, and add it to the relevant `keys` array — do not weaken the assertion.

- [ ] **Step 7.5: Commit**

```bash
git add src/lib/parse-usage.ts test/unit/parse-usage.test.ts
git commit -m "feat(parse-usage): extract Metric per plan tier"
```

---

## Task 8: Implement + test `endpoints.ts`

**Files:**
- Create: `test/unit/endpoints.test.ts`
- Create: `src/lib/endpoints.ts`

- [ ] **Step 8.1: Write failing tests**

```ts
// test/unit/endpoints.test.ts
import { describe, it, expect } from "vitest";
import { matchEndpoint, ACTIVE_FETCH_TARGETS } from "../../src/lib/endpoints";

describe("matchEndpoint", () => {
  it("matches claude.ai bootstrap", () => {
    expect(matchEndpoint("https://claude.ai/api/bootstrap/foo")).toEqual({
      origin: "claude.ai",
      kind: "bootstrap",
    });
  });
  it("matches claude.ai organization usage", () => {
    expect(matchEndpoint("https://claude.ai/api/organizations/abc/usage")).toEqual({
      origin: "claude.ai",
      kind: "usage",
    });
  });
  it("matches console.anthropic.com billing", () => {
    expect(matchEndpoint("https://console.anthropic.com/api/billing/foo")).toEqual({
      origin: "console.anthropic.com",
      kind: "billing",
    });
  });
  it("matches claude.ai messages endpoint", () => {
    expect(matchEndpoint("https://claude.ai/api/organizations/abc/chat_conversations/x/completion")).toEqual({
      origin: "claude.ai",
      kind: "completion",
    });
  });
  it("returns null for unrelated URLs", () => {
    expect(matchEndpoint("https://example.com/foo")).toBeNull();
    expect(matchEndpoint("https://claude.ai/api/account/avatar")).toBeNull();
  });
});

describe("ACTIVE_FETCH_TARGETS", () => {
  it("has at least one target per origin", () => {
    expect(ACTIVE_FETCH_TARGETS["claude.ai"].length).toBeGreaterThan(0);
    expect(ACTIVE_FETCH_TARGETS["console.anthropic.com"].length).toBeGreaterThan(0);
  });
  it("targets are absolute URLs", () => {
    for (const list of Object.values(ACTIVE_FETCH_TARGETS)) {
      for (const url of list) {
        expect(() => new URL(url)).not.toThrow();
      }
    }
  });
});
```

- [ ] **Step 8.2: Run, confirm failure**

Run: `npx vitest run test/unit/endpoints.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8.3: Write implementation**

```ts
// src/lib/endpoints.ts
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
    // {orgId} placeholder is filled in at fetch time by background.ts after bootstrap returns it.
    // Keeping a templated stub here documents the second hop.
    "https://claude.ai/api/organizations/{orgId}/usage",
  ],
  "console.anthropic.com": [
    "https://console.anthropic.com/api/billing/usage",
  ],
};
```

- [ ] **Step 8.4: Run, confirm pass**

Run: `npx vitest run test/unit/endpoints.test.ts`
Expected: PASS, all cases.

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/endpoints.ts test/unit/endpoints.test.ts
git commit -m "feat(endpoints): pattern-match claude.ai + console URLs"
```

---

## Task 9: Implement + test `selectors.ts`

This module contains the DOM-scrape fallbacks. Tests load HTML fixtures from Task 5 and assert that the scrapers return numbers / strings.

**Files:**
- Create: `test/unit/selectors.test.ts`
- Create: `src/lib/selectors.ts`

- [ ] **Step 9.1: Write failing tests**

```ts
// test/unit/selectors.test.ts
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scrapePlanFromAccountMenu, scrapeMessagesRemaining, scrapeSpendFromUsagePage } from "../../src/lib/selectors";

function load(name: string): string {
  const raw = readFileSync(resolve(__dirname, "../fixtures/dom", name), "utf8").trim();
  return raw || "<!doctype html><html><body></body></html>";
}

function setBody(html: string) {
  document.documentElement.innerHTML = "<head></head><body>" + html + "</body>";
}

describe("scrapePlanFromAccountMenu", () => {
  it("returns null when fixture is empty", () => {
    setBody("");
    expect(scrapePlanFromAccountMenu(document)).toBeNull();
  });
  it("extracts a plan label when present in account menu HTML", () => {
    const html = load("account-menu.html");
    if (!html.includes("<body>")) return;
    document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, "").replace(/^<html[^>]*>/i, "").replace(/<\/html>$/i, "");
    const plan = scrapePlanFromAccountMenu(document);
    if (plan === null) return; // fixture without plan badge — skip silently
    expect(["Free", "Pro", "Team", "Enterprise", "API"]).toContain(plan);
  });
});

describe("scrapeMessagesRemaining", () => {
  it("returns null on empty page", () => {
    setBody("");
    expect(scrapeMessagesRemaining(document)).toBeNull();
  });
  it("parses 'X messages left' text", () => {
    setBody(`<div class="limit-banner">15 messages remaining</div>`);
    expect(scrapeMessagesRemaining(document)).toEqual({ remaining: 15 });
  });
  it("parses singular form", () => {
    setBody(`<span>1 message left</span>`);
    expect(scrapeMessagesRemaining(document)).toEqual({ remaining: 1 });
  });
});

describe("scrapeSpendFromUsagePage", () => {
  it("returns null on empty page", () => {
    setBody("");
    expect(scrapeSpendFromUsagePage(document)).toBeNull();
  });
  it("parses '$X of $Y spent'", () => {
    setBody(`<p>$420.48 of $500.00 spent this month</p>`);
    expect(scrapeSpendFromUsagePage(document)).toEqual({ usedCents: 42048, limitCents: 50000 });
  });
  it("parses '$X / $Y'", () => {
    setBody(`<div>$1.23 / $10.00</div>`);
    expect(scrapeSpendFromUsagePage(document)).toEqual({ usedCents: 123, limitCents: 1000 });
  });
});
```

- [ ] **Step 9.2: Run, confirm failure**

Run: `npx vitest run test/unit/selectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 9.3: Write implementation**

```ts
// src/lib/selectors.ts
import type { Plan } from "./types";

export function scrapePlanFromAccountMenu(doc: Document): Plan | null {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(
    [
      "[data-testid*='plan']",
      "[data-testid*='subscription']",
      "[aria-label*='plan' i]",
      "header [class*='badge' i]",
      "[class*='plan-name' i]",
    ].join(","),
  ));
  for (const el of candidates) {
    const text = (el.textContent ?? "").trim().toLowerCase();
    if (!text) continue;
    if (text.includes("enterprise")) return "Enterprise";
    if (text.includes("team")) return "Team";
    if (text.includes("pro")) return "Pro";
    if (text.includes("free")) return "Free";
    if (text.includes("api")) return "API";
  }
  return null;
}

export function scrapeMessagesRemaining(doc: Document): { remaining: number } | null {
  const re = /\b(\d+)\s+message(?:s)?\s+(?:left|remaining)\b/i;
  const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ");
  const m = text.match(re);
  if (!m) return null;
  return { remaining: Number(m[1]) };
}

export function scrapeSpendFromUsagePage(doc: Document): { usedCents: number; limitCents: number } | null {
  const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ");
  // "$420.48 of $500.00 spent" or "$X / $Y"
  const re = /\$([\d,]+\.\d{2})\s*(?:of|\/)\s*\$([\d,]+\.\d{2})/i;
  const m = text.match(re);
  if (!m) return null;
  const usedCents = dollarsStringToCents(m[1]);
  const limitCents = dollarsStringToCents(m[2]);
  if (usedCents === null || limitCents === null || limitCents === 0) return null;
  return { usedCents, limitCents };
}

function dollarsStringToCents(s: string): number | null {
  const cleaned = s.replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
```

- [ ] **Step 9.4: Run, confirm pass**

Run: `npx vitest run test/unit/selectors.test.ts`
Expected: PASS, all cases.

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/selectors.ts test/unit/selectors.test.ts
git commit -m "feat(selectors): DOM scrape fallbacks for plan + usage"
```

---

## Task 10: Implement `content/page-context.ts`

This script runs in the page's MAIN world. It patches `window.fetch` and `XMLHttpRequest`, filters responses through `matchEndpoint`, and posts matches back to the isolated content script via `window.postMessage`. There is no useful unit test in vitest for this file (it depends on real Chrome MAIN-world execution), so verification is by integration in Task 13.

**Files:**
- Create: `src/content/page-context.ts`

- [ ] **Step 10.1: Write the file**

```ts
// src/content/page-context.ts
// Runs in the MAIN world. Posts intercepted responses to the isolated content script.
import { matchEndpoint } from "../lib/endpoints";

const CHANNEL = "cut-intercept";

(function install() {
  installFetchPatch();
  installXhrPatch();
})();

function installFetchPatch(): void {
  const original = window.fetch;
  if (!original || (window.fetch as { __cutPatched?: boolean }).__cutPatched) return;
  const patched: typeof window.fetch = async function (...args) {
    const response = await original.apply(this, args as Parameters<typeof window.fetch>);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : (args[0] as URL).toString();
      const m = matchEndpoint(url);
      if (m) {
        const clone = response.clone();
        clone
          .json()
          .then((body) => post({ kind: m.kind, origin: m.origin, url, body }))
          .catch(() => {
            /* non-JSON response, ignore */
          });
      }
    } catch {
      /* swallow */
    }
    return response;
  };
  (patched as { __cutPatched?: boolean }).__cutPatched = true;
  window.fetch = patched;
}

function installXhrPatch(): void {
  const X = XMLHttpRequest.prototype;
  if ((X as { __cutPatched?: boolean }).__cutPatched) return;
  const origOpen = X.open;
  const origSend = X.send;
  X.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    (this as unknown as { __cutUrl?: string }).__cutUrl = typeof url === "string" ? url : url.toString();
    // @ts-expect-error pass-through
    return origOpen.call(this, method, url, ...rest);
  };
  X.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener("load", () => {
      const url = (this as unknown as { __cutUrl?: string }).__cutUrl ?? "";
      const m = matchEndpoint(url);
      if (!m) return;
      try {
        const parsed = JSON.parse(this.responseText);
        post({ kind: m.kind, origin: m.origin, url, body: parsed });
      } catch {
        /* non-JSON */
      }
    });
    return origSend.call(this, body ?? null);
  };
  (X as { __cutPatched?: boolean }).__cutPatched = true;
}

function post(payload: unknown): void {
  window.postMessage({ source: CHANNEL, payload }, "*");
}
```

- [ ] **Step 10.2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 10.3: Commit**

```bash
git add src/content/page-context.ts
git commit -m "feat(page-context): patch fetch + XHR for intercept"
```

---

## Task 11: Implement `content/footer.css` and `footer.html`

**Files:**
- Create: `src/content/footer.html`
- Create: `src/content/footer.css`

- [ ] **Step 11.1: Write `footer.html`**

```html
<div class="cut-bar" role="status" aria-live="polite">
  <div class="cut-left">
    <span class="cut-pill" data-plan="Unknown">Unknown</span>
  </div>
  <div class="cut-right">
    <span class="cut-metric">Loading…</span>
    <button class="cut-refresh" type="button" aria-label="Refresh usage">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M8 3a5 5 0 1 0 4.546 2.914l1.06-.51A6 6 0 1 1 8 2v1z" fill="currentColor"/>
        <path d="M11.5 1.5L13 4l-2.5 1.5z" fill="currentColor"/>
      </svg>
    </button>
  </div>
</div>
```

- [ ] **Step 11.2: Write `footer.css`**

```css
/* footer.css — scoped via shadow root */
:host {
  --cut-bg: var(--bg-000, #2b2b2b);
  --cut-fg: var(--text-100, #ececec);
  --cut-dim: var(--text-300, #a3a3a3);
  --cut-border: rgba(255, 255, 255, 0.08);

  --cut-green: #4ade80;
  --cut-yellow: #facc15;
  --cut-orange: #fb923c;
  --cut-red: #f87171;

  all: initial;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

@media (prefers-color-scheme: light) {
  :host {
    --cut-bg: var(--bg-000, #ffffff);
    --cut-fg: var(--text-100, #1f1f1f);
    --cut-dim: var(--text-300, #555);
    --cut-border: rgba(0, 0, 0, 0.08);
  }
}

.cut-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 12px;
  background: var(--cut-bg);
  color: var(--cut-fg);
  border-top: 1px solid var(--cut-border);
  font-size: 12px;
  line-height: 32px;
}

.cut-left, .cut-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cut-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.02em;
  background: rgba(255, 255, 255, 0.08);
}
.cut-pill[data-plan="Free"]       { color: #cbd5e1; }
.cut-pill[data-plan="Pro"]        { color: #93c5fd; }
.cut-pill[data-plan="Team"]       { color: #c4b5fd; }
.cut-pill[data-plan="Enterprise"] { color: #fcd34d; }
.cut-pill[data-plan="API"]        { color: #5eead4; }
.cut-pill[data-plan="Unknown"]    { color: var(--cut-dim); }

.cut-metric { font-variant-numeric: tabular-nums; }
.cut-metric .pct.green  { color: var(--cut-green); }
.cut-metric .pct.yellow { color: var(--cut-yellow); }
.cut-metric .pct.orange { color: var(--cut-orange); }
.cut-metric .pct.red    { color: var(--cut-red); }
.cut-metric .stale      { color: var(--cut-dim); margin-left: 6px; }

.cut-refresh {
  background: transparent;
  border: none;
  color: var(--cut-dim);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cut-refresh:hover { color: var(--cut-fg); background: var(--cut-border); }
.cut-refresh[disabled] { opacity: 0.5; cursor: default; }
.cut-refresh.spinning svg { animation: cut-spin 1s linear infinite; }

@keyframes cut-spin {
  from { transform: rotate(0deg); } to { transform: rotate(360deg); }
}
```

- [ ] **Step 11.3: Commit**

```bash
git add src/content/footer.html src/content/footer.css
git commit -m "feat(footer): shadow-root template + scoped styles"
```

---

## Task 12: Implement `content/content.ts` (isolated world)

**Files:**
- Create: `src/content/content.ts`
- Create: `test/integration/footer.test.ts`

- [ ] **Step 12.1: Write the integration test (drives the rendering API)**

```ts
// test/integration/footer.test.ts
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderState, mountFooter, unmountFooter } from "../../src/content/content";
import type { State } from "../../src/lib/types";

describe("footer rendering", () => {
  it("mounts a host element with a closed shadow root", () => {
    document.body.innerHTML = "";
    mountFooter(document);
    const host = document.getElementById("cut-footer");
    expect(host).not.toBeNull();
    // Shadow root is closed; rely on internal accessor exposed by mountFooter for tests.
    expect((host as HTMLElement).getAttribute("data-cut-mounted")).toBe("1");
  });

  it("renders 'Loading…' on loading state", () => {
    document.body.innerHTML = "";
    const handle = mountFooter(document);
    renderState(handle, { kind: "loading" });
    expect(handle.metricEl.textContent).toContain("Loading");
  });

  it("renders an ok state", () => {
    document.body.innerHTML = "";
    const handle = mountFooter(document);
    const state: State = {
      kind: "ok",
      plan: "Pro",
      metric: { type: "messages", remaining: 15, resetsAt: new Date("2026-04-29T16:00:00Z").getTime(), window: "5h" },
      freshAt: new Date("2026-04-29T12:00:00Z").getTime(),
    };
    renderState(handle, state, { now: state.freshAt, locale: "en-US", timeZone: "UTC" });
    expect(handle.planEl.textContent).toBe("Pro");
    expect(handle.planEl.getAttribute("data-plan")).toBe("Pro");
    expect(handle.metricEl.textContent).toContain("15 messages left");
  });

  it("renders an error state with hint", () => {
    document.body.innerHTML = "";
    const handle = mountFooter(document);
    renderState(handle, { kind: "error", reason: "unauth" });
    expect(handle.metricEl.textContent?.toLowerCase()).toContain("sign in");
  });

  it("unmount removes the host", () => {
    document.body.innerHTML = "";
    const handle = mountFooter(document);
    unmountFooter(handle);
    expect(document.getElementById("cut-footer")).toBeNull();
  });
});
```

- [ ] **Step 12.2: Run, confirm failure**

Run: `npx vitest run test/integration/footer.test.ts`
Expected: FAIL — module `src/content/content` not found.

- [ ] **Step 12.3: Write the implementation**

```ts
// src/content/content.ts
import { formatMetric, formatPlanLabel, type FormatOptions } from "../lib/format";
import { usageColor } from "../lib/color";
import type { State } from "../lib/types";

const FOOTER_HEIGHT_PX = 32;

export type FooterHandle = {
  host: HTMLElement;
  root: ShadowRoot;
  planEl: HTMLElement;
  metricEl: HTMLElement;
  refreshBtn: HTMLButtonElement;
  cleanups: Array<() => void>;
};

const FOOTER_HTML = String.raw`<div class="cut-bar" role="status" aria-live="polite">
  <div class="cut-left"><span class="cut-pill" data-plan="Unknown">Unknown</span></div>
  <div class="cut-right">
    <span class="cut-metric">Loading…</span>
    <button class="cut-refresh" type="button" aria-label="Refresh usage">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M8 3a5 5 0 1 0 4.546 2.914l1.06-.51A6 6 0 1 1 8 2v1z" fill="currentColor"/>
        <path d="M11.5 1.5L13 4l-2.5 1.5z" fill="currentColor"/>
      </svg>
    </button>
  </div>
</div>`;

const FOOTER_CSS_URL = "footer.css"; // resolved via chrome.runtime.getURL at runtime

export function mountFooter(doc: Document): FooterHandle {
  const existing = doc.getElementById("cut-footer");
  if (existing) existing.remove();

  const host = doc.createElement("div");
  host.id = "cut-footer";
  host.setAttribute("data-cut-mounted", "1");
  host.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${FOOTER_HEIGHT_PX}px;z-index:2147483646;pointer-events:auto;`;
  doc.body.appendChild(host);

  const root = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("link");
  style.rel = "stylesheet";
  // In the extension, this URL is rewritten at build time. In tests we leave it as-is.
  style.href = typeof chrome !== "undefined" && chrome.runtime?.getURL
    ? chrome.runtime.getURL(FOOTER_CSS_URL)
    : FOOTER_CSS_URL;
  root.appendChild(style);
  const wrapper = doc.createElement("div");
  wrapper.innerHTML = FOOTER_HTML;
  root.appendChild(wrapper.firstElementChild!);

  const planEl = root.querySelector<HTMLElement>(".cut-pill")!;
  const metricEl = root.querySelector<HTMLElement>(".cut-metric")!;
  const refreshBtn = root.querySelector<HTMLButtonElement>(".cut-refresh")!;

  const handle: FooterHandle = { host, root, planEl, metricEl, refreshBtn, cleanups: [] };

  installPagePadding(doc, handle);
  installResizeObserver(doc, handle);

  return handle;
}

export function unmountFooter(handle: FooterHandle): void {
  for (const fn of handle.cleanups.splice(0)) {
    try { fn(); } catch { /* noop */ }
  }
  handle.host.remove();
}

export function renderState(
  handle: FooterHandle,
  state: State,
  fmt: FormatOptions = defaultFormatOptions(),
): void {
  switch (state.kind) {
    case "loading":
      handle.planEl.textContent = "…";
      handle.planEl.setAttribute("data-plan", "Unknown");
      handle.metricEl.textContent = "Loading…";
      return;
    case "error":
      handle.planEl.setAttribute("data-plan", "Unknown");
      handle.planEl.textContent = "—";
      handle.metricEl.textContent = errorHint(state.reason);
      return;
    case "ok":
      handle.planEl.setAttribute("data-plan", state.plan);
      handle.planEl.textContent = formatPlanLabel(state.plan);
      const text = formatMetric(state.metric, fmt);
      const pct = pickPct(state);
      const pctClass = pct === null ? "" : usageColor(pct);
      handle.metricEl.innerHTML = pct === null
        ? escapeHtml(text)
        : decoratePct(text, pctClass);
      if (state.degraded) handle.metricEl.appendChild(makeStaleNote("(degraded)"));
      return;
  }
}

function pickPct(state: Extract<State, { kind: "ok" }>): number | null {
  if (state.metric.type === "spend") return state.metric.pct;
  if (state.metric.type === "rate") return state.metric.pct;
  return null;
}

function decoratePct(text: string, cls: string): string {
  return escapeHtml(text).replace(/(\d+)%/, `<span class="pct ${cls}">$1%</span>`);
}

function errorHint(reason: Extract<State, { kind: "error" }>["reason"]): string {
  switch (reason) {
    case "unauth": return "Sign in to Claude";
    case "network": return "Offline · cached values shown if any";
    case "parse": return "Couldn't read usage";
    case "unknown": return "Usage unavailable";
  }
}

function makeStaleNote(text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "stale";
  s.textContent = text;
  return s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function defaultFormatOptions(): FormatOptions {
  return {
    now: Date.now(),
    locale: navigator.language || "en-US",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function installPagePadding(doc: Document, handle: FooterHandle): void {
  const styleEl = doc.createElement("style");
  styleEl.textContent = `body { padding-bottom: ${FOOTER_HEIGHT_PX}px !important; }`;
  doc.head?.appendChild(styleEl);
  handle.cleanups.push(() => styleEl.remove());
}

function installResizeObserver(doc: Document, handle: FooterHandle): void {
  const candidates = [
    "[data-testid='chat-input']",
    "form[action*='completion']",
    "footer[role='form']",
    "div[class*='chat-input' i]",
  ];
  let target: Element | null = null;
  for (const sel of candidates) {
    target = doc.querySelector(sel);
    if (target) break;
  }
  if (!target || !("ResizeObserver" in window)) return;

  const ro = new ResizeObserver((entries) => {
    const h = entries[0]?.contentRect.height ?? 0;
    handle.host.style.bottom = `${Math.max(0, Math.round(h))}px`;
  });
  ro.observe(target);
  handle.cleanups.push(() => ro.disconnect());
}
```

- [ ] **Step 12.4: Run, confirm pass**

Run: `npx vitest run test/integration/footer.test.ts`
Expected: PASS, 5 cases.

- [ ] **Step 12.5: Add the message-bus + lifecycle code (no test — exercised manually in Task 16)**

Append to `src/content/content.ts`:

```ts
// --- Wiring (only in extension runtime) ---
export function bootstrapInExtension(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) return;

  injectPageContext();
  const handle = mountFooter(document);

  const lastStateKey = `lastState_${location.host}`;
  chrome.storage.local.get(lastStateKey).then((cached) => {
    const cachedState = (cached?.[lastStateKey] ?? null) as State | null;
    if (cachedState) renderState(handle, cachedState);
    else renderState(handle, { kind: "loading" });
    chrome.runtime.sendMessage({ type: "fetch_usage", origin: location.host });
  });

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg || msg.source !== "cut-intercept") return;
    chrome.runtime.sendMessage({ type: "intercepted", origin: location.host, payload: msg.payload });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "state" && msg.origin === location.host) {
      renderState(handle, msg.state);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) chrome.runtime.sendMessage({ type: "fetch_usage", origin: location.host });
  });

  let lastClick = 0;
  handle.refreshBtn.addEventListener("click", () => {
    const now = Date.now();
    if (now - lastClick < 2000) return;
    lastClick = now;
    handle.refreshBtn.classList.add("spinning");
    handle.refreshBtn.disabled = true;
    chrome.runtime.sendMessage({ type: "fetch_usage", origin: location.host }).finally(() => {
      setTimeout(() => {
        handle.refreshBtn.classList.remove("spinning");
        handle.refreshBtn.disabled = false;
      }, 500);
    });
  });
}

function injectPageContext(): void {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("page-context.js");
  s.async = false;
  (document.head ?? document.documentElement).appendChild(s);
  s.remove();
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  bootstrapInExtension();
}
```

- [ ] **Step 12.6: Re-run all tests**

Run: `npm test`
Expected: every suite passes.

- [ ] **Step 12.7: Commit**

```bash
git add src/content/content.ts test/integration/footer.test.ts
git commit -m "feat(content): mount shadow-root footer + render states"
```

---

## Task 13: Implement `background.ts` (service worker)

**Files:**
- Create: `src/background.ts`

The service worker is exercised end-to-end in the manual smoke test (Task 16). Vitest cannot meaningfully simulate `chrome.cookies` + `fetch` w/ credentials, so this task is implementation-only with a strict typecheck gate.

- [ ] **Step 13.1: Write the file**

```ts
// src/background.ts
import { detectPlan } from "./lib/detect-plan";
import { parseUsage } from "./lib/parse-usage";
import { matchEndpoint } from "./lib/endpoints";
import type { Origin, State } from "./lib/types";

const STORAGE_KEY = (origin: Origin) => `lastState_${origin}`;
// Service workers in MV3 are non-persistent; chrome.storage.local is the
// authoritative cache. We deliberately do not keep a Map cache in module scope.

const ORIGIN_FROM_HOST: Record<string, Origin> = {
  "claude.ai": "claude.ai",
  "console.anthropic.com": "console.anthropic.com",
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "intercepted") {
      await handleIntercepted(msg.origin, msg.payload, sender.tab?.id);
      sendResponse({ ok: true });
    } else if (msg?.type === "fetch_usage") {
      await fetchAuthoritative(msg.origin, sender.tab?.id);
      sendResponse({ ok: true });
    }
  })().catch((err) => {
    console.warn("[cut] background error", err);
    sendResponse({ ok: false });
  });
  return true; // keep sendResponse alive for async path
});

async function handleIntercepted(host: string, payload: unknown, tabId?: number): Promise<void> {
  const origin = ORIGIN_FROM_HOST[host];
  if (!origin) return;
  const inner = isObj(payload) && "body" in payload ? (payload as { body: unknown }).body : payload;
  const next = applyPayload(origin, inner);
  if (next) await broadcast(origin, next, tabId);
}

function applyPayload(origin: Origin, body: unknown): State | null {
  const plan = detectPlan(body);
  const metric = parseUsage(plan, body);
  if (plan === "Unknown" || metric === null) return null;
  return { kind: "ok", plan, metric, freshAt: Date.now() };
}

async function fetchAuthoritative(host: string, tabId?: number): Promise<void> {
  const origin = ORIGIN_FROM_HOST[host];
  if (!origin) return;

  try {
    if (origin === "claude.ai") {
      const bootstrap = await fetchJson("https://claude.ai/api/bootstrap");
      if (bootstrap.status === 401) return await broadcast(origin, { kind: "error", reason: "unauth" }, tabId);
      if (bootstrap.status >= 500) return await broadcast(origin, { kind: "error", reason: "network" }, tabId);
      const state1 = applyPayload(origin, bootstrap.body);
      if (state1) await broadcast(origin, state1, tabId);

      const orgId = isObj(bootstrap.body) ? readOrgId(bootstrap.body) : null;
      if (orgId) {
        const usage = await fetchJson(`https://claude.ai/api/organizations/${orgId}/usage`);
        if (usage.status === 200) {
          const state2 = applyPayload(origin, usage.body);
          if (state2) await broadcast(origin, state2, tabId);
        }
      }
    } else {
      const billing = await fetchJson("https://console.anthropic.com/api/billing/usage");
      if (billing.status === 401) return await broadcast(origin, { kind: "error", reason: "unauth" }, tabId);
      const state = applyPayload(origin, billing.body);
      if (state) await broadcast(origin, state, tabId);
    }
  } catch (err) {
    console.warn("[cut] fetch failed", err);
    await broadcast(origin, { kind: "error", reason: "network" }, tabId);
  }
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { credentials: "include", signal: ctrl.signal, headers: { Accept: "application/json" } });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function broadcast(origin: Origin, state: State, tabId?: number): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY(origin)]: state });

  const tabs = await chrome.tabs.query({ url: `*://${origin}/*` });
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    chrome.tabs.sendMessage(tab.id, { type: "state", origin, state }).catch(() => { /* tab may be gone */ });
  }
  if (tabId !== undefined) {
    chrome.tabs.sendMessage(tabId, { type: "state", origin, state }).catch(() => { /* noop */ });
  }
}

function readOrgId(payload: Record<string, unknown> | unknown): string | null {
  if (!isObj(payload)) return null;
  if (typeof payload.organization_uuid === "string") return payload.organization_uuid;
  if (isObj(payload.organization) && typeof payload.organization.uuid === "string") return payload.organization.uuid;
  if (Array.isArray(payload.organizations)) {
    const first = payload.organizations[0];
    if (isObj(first) && typeof first.uuid === "string") return first.uuid;
  }
  return null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
```

- [ ] **Step 13.2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 13.3: Commit**

```bash
git add src/background.ts
git commit -m "feat(background): SW broadcasts state from intercept + fetch"
```

---

## Task 14: Write `manifest.json`

**Files:**
- Create: `manifest.json`

- [ ] **Step 14.1: Write the file**

```json
{
  "manifest_version": 3,
  "name": "Claude Usage Tracker",
  "version": "0.1.0",
  "description": "Persistent footer showing Claude plan + usage on claude.ai and console.anthropic.com.",
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "background": { "service_worker": "background.js", "type": "module" },
  "permissions": ["activeTab", "scripting", "storage", "alarms"],
  "host_permissions": ["*://*.claude.ai/*", "*://console.anthropic.com/*"],
  "content_scripts": [
    {
      "matches": ["*://*.claude.ai/*", "*://console.anthropic.com/*"],
      "js": ["content.js"],
      "css": [],
      "run_at": "document_end",
      "all_frames": false,
      "world": "ISOLATED"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["page-context.js", "footer.css", "footer.html"],
      "matches": ["*://*.claude.ai/*", "*://console.anthropic.com/*"]
    }
  ]
}
```

- [ ] **Step 14.2: Commit**

```bash
git add manifest.json
git commit -m "feat(manifest): MV3 manifest for claude.ai + console"
```

---

## Task 15: Build script

**Files:**
- Create: `scripts/build.mjs`

- [ ] **Step 15.1: Write the script**

```js
// scripts/build.mjs — bundle src/* into dist/ for unpacked load
import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve("dist");

async function run() {
  if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await mkdir(resolve(DIST, "icons"), { recursive: true });

  const common = {
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    sourcemap: true,
    logLevel: "info",
  };

  await build({ ...common, entryPoints: ["src/background.ts"], outfile: resolve(DIST, "background.js") });
  await build({ ...common, entryPoints: ["src/content/content.ts"], outfile: resolve(DIST, "content.js") });
  await build({ ...common, entryPoints: ["src/content/page-context.ts"], outfile: resolve(DIST, "page-context.js") });

  await copyFile("manifest.json", resolve(DIST, "manifest.json"));
  await copyFile("src/content/footer.css", resolve(DIST, "footer.css"));
  await copyFile("src/content/footer.html", resolve(DIST, "footer.html"));

  for (const size of [16, 32, 48, 128]) {
    const src = resolve("icons", `${size}.png`);
    if (existsSync(src)) await copyFile(src, resolve(DIST, "icons", `${size}.png`));
  }

  console.log("built dist/");
}

run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 15.2: Add placeholder icons**

Run:
```bash
mkdir -p icons
node -e "import('node:fs').then(({writeFileSync})=>{const b=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=','base64');for(const s of [16,32,48,128]) writeFileSync('icons/'+s+'.png',b);})"
```

Expected: four `icons/{16,32,48,128}.png` files exist (1×1 transparent PNGs).

- [ ] **Step 15.3: Run the build**

Run: `npm run build`
Expected: `dist/manifest.json`, `dist/background.js`, `dist/content.js`, `dist/page-context.js`, `dist/footer.{css,html}`, `dist/icons/*.png` all present.

- [ ] **Step 15.4: Commit**

```bash
git add scripts/build.mjs icons
git commit -m "build: esbuild bundle + asset copy to dist/"
```

---

## Task 16: Manual smoke test + README

**Files:**
- Create: `README.md`

- [ ] **Step 16.1: Write `README.md`**

```markdown
# Claude Usage Tracker

A Chrome extension (Manifest V3) that injects a persistent footer into `claude.ai` and `console.anthropic.com` showing your current plan and an at-a-glance usage metric.

## Develop

```bash
npm install
npm test            # vitest unit + integration
npm run typecheck
npm run build       # bundles into dist/
```

## Load unpacked

1. `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Visit `https://claude.ai`; the footer should appear at the bottom of the viewport.

## Sources

Data is read in priority order:
1. **Active fetch** — service worker calls `claude.ai`'s own internal endpoints with session cookies.
2. **Network intercept** — page-context script monkey-patches `fetch` and XHR to catch responses as they happen.
3. **DOM scrape** — last-resort scraping of known selectors when the first two fail.

See `docs/superpowers/specs/2026-04-29-claude-usage-tracker-design.md` for the full design.
```

- [ ] **Step 16.2: Run the full test suite once more**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass; `dist/` populated.

- [ ] **Step 16.3: Manual smoke**

1. Load `dist/` as an unpacked extension (steps in README).
2. Open `https://claude.ai` while signed in. Confirm:
   - Footer appears at the bottom of the viewport.
   - Plan label matches your account (Free / Pro / Team / Enterprise).
   - Metric appears within ~2 s and updates after sending a message.
   - Refresh button spins on click and re-fetches.
   - Theme matches when you toggle Anthropic's light/dark setting.
   - Footer sits **above** the chat input bar (does not cover it).
3. Open `https://console.anthropic.com` while signed in. Confirm `API` plan + spend metric.
4. Open DevTools → Service Workers; check the SW console for any warnings; resolve any seen.

If a metric does not appear, capture the raw response from DevTools → Network and add it as a new fixture in `test/fixtures/api/`. Then update `parse-usage.ts` (or `detect-plan.ts`) to recognize the field, add a test case, and re-run `npm test`. Never weaken an existing test to make a new fixture pass — extend the parser instead.

- [ ] **Step 16.4: Commit**

```bash
git add README.md
git commit -m "docs: add README with dev + load-unpacked instructions"
```

- [ ] **Step 16.5: Open a PR**

```bash
gh pr create --base main --head feat/usage-tracker \
  --title "feat: add Claude usage tracker chrome extension (v0.1.0)" \
  --body "$(cat <<'EOF'
## Summary
- Manifest V3 extension that injects a sticky footer on claude.ai and console.anthropic.com.
- Surfaces current plan + a tier-appropriate usage metric (messages remaining / spend / rate-limit %).
- Hybrid data source: active fetch (cookie auth) → network intercept → DOM scrape fallback.

## Test plan
- [ ] `npm test` green
- [ ] `npm run typecheck` clean
- [ ] `npm run build` produces a loadable `dist/`
- [ ] Manual smoke on claude.ai (Free or Pro account)
- [ ] Manual smoke on console.anthropic.com
EOF
)"
```

---

## Spec items deferred from v0.1 (track in follow-up issues)

The following spec requirements are intentionally **not** implemented in this plan to keep v0.1 shippable. Open issues for each before merging:

- **Exponential back-off on 429 from the usage endpoint** (spec §8). The plan handles `401` and 5xx. Adding persistent back-off requires writing a `nextAllowedFetchAt_<origin>` key into `chrome.storage` and gating `fetchAuthoritative` on it; non-persistent service worker memory is not enough. Defer to v0.2.
- **Playwright E2E against an unpacked extension** (spec §10). Vitest + happy-dom covers the rendering path in `test/integration/footer.test.ts`; full Playwright is reserved for v0.2.
- **`chrome.alarms`-driven refresh on tab focus.** Plan uses `visibilitychange` which is sufficient for the smart-poll cadence. `chrome.alarms` would only be required if we add a fixed-interval refresh later.

## Self-review notes (already applied)

- Spec coverage: every section of the design (architecture, components, data flow, error handling, UI behavior, testing, security) maps to at least one task. The dynamic `bottom` offset for chat-input collision (spec §7) is implemented in Task 12 (`installResizeObserver`).
- Placeholder scan: no `TBD`, no "implement later", no orphan references. Discovery uncertainty is contained to Task 5 (recording fixtures) with explicit `it.skip` fallbacks if a tier is unrecorded.
- Type consistency: `State`, `Plan`, `Metric`, `FormatOptions`, `FooterHandle`, and the message types (`fetch_usage`, `intercepted`, `state`) are referenced consistently across tasks. `Origin` is `"claude.ai" | "console.anthropic.com"` everywhere.
- Scope: a single feature, single plan, no decomposition needed.
