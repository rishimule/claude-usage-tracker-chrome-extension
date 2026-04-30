// Runs in the MAIN world. Posts intercepted responses to the isolated content script.
import { matchEndpoint } from "../lib/endpoints";

const CHANNEL = "cut-intercept";

(function install() {
  installFetchPatch();
  installXhrPatch();
})();

function installFetchPatch(): void {
  const original = window.fetch;
  if (!original || (window.fetch as { __cutPatched?: boolean }).__cutPatched) return;
  const patched: typeof window.fetch = async function (this: typeof window, ...args) {
    const response = await original.apply(this, args as Parameters<typeof window.fetch>);
    try {
      const first = args[0];
      const url =
        typeof first === "string"
          ? first
          : first instanceof Request
          ? first.url
          : (first as URL).toString();
      const m = matchEndpoint(url);
      if (m) {
        const clone = response.clone();
        clone
          .json()
          .then((body) => post({ kind: m.kind, origin: m.origin, url, body }))
          .catch(() => {
            /* non-JSON response, ignore */
          });
      }
    } catch {
      /* swallow */
    }
    return response;
  };
  (patched as { __cutPatched?: boolean }).__cutPatched = true;
  window.fetch = patched;
}

function installXhrPatch(): void {
  const X = XMLHttpRequest.prototype;
  if ((X as { __cutPatched?: boolean }).__cutPatched) return;
  const origOpen = X.open;
  const origSend = X.send;
  X.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    (this as unknown as { __cutUrl?: string }).__cutUrl = typeof url === "string" ? url : url.toString();
    // @ts-expect-error pass-through to original signature
    return origOpen.call(this, method, url, ...rest);
  };
  X.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener("load", () => {
      const url = (this as unknown as { __cutUrl?: string }).__cutUrl ?? "";
      const m = matchEndpoint(url);
      if (!m) return;
      try {
        const parsed = JSON.parse(this.responseText);
        post({ kind: m.kind, origin: m.origin, url, body: parsed });
      } catch {
        /* non-JSON */
      }
    });
    return origSend.call(this, body ?? null);
  };
  (X as { __cutPatched?: boolean }).__cutPatched = true;
}

function post(payload: unknown): void {
  window.postMessage({ source: CHANNEL, payload }, "*");
}
