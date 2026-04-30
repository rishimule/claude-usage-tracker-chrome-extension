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
  it("returns null for unrelated URLs", () => {
    expect(matchEndpoint("https://example.com/foo")).toBeNull();
    expect(matchEndpoint("https://claude.ai/api/account/avatar")).toBeNull();
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
