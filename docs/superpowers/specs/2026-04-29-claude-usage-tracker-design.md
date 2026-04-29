# Claude Usage Tracker — Design Spec

**Date:** 2026-04-29
**Status:** Draft, awaiting review
**Owner:** Rishi Mule

## 1. Purpose

A Chrome extension (Manifest V3) that injects a persistent footer into the Claude web interface (`claude.ai`) and the Anthropic Console (`console.anthropic.com`). The footer surfaces the user's current plan and an at-a-glance usage metric appropriate to that plan, refreshed without requiring the user to navigate to a settings page.

## 2. Goals & Non-Goals

**Goals**

- Single-glance visibility into current usage on every page of the Claude web app.
- Survive routine UI changes by Anthropic without breaking core functionality.
- Stable, structured data sources first; DOM scraping only as last resort.
- Per-tier metrics: messages-remaining + reset for Free/Pro, billing $/limit for Enterprise/API.
- Theme-matched UI (dark/light) using Anthropic's own CSS variables.

**Non-Goals (v1)**

- No popup, options page, or settings UI. The only control is a refresh button in the footer.
- No telemetry, no remote logging, no analytics.
- No multi-account aggregation. Footer reflects whatever the current tab's session shows.
- No automated publishing pipeline.
- No dismiss / hide control. The user requested a "persistent" footer.
- No Firefox / Safari support in v1. Chromium MV3 only.

## 3. Architecture

```
[claude.ai or console.anthropic.com tab]
   |
   |-- content/content.js                  (isolated world)
   |     - waits for DOM via MutationObserver
   |     - injects shadow-root footer (#cut-footer)
   |     - injects page-context.js into MAIN world via <script src=...>
   |     - bridges window.postMessage (page) <-> chrome.runtime (SW)
   |     - renders state changes; handles refresh-button clicks
   |
   |-- content/page-context.js             (MAIN world)
   |     - monkey-patches window.fetch and XMLHttpRequest
   |     - filters responses to known endpoint patterns
   |     - posts matching payloads back to content.js via window.postMessage
   |
   |-- content/footer.css                  (shadow-root scoped)
   |
[Service worker (background.js)]
   - receives "intercepted" messages from content.js
   - performs authoritative active fetches (C') with credentials:"include"
   - parses payloads via lib/detect-plan + lib/parse-usage
   - persists last successful state per origin in chrome.storage.local
   - broadcasts state changes to all matching tabs
   - chrome.alarms: refresh on tab focus only (no fixed timer)
```

Two execution worlds are required because Manifest V3 isolated content scripts cannot patch the page's own `fetch` / `XHR`. The MAIN-world script handles interception; the isolated content script owns DOM injection and message bridging. The service worker performs authoritative fetches off the page's main thread and is the single source of truth for state.

## 4. Components & Files

```
manifest.json                  MV3 manifest, perms, content_scripts, web_accessible_resources
src/
  background.js                service worker; auth fetches; chrome.alarms; storage; broadcast
  content/
    content.js                 isolated world; DOM injection, message bridge, render
    page-context.js            MAIN world; fetch/XHR monkey-patch; postMessage
    footer.css                 sticky-footer styles, dark/light via CSS vars
    footer.html                template fragment loaded via fetch(chrome.runtime.getURL)
  lib/
    detect-plan.js             pure: classify org payload -> Plan
    parse-usage.js             pure: extract Metric per tier
    format.js                  pure: render Metric -> human string
    selectors.js               versioned DOM scrape fallbacks
    endpoints.js               URL patterns for B-intercept and C' active fetch
icons/
  16.png 32.png 48.png 128.png
test/
  fixtures/                    recorded JSON + HTML samples for unit/snapshot tests
  unit/                        vitest specs for pure layer
  integration/                 Playwright loading dist/ as unpacked extension
```

### Boundary contracts

```ts
type State =
  | { kind: "loading" }
  | { kind: "error"; reason: "unauth" | "network" | "parse" | "unknown" }
  | { kind: "ok"; plan: Plan; metric: Metric; freshAt: number; degraded?: boolean };

type Plan = "Free" | "Pro" | "Team" | "Enterprise" | "API" | "Unknown";

type Metric =
  | { type: "messages"; remaining: number; resetsAt: number; window: "5h" | "daily" }
  | { type: "spend"; usedCents: number; limitCents: number; pct: number }
  | { type: "rate"; pct: number; resetsAt: number; window: "5h" | "7d" };
```

The three layers (Detection, Transport, UI) only know each other through `State`. Detection and parsing are pure functions over recorded fixtures, with no browser API dependency, so they are fast and trivially unit-testable.

## 5. Data Sources (Hybrid D)

In priority order:

1. **C' — Active fetch.** Service worker calls the Claude web app's *own* internal endpoints (e.g. `/api/organizations/{org}/usage`, `/api/bootstrap`, the message-rate endpoints) using `credentials:"include"` so the browser attaches the user's session cookies. These are the same endpoints the Anthropic UI itself consumes. Exact paths to be confirmed during implementation by recording DevTools Network traffic against real Free, Pro, and Enterprise sessions; URLs are kept in `lib/endpoints.js` so they can be swapped without touching transport.
2. **B — Network intercept.** `page-context.js` monkey-patches `window.fetch` and `XMLHttpRequest`. Responses whose URL matches the same patterns are postMessaged to the content script and forwarded to the service worker. This catches values mid-session without an active call (e.g., the chat header's "messages remaining" updates after each send).
3. **A — DOM scrape.** Last resort. If both C' and B produced no data within ~4 s of page load, walk known selectors in `lib/selectors.js` (account menu badge, Settings → Usage page, chat-header limit text) and regex out price + count strings. Versioned selector map so a UI change is a one-file fix. Resulting state is flagged `degraded:true`.

The Claude Code statusline endpoint (`https://api.anthropic.com/api/oauth/usage`) is **not** used: it requires a Bearer token from Claude Code's OAuth credential store, which a Chrome extension running in the `claude.ai` origin does not have. The web app uses cookie-authenticated internal endpoints instead.

## 6. Refresh Cadence (Smart Poll)

- **On tab load:** read `chrome.storage.local["lastState_<origin>"]` and render immediately if present (instant paint, possibly stale, marked with subtle freshness hint if older than 10 minutes).
- **On tab focus** (`chrome.tabs.onActivated` / `visibilitychange`): trigger one C' fetch.
- **On every intercepted response (B):** update state immediately.
- **On manual refresh-button click:** trigger one C' fetch. Button is debounced 2 s and shows a spin animation while pending.
- **No fixed timer.** Anthropic's quota numbers only change when the user sends messages or an hour boundary ticks; polling on focus + post-send capture covers both without burning requests while idle.

Per-origin state is scoped: `claude.ai` and `console.anthropic.com` have separate cache keys, separate endpoint sets, and separate parsers. `console.anthropic.com` reflects API workspace spend; `claude.ai` reflects subscription / Enterprise quota.

## 7. UI Behavior

- **Theme detection.** Read the computed value of `--bg-000` (Anthropic's own CSS variable) from `document.documentElement`. If empty, fall back to `prefers-color-scheme`. The footer uses its own scoped CSS variables derived from the read. A `MutationObserver` on `<html>`'s `class` attribute re-reads on theme toggle.
- **Layout.** `position: fixed; left: 0; right: 0; height: 32px; z-index: 2147483646` (one below max int to avoid clobbering modal overlays). The `bottom` offset is **dynamic**, not `0`: on `claude.ai` chat pages there is already a fixed chat-input bar at the bottom, so a naive `bottom: 0` would obscure it. A `ResizeObserver` watches the chat-input container (located via `lib/selectors.js`); the footer's `bottom` is set to that element's measured height, with a debounced re-measure on viewport changes. On pages with no chat input (settings, console.anthropic.com) the footer falls back to `bottom: 0`. Rendered inside a closed shadow root attached to a host `<div id="cut-footer">` injected as the last child of `document.body`. A second `MutationObserver` re-injects the host if the page's framework removes it during navigation. Shadow root prevents host CSS from leaking in or out.
- **Left segment.** Plan pill, color-coded: Free=gray, Pro=blue, Team=purple, Enterprise=gold, API=teal.
- **Right segment.** Metric string from `format.js`. Examples:
  - `"Pro · 15 messages left until 4:00 PM"`
  - `"Enterprise · $420.48 / $500.00 (84%)"`
  - `"Free · 8 messages left · resets 9:30 PM"`
  - The percentage number is colored using the same thresholds as `statusline.sh`: green < 50, yellow < 70, orange < 90, red >= 90.
- **Refresh button.** 16 px ↻ icon, right-most. Click triggers manual `fetch_usage`. Spin animation while pending. Disabled for 2 s after click.
- **Page-content offset.** On pages where the footer sits at `bottom: 0` (no chat input), a `body { padding-bottom: 32px !important }` rule is added via a separate stylesheet element inserted at runtime so scrollable content is not occluded. On chat pages the footer floats above the chat-input bar, which already manages its own bottom offset, so no padding rule is added. Any inserted stylesheet is removed on extension disable via the port-disconnect listener.
- **Persistent.** No dismiss button in v1.

## 8. Error Handling

| Failure                       | Detection                       | UI behavior                                                |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------- |
| Not signed in                 | 401 from C'                     | "Sign in to Claude" hint, no metric                        |
| Network unavailable           | fetch throws / 8 s timeout      | Last cached value, with `~stale` indicator                 |
| Unknown plan                  | `detect-plan` returns `null`    | "Unknown plan" + last known metric, if any                 |
| Parse failure                 | `parse-usage` throws            | Cached value retained; warn to SW console only             |
| All paths silent for 10 s     | T1 + T3 + T4 produced no state  | "Usage unavailable" + manual refresh button pulses gently  |
| 429 from usage endpoint       | response status                 | Exponential back-off: 30 s → 2 m → capped at 10 m          |

No telemetry, no remote logging. All failures are local (`console.warn` from the service worker).

## 9. Security & Privacy

- **Permissions** (manifest):
  - `activeTab`, `scripting`, `storage`, `alarms`
  - host permissions: `*://*.claude.ai/*`, `*://console.anthropic.com/*`
  - **No** broad host permissions. **No** `<all_urls>`.
- The extension only reads its target origins. It never sends data anywhere outside those origins.
- `chrome.storage.local` holds only the most-recent parsed state per origin (plan + metric + timestamp). No tokens, no cookies, no message contents.
- The MAIN-world `page-context.js` is `web_accessible_resources` for the two host origins only.
- The service worker performs fetches with `credentials:"include"` — this is the same trust boundary the user is already inside; no credentials are exfiltrated.

## 10. Testing

- **Pure layer** (`detect-plan`, `parse-usage`, `format`): vitest unit tests over recorded JSON fixtures from real Free, Pro, Team, Enterprise, and API responses. This is where the highest-ROI coverage sits — it pins behavior against the actual shapes Anthropic returns and is the first thing to update when those shapes change.
- **Selector layer**: snapshot DOM fixtures saved as HTML files under `test/fixtures/dom/`. A UI change is handled by saving a new fixture, updating the relevant entry in `selectors.js`, and re-running snapshot tests.
- **Integration**: Playwright loads `dist/` as an unpacked extension against a static HTML harness that mocks `claude.ai` responses. Verifies footer renders correctly across loading / error / ok states and survives a simulated theme toggle.
- **Manual smoke**: real `claude.ai` login on Free and Pro accounts before each release. No automated end-to-end tests against production.
- **CI**: GitHub Actions runs `npm test` on every PR. No store auto-publish; releases are manual zip + Chrome Web Store upload.

## 11. Open Questions

- Exact paths and shapes of the internal claude.ai / console.anthropic.com usage endpoints — must be discovered by recording network traffic during implementation. The `endpoints.js` module is designed to absorb this discovery without changing other layers.
- Whether the same endpoint serves Free vs Pro vs Team or whether each tier surfaces a different shape. Detection logic will branch accordingly.
- Whether `console.anthropic.com` exposes spend-vs-limit on every page or only on the billing page. May force B (intercept-only) for that origin if it does not.

## 12. Out-of-Scope Future Work

- Options page for color customization, position (top vs bottom), and refresh frequency.
- Multi-org switcher when one user belongs to several orgs.
- Firefox / Edge / Safari ports.
- Optional dismiss / collapse control.
- Push notifications when usage crosses configurable thresholds.
- Daily / weekly history graph in a popup.
