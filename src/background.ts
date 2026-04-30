import { detectPlan } from "./lib/detect-plan";
import { parseUsage } from "./lib/parse-usage";
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
  return true;
});

async function handleIntercepted(host: string, payload: unknown, tabId?: number): Promise<void> {
  const origin = ORIGIN_FROM_HOST[host];
  if (!origin) return;
  const inner = isObj(payload) && "body" in payload ? (payload as { body: unknown }).body : payload;
  const next = applyPayload(origin, inner);
  if (next) {
    console.log("[cut] SW broadcast intercepted state", origin, next.kind === "ok" ? next.plan : next.kind);
    await broadcast(origin, next, tabId);
  } else {
    console.log("[cut] SW intercept did NOT yield state — body shape unrecognized", isObj(inner) ? Object.keys(inner).slice(0, 8) : typeof inner);
  }
}

function applyPayload(_origin: Origin, body: unknown): State | null {
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
      if (bootstrap.status === 401) return await broadcastIfWorse(origin, { kind: "error", reason: "unauth" }, tabId);
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
      if (billing.status === 401) return await broadcastIfWorse(origin, { kind: "error", reason: "unauth" }, tabId);
      const state = applyPayload(origin, billing.body);
      if (state) await broadcast(origin, state, tabId);
    }
  } catch (err) {
    // Active fetch is best-effort. Intercepted traffic from page-context.js
    // is the primary source. Don't overwrite a cached "ok" state with a
    // network error just because our guess at the endpoint URL was wrong.
    console.warn("[cut] active fetch failed", err);
    await broadcastIfWorse(origin, { kind: "error", reason: "network" }, tabId);
  }
}

/**
 * Broadcasts an error state only if no successful state is already cached.
 * This prevents transient/optional active-fetch failures from clobbering a
 * good intercepted snapshot.
 */
async function broadcastIfWorse(origin: Origin, errState: State, tabId?: number): Promise<void> {
  const existing = await chrome.storage.local.get(STORAGE_KEY(origin));
  const cached = existing[STORAGE_KEY(origin)] as State | undefined;
  if (cached && cached.kind === "ok") return; // keep good cached value
  await broadcast(origin, errState, tabId);
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      credentials: "include",
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
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
    chrome.tabs.sendMessage(tab.id, { type: "state", origin, state }).catch(() => { /* tab gone */ });
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
