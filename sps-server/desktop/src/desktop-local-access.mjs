import { randomBytes } from "node:crypto";

export const SPS_DESKTOP_ACCESS_HEADER = "X-SPS-Desktop-Access";
// This is sent only for the narrow Owner-membership recovery operation. Core
// requires it in addition to the normal per-launch Desktop access proof.
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
