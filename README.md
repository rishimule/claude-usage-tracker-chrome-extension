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

## Recording fixtures

The parser unit tests under `test/unit/` rely on real recorded API responses in `test/fixtures/api/`. The committed files start as empty `{}` placeholders, so the tier-specific test cases auto-skip until real data is dropped in. See `test/fixtures/README.md` for the recording procedure.

## Design

See `docs/superpowers/specs/2026-04-29-claude-usage-tracker-design.md` for the full design and `docs/superpowers/plans/2026-04-29-claude-usage-tracker.md` for the implementation plan.
