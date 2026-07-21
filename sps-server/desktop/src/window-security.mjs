import { normalizeSpsHubOrigin } from "./workspace-url.mjs";

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
