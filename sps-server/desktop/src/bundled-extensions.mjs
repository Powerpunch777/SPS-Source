function enabledUnlessFalse(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value).trim().toLowerCase() !== "false";
}

export function isSpsDefaultMemoryEnabled(env = process.env) {
  // Default Memory is the first-party implementation of the Core memory
  // provider contract, so a normal Owner Host starts it without installation.
  if (!enabledUnlessFalse(env.SPS_ENABLE_BUNDLED_EXTENSIONS, true)) return false;
  return enabledUnlessFalse(env.SPS_ENABLE_DEFAULT_MEMORY, true);
}

export function isSpsRoomWorkplaneBundled(env = process.env) {
  // Team/Workplane plugins may ship with Desktop, but the neutral SPS Core must
  // not choose a team's operating model. An explicit legacy bundle opt-in is
  // still honored for development and existing managed deployments.
  if (env.SPS_ENABLE_BUNDLED_EXTENSIONS !== undefined) {
    return enabledUnlessFalse(env.SPS_ENABLE_BUNDLED_EXTENSIONS, false);
  }
  return enabledUnlessFalse(env.SPS_ENABLE_ROOM_WORKPLANE, false);
}

export function disabledSpsExtensionStatus() {
  return {
    state: "disabled",
    url: null,
    startedAt: null,
    lastError: null,
    vaultPath: null,
  };
}
