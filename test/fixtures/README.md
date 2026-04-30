# Fixtures

**Current state:** Only Enterprise (`enterprise-usage.json`) and API console (`console-spend.json`) fixtures contain real data. All other files (`free-bootstrap.json`, `pro-bootstrap.json`, `team-bootstrap.json`, `message-rate-limit-headers.json`) are still empty `{}` placeholders — the corresponding unit test cases are auto-skipped until real recordings replace them. This is why the extension only works for Enterprise accounts today.

To unlock Free, Pro, or Team support, record the relevant fixture(s) following the instructions below.

## How to record API fixtures

For each available account tier (Free / Pro / Team / Enterprise / API):

1. Open `https://claude.ai` (or `https://console.anthropic.com` for the API tier) in Chrome and sign in.
2. DevTools → Network → enable **Preserve log**.
3. Reload the page. Filter by `bootstrap` and `organizations`. Right-click the response → **Copy** → **Copy response**.
4. Paste into the matching `api/*.json` file (replacing the empty `{}`).
5. Open Settings → Usage. Capture any XHR with `usage` in the path → `api/enterprise-usage.json`.
6. On `console.anthropic.com` → Settings → Billing/Usage. Capture the JSON containing spend-vs-limit → `api/console-spend.json`.
7. Send a chat message. If the response includes `x-rate-limit-*` headers or a `limits` block, save it as `{ "url": "...", "status": 200, "headers": {...}, "body": {...} }` → `api/message-rate-limit-headers.json`.

## How to record DOM fixtures

For each `dom/*.html` placeholder:

1. Open the relevant page on `claude.ai`.
2. Right-click the relevant region in the Elements panel → **Copy** → **Copy outerHTML**.
3. Wrap in `<!doctype html><html><body>…</body></html>` and save.

## Strip secrets before committing

Replace any session id / cookie / Bearer token with `"REDACTED"`, any email/name with `"user@example.com"` / `"User Example"`, any org id with `"org-redacted"`.

## What happens if a fixture is empty

Parser tests for that tier are auto-skipped via `it.skip`. The malformed-input cases still run, so the parsers stay covered against null / garbage payloads.
