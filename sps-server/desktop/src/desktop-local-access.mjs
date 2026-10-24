import { randomBytes } from "node:crypto";

export const SPS_DESKTOP_ACCESS_HEADER = "X-SPS-Desktop-Access";
// This is sent only for Host-only Core infrastructure actions. Core requires
// it in addition to the normal per-launch Desktop access proof, so a normal
// Workspace request (and a browser) never becomes a Host request.
export const SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER = "X-SPS-Desktop-Owner-Bootstrap";
export const SPS_DESKTOP_ACCESS_TOKEN_ENV = "SPS_DESKTOP_ACCESS_TOKEN";

export function createSpsDesktopAccessToken() {
  return randomBytes(32).toString("base64url");
}

export function spsDesktopAccessEnvironment(token) {
  if (typeof token !== "string" || token.length < 32) {
    throw new Error("SPS Desktop access token is invalid.");
  }
  return { [SPS_DESKTOP_ACCESS_TOKEN_ENV]: token };
}

export function isSpsDesktopWorkspaceRequest({ url, workspaceOrigin }) {
  if (!workspaceOrigin) return false;
  try {
    return new URL(url).origin === workspaceOrigin;
  } catch {
    return false;
  }
}

/**
 * Only the local Host Workspace can carry the second proof for Core's
 * technical controls. Workflow policy stays plugin-owned.
 */
export function isSpsDesktopTechnicalHostRequest({ url, workspaceOrigin, method }) {
  if (!isSpsDesktopWorkspaceRequest({ url, workspaceOrigin })) return false;
  try {
    const pathname = new URL(url).pathname;
    if (method === "GET" && /^\/api\/companies\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/sps-executions(?:\/summary|\/(?:node|agent_session)\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})?$/i.test(pathname)) {
      return true;
    }
    return [
      /^\/api\/companies$/,
      /^\/api\/companies\/[^/]+$/,
      /^\/api\/companies\/[^/]+\/(?:invites|sps-members|sps-nodes)(?:\/|$)/,
      /^\/api\/companies\/[^/]+\/sps-workspace-sources(?:\/|$)/,
      /^\/api\/companies\/[^/]+\/workspace-shell(?:\/|$)/,
      /^\/api\/companies\/[^/]+\/environments(?:\/|$)/,
      /^\/api\/invites\/[^/]+\/revoke$/,
      /^\/api\/instance\/(?:settings|environments|database-backups)(?:\/|$)/,
      /^\/api\/environments(?:\/|$)/,
      /^\/api\/environment-custom-image-setup-sessions(?:\/|$)/,
      // The Sidebar uses this response to decide whether the current Desktop
      // is the physical Host. It is read-only but must carry the second proof
      // or a signed-in Host is indistinguishable from a Member.
      /^\/api\/cli-auth\/me$/,
      /^\/api\/admin(?:\/|$)/,
      /^\/api\/plugins(?:\/|$)/,
      /^\/api\/sps-nodes\/[^/]+(?:\/|$)/,
      /^\/api\/agents\/[^/]+\/sps-node-binding$/,
    ].some((pattern) => pattern.test(pathname));
  } catch {
    return false;
  }
}
