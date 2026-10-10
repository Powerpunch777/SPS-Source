import { normalizeSpsHubOrigin } from "./workspace-url.mjs";

const SPS_EXTERNAL_PROTOCOLS = new Set(["https:", "mailto:"]);
const SPS_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function parseSpsExternalUrl(value) {
  if (typeof value !== "string" && !(value instanceof URL)) return null;
  try {
    const url = new URL(value.toString());
    if (url.username || url.password) return null;
    if (url.protocol === "http:" && !SPS_LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (!SPS_EXTERNAL_PROTOCOLS.has(url.protocol) && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function normalizeSpsExternalUrl(value) {
  return parseSpsExternalUrl(value)?.href ?? null;
}

export function requireSpsExternalUrl(value) {
  const normalized = normalizeSpsExternalUrl(value);
  if (!normalized) throw new Error("SPS blocked an unsafe external URL");
  return normalized;
}

export function createSpsSetupWindowPreferences(preload) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

export function createSpsWorkspaceWindowPreferences(preload) {
  // Remote Hubs never receive a Desktop bridge. The local Owner Host may use
  // a deliberately narrow bridge for account display and Desktop sign-out.
  return {
    ...(preload ? { preload } : {}),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

export function isAllowedSpsWorkspaceNavigation(value, hubOrigin) {
  return normalizeSpsHubOrigin(value) === hubOrigin;
}
