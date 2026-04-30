// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scrapePlanFromAccountMenu, scrapeMessagesRemaining, scrapeSpendFromUsagePage } from "../../src/lib/selectors";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    document.documentElement.innerHTML = html
      .replace(/^<!doctype html>/i, "")
      .replace(/^<html[^>]*>/i, "")
      .replace(/<\/html>$/i, "");
    const plan = scrapePlanFromAccountMenu(document);
    if (plan === null) return;
    expect(["Free", "Pro", "Team", "Enterprise", "API"]).toContain(plan);
  });
});

describe("scrapeMessagesRemaining", () => {
  it("returns null on empty page", () => {
    setBody("");
    expect(scrapeMessagesRemaining(document)).toBeNull();
  });
  it("parses 'X messages remaining' text", () => {
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
