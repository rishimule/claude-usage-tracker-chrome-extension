# Browser testing guide

This guide walks you through manually verifying the extension end-to-end in real Chrome. Automated tests in `test/unit/` and `test/integration/` cover the pure layers; the parts that *must* be exercised in a real browser are: cookie-authenticated fetches, MAIN-world `fetch`/`XHR` interception, the closed shadow-root footer rendering against Anthropic's live CSS, and the chat-input collision avoidance.

## Prerequisites

- Chrome (or any Chromium 120+ with MV3 service workers).
- A signed-in Claude account. **Currently only Enterprise accounts are confirmed working.** Free, Pro, and Team accounts will show "Usage unavailable" because the real API response shapes for those tiers have not been recorded as fixtures yet (see step 5 and `test/fixtures/README.md` if you want to contribute a recording).
- Optionally: a signed-in `console.anthropic.com` workspace if you want to verify the API path (confirmed working).

## 1. Build and load the extension

```bash
npm install
npm run build
```

In Chrome:

1. Go to `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select the `dist/` folder produced by the build.
4. The extension tile should appear with name "Claude Usage Tracker", version `0.1.0`. Note its **ID** (long random string) — you'll need it for the SW console.

If the tile shows a red **Errors** button, click it. Common causes: missing icon, manifest typo, syntax error in a bundled JS file. Fix and `npm run build` again, then click **Reload** on the tile.

## 2. Open the inspector that matters

Two consoles, both useful:

- **Service worker console** — open from the extension tile by clicking **Service worker** under "Inspect views". This is where `console.warn("[cut] ...")` lines from `src/background.ts` show up.
- **Page console** — open DevTools on the `claude.ai` tab itself. The content script runs in the isolated world; its `console` lands here. The MAIN-world script (`page-context.js`) also logs here, but only if you add `console.log` lines while debugging.

Keep both open while you smoke-test. The page console is also where you'll record network fixtures (see step 5).

## 3. Smoke checklist on `claude.ai`

In a fresh tab, sign into <https://claude.ai>. Within ~2 seconds the footer should appear at the bottom of the viewport.

Verify each item:

- [ ] **Footer visible** at the bottom. 32 px tall. Border on top.
- [ ] **Plan pill** on the left side shows your tier — `Free`, `Pro`, `Team`, or `Enterprise`. The pill text color changes per tier.
- [ ] **Metric** on the right side is non-empty. For Enterprise: `$420.48 / $500.00 (84%)`. For Free/Pro/Team the metric is **not yet functional** and will show "Usage unavailable" — this is expected until those tiers' fixtures are recorded (see step 6).
- [ ] **Percentage color** matches the threshold table: green < 50, yellow < 70, orange < 90, red ≥ 90. (Easiest to verify on Enterprise where the percentage is always visible.)
- [ ] **Refresh button** (↻ on far right). Click → it spins for ~500 ms, then settles. The metric refreshes.
- [ ] **Theme**: toggle Anthropic's light/dark setting (Settings → Appearance, or your system theme if you're on auto). The footer's background and text colors should follow.
- [ ] **Chat-input collision**: navigate into a conversation. The footer should sit *above* Claude's chat-input bar — not cover it. Scroll the conversation; the footer stays put and never overlaps the input area.
- [ ] **No layout breakage**: scroll to the very bottom of a long conversation. The last message should be visible above the footer; nothing important should be hidden behind it.

## 4. Smoke checklist on `console.anthropic.com`

Sign in to <https://console.anthropic.com>. Open any page within the workspace.

- [ ] Footer appears.
- [ ] Plan pill reads `API`.
- [ ] Metric reads as a spend value, e.g. `$1.23 / $10.00 (12%)`.

If the metric instead reads `Loading…` or `Usage unavailable` after 10 seconds, the SW couldn't reach the workspace's billing endpoint. Open the SW console and look for `[cut] fetch failed` or `[cut] background error`. Most likely cause: the billing JSON's field names differ from what `src/lib/parse-usage.ts` is currently looking for. Capture the response (step 5) and add the field name to the relevant `keys` array in `parse-usage.ts`.

## 5. Verify the three data sources independently

The extension uses a hybrid strategy: active fetch first, network intercept as a passive supplement, DOM scrape as a last resort. You can confirm each path is working.

### 5a. Active fetch (C′)

Reload the page. In the **service worker console**, you should see no warnings, and the footer should populate in well under 2 seconds. If you set a breakpoint in `dist/background.js` inside `fetchAuthoritative` (search for the function name), you can step through the bootstrap → org-id → usage hop.

To force a 401 path: log out of `claude.ai` in another tab, then click the refresh button. The footer should switch to `Sign in to Claude` within ~1 second.

### 5b. Network intercept (B)

While signed in, open the page DevTools → **Network** tab → filter for `bootstrap` or `usage`. Send a chat message. Each XHR Anthropic itself fires that matches `src/lib/endpoints.ts`'s patterns should be picked up by the MAIN-world script. You can confirm it's working by adding a temporary line at the top of `dist/page-context.js` (or to `src/content/page-context.ts` and rebuilding):

```js
console.log("[cut] page-context active");
```

You should see that line in the **page console** once per page load. After that, every matched response causes a `window.postMessage` that the isolated content script forwards to the SW. Watch the SW console for the resulting state changes.

### 5c. DOM scrape (A)

This is hardest to verify because it only fires when the first two paths produce nothing within ~4 seconds. Easiest check: open `chrome://extensions`, click **Disable** on the network access (or temporarily go offline via DevTools → Network → Throttling → Offline), then reload the page. After a moment the footer should still pick up *something* from the visible DOM (e.g., the "X messages remaining" banner), and the state will be flagged `degraded`. The metric text gets a `(degraded)` suffix in subdued color.

## 6. Capturing fixtures while you're here

The unit tests under `test/unit/` skip over any fixture file that's still the empty `{}` placeholder. Real recordings unlock the tier-specific assertions.

For each available account tier, while the page is open with DevTools → Network:

1. Find the response that matches one of the patterns in `src/lib/endpoints.ts` — look for `bootstrap`, `organizations/.../usage`, or `billing`.
2. Right-click the row → **Copy** → **Copy response**.
3. Paste into the matching file under `test/fixtures/api/` (replacing the `{}`).
4. Strip secrets per `test/fixtures/README.md` (session tokens, emails, org UUIDs).
5. Save.
6. Run `npm test`. The previously-skipped case for that tier should now run; if it fails, the parser's field names don't match what was recorded — see step 7.

## 7. When something doesn't show up

| Symptom                                        | Likely cause                                           | Fix                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Footer never appears                           | Content script didn't inject. Check page console.      | Confirm extension is enabled. Reload the tab. Check `chrome://extensions` for runtime errors.     |
| Footer says `Usage unavailable` indefinitely   | All three data paths returned no recognized payload.    | Record a fresh fixture (step 6), inspect its shape, add the field names to `parse-usage.ts`.      |
| Wrong plan pill (e.g. `Unknown` on a Pro acct) | Tier discriminator string changed.                      | Inspect the `bootstrap` response, find the new tier string, add it to a `*_DISCRIMINATORS` list. |
| Footer covers the chat input                   | The chat-input selectors in `src/content/content.ts`'s `installResizeObserver` no longer match. | Inspect Anthropic's current chat-input element; add a new selector to the `candidates` array.    |
| Theme doesn't follow on toggle                 | The CSS variable `--bg-000` was renamed.                | Inspect `<html>`'s computed style, find the current variable name, update `footer.css`.          |
| No spinner on refresh button click             | SW didn't respond within 500 ms or returned an error.   | Check SW console for warnings. Look for `[cut] fetch failed` and the underlying error.            |

## 8. Reloading after a code change

```bash
npm run build
```

In `chrome://extensions`, click **Reload** on the extension tile. Then reload the `claude.ai` tab. The new bundle is in effect.

If the SW seems stuck on an old version (rare but happens), click **Service worker** under "Inspect views" → in the DevTools that opens, click **Update** in the Application → Service Workers panel. Or just toggle the extension off and on again.

## 9. Quick sanity script

If you just want a one-shot check after a code change:

```bash
npm run typecheck && npm test && npm run build
```

All three should be green before you reload the extension. If they are and the browser still misbehaves, the bug is in the parts only Chrome runs — the live `fetch` interception, the SW message bus, or the DOM injection — and the steps above are how you isolate which.
