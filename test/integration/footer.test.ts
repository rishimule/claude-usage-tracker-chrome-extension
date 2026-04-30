// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderState, mountFooter, unmountFooter } from "../../src/content/content";
import type { State } from "../../src/lib/types";

describe("footer rendering", () => {
  it("mounts a host element", () => {
    document.body.innerHTML = "";
    mountFooter(document);
    const host = document.getElementById("cut-footer");
    expect(host).not.toBeNull();
    expect((host as HTMLElement).getAttribute("data-cut-mounted")).toBe("1");
  });

  it("renders 'Loading…' on loading state", () => {
    document.body.innerHTML = "";
    const handle = mountFooter(document);
    renderState(handle, { kind: "loading" });
    expect(handle.metricEl.textContent).toContain("Loading");
  });

  it("renders an ok state", () => {
    document.body.innerHTML = "";
    const handle = mountFooter(document);
    const state: State = {
      kind: "ok",
      plan: "Pro",
      metric: { type: "messages", remaining: 15, resetsAt: new Date("2026-04-29T16:00:00Z").getTime(), window: "5h" },
      freshAt: new Date("2026-04-29T12:00:00Z").getTime(),
    };
    renderState(handle, state, { now: state.freshAt, locale: "en-US", timeZone: "UTC" });
    expect(handle.planEl.textContent).toBe("Pro");
    expect(handle.planEl.getAttribute("data-plan")).toBe("Pro");
    expect(handle.metricEl.textContent).toContain("15 messages left");
  });

  it("renders an error state with hint", () => {
    document.body.innerHTML = "";
    const handle = mountFooter(document);
    renderState(handle, { kind: "error", reason: "unauth" });
    expect(handle.metricEl.textContent?.toLowerCase()).toContain("sign in");
  });

  it("unmount removes the host", () => {
    document.body.innerHTML = "";
    const handle = mountFooter(document);
    unmountFooter(handle);
    expect(document.getElementById("cut-footer")).toBeNull();
  });
});
