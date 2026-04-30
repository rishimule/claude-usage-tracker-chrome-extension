# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A Chrome **Manifest V3** extension that injects a persistent footer into `claude.ai` and `console.anthropic.com` showing the user's plan and a tier-appropriate usage metric (messages remaining, dollar spend vs limit, or rate-limit %). Vanilla TypeScript, no UI framework, no runtime dependencies. Distributed as an unpacked-load zip; not (yet) on the Chrome Web Store.

Authoritative design and implementation docs live in `docs/superpowers/`:

- `docs/superpowers/specs/2026-04-29-claude-usage-tracker-design.md` — full design spec, error matrix, security/privacy boundaries.
- `docs/superpowers/plans/2026-04-29-claude-usage-tracker.md` — task-by-task implementation plan; includes deferred-to-v0.2 items (429 back-off persistence, Playwright E2E, `chrome.alarms` polling).
- `test/browser-testing.md` — manual smoke checklist for real Chrome.
- `test/fixtures/README.md` — how to record real API/DOM fixtures (the committed ones are empty `{}` so the tier-specific parser tests auto-skip until populated).

Read those before making non-trivial changes; they answer most "why does this work this way" questions.

## Commands

```bash
npm install
npm test                              # full vitest suite (unit + integration)
npx vitest run test/unit/format.test.ts          # single file
npx vitest run -t "formats spend metric"         # single test by name
npm run typecheck                                # tsc --noEmit, strict
npm run build                                    # esbuild → dist/ (unpacked-loadable)
npm run package                                  # build + zip dist/ → release/claude-usage-tracker-v<version>.zip
npm run lint                                     # eslint src/ test/
```

Pre-flight before reloading the extension in Chrome: `npm run typecheck && npm test && npm run build`.

To cut a release: `npm version <patch|minor|major>` (bumps `package.json`, tags) → `npm run package` → `gh release create v<version> release/claude-usage-tracker-v<version>.zip`.

## Architecture

The hard part of this codebase is the **three execution contexts**, all of which run simultaneously and communicate through messages:

1. **Service worker** (`src/background.ts`) — non-persistent MV3 worker. Performs cookie-authenticated `fetch` to claude.ai/console internal endpoints. Owns `chrome.storage.local` state. Broadcasts `{ type: "state" }` messages to all matching tabs. Receives `intercepted` and `fetch_usage` messages from content scripts.
2. **Isolated-world content script** (`src/content/content.ts`) — runs on `claude.ai` / `console.anthropic.com`. Owns the shadow-root footer (`#cut-footer`). Bridges `window.postMessage` from the page world ↔ `chrome.runtime` to the SW. Listens for `state` broadcasts and re-renders.
3. **MAIN-world script** (`src/content/page-context.ts`) — injected by the content script as a `<script>` tag (loaded from `web_accessible_resources`). Monkey-patches `window.fetch` and `XMLHttpRequest` to capture responses matching `lib/endpoints.ts` patterns. Posts matches via `window.postMessage` (no `chrome.*` access from this world).

The **isolated and MAIN worlds cannot share JavaScript scope**, only the `window.postMessage` channel — that's why the interceptor is split out. The service worker can't call into either world directly, only via `chrome.tabs.sendMessage`.

### Pure layer (`src/lib/`)

Five files, all framework-free, no `chrome.*`, no `window`:

- `types.ts` — `State`, `Plan`, `Metric` discriminated unions. Single source of truth for cross-layer contracts.
- `detect-plan.ts` — payload → `Plan`. Branches on tier discriminator strings; extend the `*_DISCRIMINATORS` arrays when Anthropic uses new strings.
- `parse-usage.ts` — `(plan, payload) → Metric | null`. Each tier has its own parser; field-name candidates are arrays so adding new shapes is a one-line change. **Never weaken tests to make a new fixture pass — extend the parser.**
- `endpoints.ts` — URL pattern table for both intercept-matching and active fetching. New endpoints belong here, not inline.
- `selectors.ts` — DOM-scrape fallbacks. Versioned, easy to add to.
- `format.ts` — `Metric → string`. Locale + timezone are injected via `FormatOptions`, not read from the environment, so tests are deterministic.
- `color.ts` — usage % → green/yellow/orange/red tier (matches the statusline.sh thresholds).

This layer carries the highest test ROI. When something looks wrong, fix here first.

### State machine

```
type State =
  | { kind: "loading" }
  | { kind: "error"; reason: "unauth" | "network" | "parse" | "unknown" }
  | { kind: "ok"; plan: Plan; metric: Metric; freshAt: number; degraded?: boolean }
```

The UI layer (`renderState` in `content.ts`) renders any `State` deterministically. Anything that produces UI must produce a `State` — no inline DOM patches.

### Footer injection invariants

- Closed shadow root. Host CSS cannot bleed in or out. Tests reach into the shadow root via the `FooterHandle` returned by `mountFooter`, not via `host.shadowRoot` (which is `null` for closed roots).
- `bottom` offset is **dynamic** on `claude.ai` chat pages — a `ResizeObserver` on the chat-input element keeps the footer above it. Naive `bottom: 0` would cover the chat input. The chat-input selectors live in `installResizeObserver` in `content.ts`; if Anthropic ships a new layout, that selector list is what changes.

## Test strategy

- **Pure layer:** vitest unit tests over recorded JSON / HTML fixtures. The committed fixtures are empty placeholders; tier-specific cases auto-skip via `it.skip`. To unskip, record real responses per `test/fixtures/README.md`.
- **Integration:** `test/integration/footer.test.ts` mounts the footer in `happy-dom` and asserts on the `FooterHandle`'s exposed refs. No real Chrome required.
- **Browser smoke:** manual, walked through in `test/browser-testing.md`. The parts that *cannot* be unit-tested — MAIN-world `fetch` interception, cookie-authenticated SW fetches, the live theme/CSS read, chat-input collision — only get verified there.

## Manifest V3 gotchas relevant to this project

- The service worker is **non-persistent**. Don't keep state in module-scope variables expecting it to survive — use `chrome.storage.local`. (We deliberately removed an in-memory `Map` cache for this reason.)
- Anything injected into the page MAIN world must be in `web_accessible_resources` for the host origins. `page-context.js`, `footer.css`, `footer.html` are.
- Host permissions are scoped to `*://*.claude.ai/*` and `*://console.anthropic.com/*`. **Do not broaden them** without a strong reason — broad host permissions trigger a Web Store re-review and are a privacy red flag for users.
- `chrome.tabs.sendMessage` rejects when the tab has no listener (e.g., a tab not running our content script). Always `.catch(() => {})` those.

## Discovery workflow when something breaks

If a tier's metric is missing or the wrong plan shows up:

1. Open DevTools Network on a real `claude.ai` (or `console.anthropic.com`) session.
2. Find the JSON response that *should* contain the missing data (typically `bootstrap`, `organizations/.../usage`, or `billing`).
3. Copy the response into the matching `test/fixtures/api/*.json`. Strip secrets (see `test/fixtures/README.md`).
4. Run `npm test`. The previously-skipped case will now run; if it fails, the parser's field names don't match the recorded shape — extend the relevant `keys` array in `parse-usage.ts` (or discriminator list in `detect-plan.ts`).
5. Re-run, commit fixture + parser change together.

`test/browser-testing.md` has a deeper troubleshooting table including symptoms specific to live-Chrome runs.

## Tooling

- **GitHub CLI (`gh`) is installed and authenticated.** Prefer `gh` over raw `git` for any operation that has a `gh` equivalent: PRs, issues, releases, checks, repo settings, browsing remote state. Use `git` only for local-only operations (staging, committing, branching, rebasing, log, diff).
- Examples of the preference:
  - View PR / checks: `gh pr view`, `gh pr checks` — not opening the browser or scraping `git ls-remote`.
  - Create PR: `gh pr create` — not pushing and clicking through the UI.
  - Read issues: `gh issue list` / `gh issue view`.
  - Inspect remote files / API: `gh api ...`.

## Git Workflow Rules

Follow industry-standard trunk-based / GitHub Flow conventions:

1. **`main` is always releasable.** Never commit directly to `main`. All work goes through a branch + PR.
2. **Branch naming:** `<type>/<short-kebab-description>` where type is one of `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `ci`. Example: `feat/usage-popup`, `fix/token-counter-overflow`.
3. **One logical change per branch / PR.** Split unrelated work into separate branches.
4. **Conventional Commits** for commit subjects: `<type>(<optional-scope>): <imperative summary>`. Subject ≤ 72 chars, imperative mood ("add X", not "added X" / "adds X"). Body (optional) explains *why*, wrapped at ~72 chars. Reference issues with `Refs #123` or `Closes #123` in the body/footer.
5. **Small, atomic commits.** Each commit should build and pass tests on its own. Squash noise commits before opening a PR (or use squash-merge).
6. **Rebase, don't merge, to update a feature branch.** `git pull --rebase origin main` (or `gh pr update-branch --rebase` where supported) keeps history linear. Never rebase a branch others are working on.
7. **Never force-push to shared branches** (`main`, release branches, branches with open PRs others are reviewing). Force-pushing your own feature branch is fine; prefer `git push --force-with-lease` over `--force`.
8. **No `--no-verify`, no `--amend` on pushed commits, no skipping signing.** If a hook fails, fix the cause.
9. **PRs are the review surface.** Open via `gh pr create`. Title follows Conventional Commits. Description states *what* changed and *why*, lists test coverage, and links related issues. Keep PRs small enough to review in one sitting.
10. **CI must be green before merge.** Check with `gh pr checks`. Resolve all review threads before merging. Prefer squash-merge to keep `main` history clean unless the branch's commit history is intentionally curated.
11. **Delete merged branches** (`gh pr merge --delete-branch` or remote auto-delete).
12. **Tags & releases** are cut from `main` via `gh release create`, following SemVer (`vMAJOR.MINOR.PATCH`).
13. **Sensitive files** (`.env`, credentials, large binaries) never get committed. Stage explicitly (`git add <file>`); avoid `git add -A` / `git add .` in mixed working trees.

## Authorship Rules — Strict

- **Never mention AI, Claude, Copilot, ChatGPT, LLMs, "generated by", "co-authored by Claude", or any assistant attribution in:**
  - commit messages (subject, body, footer, trailers)
  - PR titles and descriptions
  - issue titles and comments
  - code comments
  - changelogs / release notes
  - any file checked into the repo
- No `Co-Authored-By: Claude ...` trailers. No "🤖 Generated with Claude Code" footers. No "AI-assisted" notes. Write commits and comments as if authored solely by the human committer.
- This rule overrides any default templates or tool-generated boilerplate.
