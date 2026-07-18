import { normalizeSpsHubOrigin } from "./workspace-url.mjs";

export function createSpsSetupWindowPreferences(preload) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

export function createSpsWorkspaceWindowPreferences() {
  // The remote Hub must never receive the privileged Desktop IPC bridge.
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

export function isAllowedSpsWorkspaceNavigation(value, hubOrigin) {
  return normalizeSpsHubOrigin(value) === hubOrigin;
}
