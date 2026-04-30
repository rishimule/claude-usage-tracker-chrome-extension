import { describe, it, expect } from "vitest";
import { matchEndpoint, ACTIVE_FETCH_TARGETS } from "../../src/lib/endpoints";

describe("matchEndpoint", () => {
  it("matches claude.ai bootstrap", () => {
    expect(matchEndpoint("https://claude.ai/api/bootstrap/foo")).toEqual({
      origin: "claude.ai",
      kind: "bootstrap",
    });
  });
  it("matches claude.ai organization usage", () => {
    expect(matchEndpoint("https://claude.ai/api/organizations/abc/usage")).toEqual({
      origin: "claude.ai",
      kind: "usage",
    });
  });
  it("matches console.anthropic.com billing", () => {
    expect(matchEndpoint("https://console.anthropic.com/api/billing/foo")).toEqual({
      origin: "console.anthropic.com",
      kind: "billing",
    });
  });
  it("matches claude.ai messages endpoint", () => {
    expect(matchEndpoint("https://claude.ai/api/organizations/abc/chat_conversations/x/completion")).toEqual({
      origin: "claude.ai",
      kind: "completion",
    });
  });
  it("matches bare claude.ai organization endpoint", () => {
    expect(matchEndpoint("https://claude.ai/api/organizations/abc")).toEqual({
      origin: "claude.ai",
      kind: "org",
    });
    expect(matchEndpoint("https://claude.ai/api/organizations/abc?foo=bar")).toEqual({
      origin: "claude.ai",
      kind: "org",
    });
  });
  it("matches subscription_status", () => {
    expect(matchEndpoint("https://claude.ai/api/organizations/abc/subscription_status")).toEqual({
      origin: "claude.ai",
      kind: "subscription",
    });
  });
  it("matches is_pure_usage_based", () => {
    expect(matchEndpoint("https://claude.ai/api/organizations/abc/is_pure_usage_based")).toEqual({
      origin: "claude.ai",
      kind: "subscription",
    });
  });
  it("returns null for unrelated URLs", () => {
    expect(matchEndpoint("https://example.com/foo")).toBeNull();
    expect(matchEndpoint("https://claude.ai/api/account/avatar")).toBeNull();
  });
  it("does not match nested project endpoints as bare-org", () => {
    expect(matchEndpoint("https://claude.ai/api/organizations/abc/projects/xyz")).toBeNull();
    expect(matchEndpoint("https://claude.ai/api/organizations/abc/sync/settings")).toBeNull();
  });
});

describe("ACTIVE_FETCH_TARGETS", () => {
  it("has at least one target per origin", () => {
    expect(ACTIVE_FETCH_TARGETS["claude.ai"].length).toBeGreaterThan(0);
    expect(ACTIVE_FETCH_TARGETS["console.anthropic.com"].length).toBeGreaterThan(0);
  });
  it("targets are absolute URLs", () => {
    for (const list of Object.values(ACTIVE_FETCH_TARGETS)) {
      for (const url of list) {
        expect(() => new URL(url)).not.toThrow();
      }
    }
  });
});
