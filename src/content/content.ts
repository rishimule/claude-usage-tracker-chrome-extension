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

const FOOTER_CSS_URL = "footer.css";

export function mountFooter(doc: Document): FooterHandle {
  const existing = doc.getElementById("cut-footer");
  if (existing) existing.remove();

  const host = doc.createElement("div");
  host.id = "cut-footer";
  host.setAttribute("data-cut-mounted", "1");
  host.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${FOOTER_HEIGHT_PX}px;z-index:2147483646;pointer-events:auto;`;
  doc.body.appendChild(host);

  const root = host.attachShadow({ mode: "closed" });
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    const style = doc.createElement("link");
    style.rel = "stylesheet";
    style.href = chrome.runtime.getURL(FOOTER_CSS_URL);
    root.appendChild(style);
  }
  const wrapper = doc.createElement("div");
  wrapper.innerHTML = FOOTER_HTML;
  const barEl = wrapper.firstElementChild;
  if (!barEl) throw new Error("footer template empty");
  root.appendChild(barEl);

  const planEl = root.querySelector<HTMLElement>(".cut-pill");
  const metricEl = root.querySelector<HTMLElement>(".cut-metric");
  const refreshBtn = root.querySelector<HTMLButtonElement>(".cut-refresh");
  if (!planEl || !metricEl || !refreshBtn) throw new Error("footer DOM missing required nodes");

  const handle: FooterHandle = { host, root, planEl, metricEl, refreshBtn, cleanups: [] };

  installLayoutShift(doc, handle);
  installSidebarOffset(doc, handle);

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
    case "ok": {
      handle.planEl.setAttribute("data-plan", state.plan);
      handle.planEl.textContent = formatPlanLabel(state.plan);
      const text = formatMetric(state.metric, fmt);
      const pct = pickPct(state);
      const pctClass = pct === null ? "" : usageColor(pct);
      handle.metricEl.innerHTML = pct === null ? escapeHtml(text) : decoratePct(text, pctClass);
      if (state.degraded) handle.metricEl.appendChild(makeStaleNote("(degraded)"));
      return;
    }
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

// Sidebar selectors in specificity order — update when claude.ai re-skins.
const SIDEBAR_SELECTORS = [
  '[data-testid="sidebar"]',
  'nav[class*="sidebar" i]',
  'div[class*="sidebar" i]',
  'nav[aria-label*="navigation" i]',
  'nav',
] as const;

function findSidebar(doc: Document): Element | null {
  for (const sel of SIDEBAR_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// Offsets footer left edge to match sidebar width so it only spans the main
// content area. Uses MutationObserver to wait for React to render the sidebar,
// then ResizeObserver to track collapse/expand transitions.
function installSidebarOffset(doc: Document, handle: FooterHandle): void {
  let ro: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;

  function attach(sidebar: Element): void {
    const update = (): void => {
      const w = (sidebar as HTMLElement).getBoundingClientRect().width;
      handle.host.style.left = w > 0 ? `${w}px` : "0";
    };
    update();
    ro = new ResizeObserver(update);
    ro.observe(sidebar);
  }

  const existing = findSidebar(doc);
  if (existing) {
    attach(existing);
    handle.cleanups.push(() => ro?.disconnect());
    return;
  }

  // Sidebar not yet in DOM (React lazy-render) — wait for it.
  mo = new MutationObserver(() => {
    const sidebar = findSidebar(doc);
    if (sidebar) {
      mo!.disconnect();
      mo = null;
      attach(sidebar);
    }
  });
  mo.observe(doc.body, { childList: true, subtree: true });
  handle.cleanups.push(() => { mo?.disconnect(); ro?.disconnect(); });
}

// Selectors for elements that, when position:fixed, need to be nudged up.
// data-testid="chat-input" is on the ProseMirror contenteditable itself (not
// an outer wrapper), so we must confirm position:fixed at runtime — applying
// bottom:32px to a position:relative contenteditable clips text in its
// overflow-y:auto parent, making typed text invisible (confirmed on /new).
const FIXED_BOTTOM_SELECTORS = [
  "[data-testid='chat-input']",
  "form[action*='completion']",
  "footer[role='form']",
  "div[class*='chat-input' i]",
] as const;

function installLayoutShift(doc: Document, handle: FooterHandle): void {
  const styleEl = doc.createElement("style");
  styleEl.setAttribute("data-cut-shift", "1");
  styleEl.textContent = `
    body { padding-bottom: ${FOOTER_HEIGHT_PX}px !important; }

    [class*='disclaimer' i],
    [data-testid*='disclaimer' i] {
      margin-bottom: ${FOOTER_HEIGHT_PX}px !important;
    }
  `;
  doc.head?.appendChild(styleEl);
  handle.cleanups.push(() => styleEl.remove());

  installFixedInputOffset(doc, handle);
}

// Applies bottom offset only to confirmed position:fixed elements so we never
// affect in-flow inputs (e.g. the /new home page where the same data-testid
// is on a relative-positioned contenteditable inside overflow-y:auto).
function installFixedInputOffset(doc: Document, handle: FooterHandle): void {
  const overridden = new Map<HTMLElement, string>();

  function applyOffsets(): void {
    for (const sel of FIXED_BOTTOM_SELECTORS) {
      for (const el of doc.querySelectorAll<HTMLElement>(sel)) {
        if (getComputedStyle(el).position !== "fixed") continue;
        if (!overridden.has(el)) {
          overridden.set(el, el.style.bottom);
          el.style.setProperty("bottom", `${FOOTER_HEIGHT_PX}px`, "important");
        }
      }
    }
  }

  applyOffsets();
  const mo = new MutationObserver(applyOffsets);
  mo.observe(doc.body, { childList: true, subtree: true });

  handle.cleanups.push(() => {
    mo.disconnect();
    for (const [el, orig] of overridden) el.style.bottom = orig;
  });
}

// --- Wiring (only in extension runtime) ---
// page-context.js is injected by the manifest as a separate content_script
// at run_at: document_start, world: MAIN. It must run before Anthropic's
// app bundle so its fetch/XHR patches catch the very first bootstrap call.
// We deliberately do NOT inject page-context.js from here.
export function bootstrapInExtension(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
  console.log("[cut] content loaded at", document.readyState, location.href);

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
    console.log("[cut] forwarding intercept to SW", msg.payload?.kind, msg.payload?.url);
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

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  bootstrapInExtension();
}
