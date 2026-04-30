# Claude Usage Tracker

> **Current status:** Only tested and confirmed working with **Enterprise** accounts. Free, Pro, and Team tiers are not yet functional — the extension will show "Usage unavailable" for those plans until the corresponding API endpoint shapes are confirmed and recorded as fixtures (see [Contributing](#contributing--recording-fixtures)).

A Chrome extension (Manifest V3) that injects a persistent footer into `claude.ai` and `console.anthropic.com` showing your current plan and an at-a-glance usage metric (messages remaining, spend vs limit, or rate-limit %, depending on tier).

The footer:

- Sits at the bottom of every page (above the chat input on `claude.ai`).
- Matches Claude's light/dark theme.
- Updates automatically as you use Claude (no polling), plus a manual refresh button.

---

## Install (end users)

There are two ways to install. The fastest is to grab a release zip and load it unpacked.

### Option A — Install a release zip

1. Download the latest release zip — `claude-usage-tracker-v<version>.zip` — from the [Releases](https://github.com/rishimule/claude-usage-tracker-chrome-extention/releases) page (or build one locally with `npm run package`; see below).
2. Unzip it to a folder you don't plan to delete (e.g. `~/Applications/claude-usage-tracker/`). Chrome reads the files from this folder every time it starts, so don't move or delete it after installing.
3. Open Chrome and go to `chrome://extensions`.
4. Toggle **Developer mode** on (top-right corner).
5. Click **Load unpacked** and select the unzipped folder.
6. The extension is now installed. Visit <https://claude.ai> and the footer should appear within a second or two.

To update later: download the new zip, replace the folder contents, and click **Reload** on the extension's tile in `chrome://extensions`.

### Option B — Build from source

Requires Node.js 20+ and npm.

```bash
git clone https://github.com/rishimule/claude-usage-tracker-chrome-extention.git
cd claude-usage-tracker-chrome-extention
npm install
npm run build
```

Then in Chrome:

1. `chrome://extensions` → toggle **Developer mode** on.
2. Click **Load unpacked** and select the `dist/` folder produced by the build.

---

## Use it

Once installed and you're signed in to Claude, the footer appears at the bottom of `https://claude.ai` and `https://console.anthropic.com`:

- **Left side** — a colored pill showing your plan: `Free`, `Pro`, `Team`, `Enterprise`, or `API`.
- **Right side** — your tier-appropriate metric:
  - Enterprise (**currently working**): `$420.48 / $500.00 (84%)`
  - API console (**currently working**): same dollar form
  - Free / Pro / Team (**not yet working**): intended to show `15 messages left · resets 16:00`, but currently displays "Usage unavailable" — see the note at the top of this README
  - Subscription rate windows when reported: `5h: 73% · resets 13:30` or `7d: 22% · resets May 4, 08:00`
- **Refresh button** (↻) on the far right — click to force a re-fetch. It spins while the request is in flight and is disabled for two seconds after each click.

The percentage number is colored:

| Range  | Color   |
| ------ | ------- |
| 0–49 % | green   |
| 50–69 %| yellow  |
| 70–89 %| orange  |
| ≥ 90 % | red     |

If the footer shows `Sign in to Claude`, you are not authenticated on the current tab. Sign in and the footer updates automatically.

---

## What it does *not* do

- Does not send any data anywhere outside `claude.ai` / `console.anthropic.com`.
- Does not store your chat content or any personal data — only the most-recent parsed `{ plan, metric, timestamp }` object, in `chrome.storage.local`.
- Does not require any login of its own. It reuses your existing Claude session cookies via the browser, exactly as Claude's own UI does.
- Does not track you across other sites.

The required permissions are `activeTab`, `scripting`, `storage`, `alarms`, plus host permissions limited to `*://*.claude.ai/*` and `*://console.anthropic.com/*`.

---

## Develop

```bash
npm install
npm test            # vitest unit + integration
npm run typecheck
npm run build       # bundles into dist/
npm run package     # build then zip dist/ → release/claude-usage-tracker-v<version>.zip
```

### Data sources

Data is read in priority order:

1. **Active fetch** — the service worker calls `claude.ai`'s own internal endpoints with session cookies.
2. **Network intercept** — a MAIN-world script monkey-patches `fetch` and `XMLHttpRequest` to catch responses as they happen.
3. **DOM scrape** — last-resort scraping of known selectors when the first two fail.

### Recording fixtures

The parser unit tests under `test/unit/` rely on real recorded API responses in `test/fixtures/api/`. The committed files start as empty `{}` placeholders, so the tier-specific test cases auto-skip until real data is dropped in. See `test/fixtures/README.md` for the recording procedure.

### Releases

```bash
npm version patch     # or minor / major; bumps package.json + creates a tag
npm run package       # produces release/claude-usage-tracker-v<version>.zip
```

Upload the zip to the GitHub Releases page (or to the Chrome Web Store dashboard if/when published).

---

## Contributing / Recording fixtures

Free, Pro, and Team support requires recording real API responses from those account tiers. If you have one of these accounts:

1. Open `https://claude.ai`, sign in, open DevTools → Network → enable **Preserve log**.
2. Reload the page. Locate the `bootstrap` or `organizations/.../usage` response.
3. Copy the response body and paste it into the matching file under `test/fixtures/api/` (e.g. `free-bootstrap.json`, `pro-bootstrap.json`, `team-bootstrap.json`).
4. Strip secrets per `test/fixtures/README.md`.
5. Run `npm test`. If the previously-skipped case now fails, the field names in the response don't match `src/lib/parse-usage.ts` — extend the relevant `keys` array there and re-run.
6. Open a PR with the fixture + any parser change.

See `test/fixtures/README.md` and `test/browser-testing.md` for the full recording procedure.

---

## Design

See `docs/superpowers/specs/2026-04-29-claude-usage-tracker-design.md` for the full design and `docs/superpowers/plans/2026-04-29-claude-usage-tracker.md` for the implementation plan.
