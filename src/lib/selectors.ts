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
  if (!m || m[1] === undefined) return null;
  return { remaining: Number(m[1]) };
}

export function scrapeSpendFromUsagePage(doc: Document): { usedCents: number; limitCents: number } | null {
  const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ");
  const re = /\$([\d,]+\.\d{2})\s*(?:of|\/)\s*\$([\d,]+\.\d{2})/i;
  const m = text.match(re);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
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
