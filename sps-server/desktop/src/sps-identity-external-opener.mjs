import { isIP } from "node:net";

function loopbackIdentity(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && !url.username && !url.password
      && ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
      && (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash;
  } catch { return false; }
}

function loopbackCallback(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && !url.username && !url.password
      && ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
      && isIP(url.hostname) > 0 && Number(url.port) > 0 && url.pathname === "/oauth2/callback"
      && !url.search && !url.hash;
  } catch { return false; }
}

function validateAuthorizationUrl(input, identityOrigin) {
  let url;
  try { url = new URL(input); } catch { throw new Error("SPS Identity authorization URL is invalid."); }
  const keys = ["redirect_uri", "state", "code_challenge", "code_challenge_method", "device_id"];
  if (url.origin !== identityOrigin || url.pathname !== "/v1/desktop/authorize" || url.username || url.password
    || url.hash || [...url.searchParams.keys()].length !== keys.length
    || keys.some(key => url.searchParams.getAll(key).length !== 1)
    || [...url.searchParams.keys()].some(key => !keys.includes(key))
    || !loopbackCallback(url.searchParams.get("redirect_uri"))
    || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("state") || "")
    || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("code_challenge") || "")
    || url.searchParams.get("code_challenge_method") !== "S256"
    || !/^[A-Za-z0-9_-]{16,128}$/.test(url.searchParams.get("device_id") || "")) {
    throw new Error("SPS Identity authorization URL is invalid.");
  }
  return url;
}

// Only the isolated source E2E fixture may replace the operating-system browser.
// Normal account sign-in always goes through Electron's real shell.openExternal.
export function createSpsIdentityExternalOpener({ openExternal, identityUrl, sourceE2e = false,
  allowLoopbackIdentity = false, fetchImpl = globalThis.fetch } = {}) {
  if (typeof openExternal !== "function") throw new TypeError("SPS Identity browser opener is unavailable.");
  if (!sourceE2e || !allowLoopbackIdentity || !loopbackIdentity(identityUrl)) return openExternal;
  if (typeof fetchImpl !== "function") throw new TypeError("SPS Identity E2E capture transport is unavailable.");
  const identityOrigin = new URL(identityUrl).origin;
  const captureUrl = new URL("/__e2e/capture-authorization", identityOrigin);
  return async input => {
    const authorizationUrl = validateAuthorizationUrl(input, identityOrigin);
    const response = await fetchImpl(captureUrl, { method: "POST", redirect: "error",
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ authorizationUrl: authorizationUrl.href }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("SPS Identity E2E authorization capture was rejected.");
  };
}
