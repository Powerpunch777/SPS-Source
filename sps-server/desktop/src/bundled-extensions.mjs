function enabledUnlessFalse(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return String(value).trim().toLowerCase() !== "false";
}

export function isSpsDefaultMemoryEnabled(env = process.env) {
  // Memory strategy belongs to the Company, not the neutral SPS starting
  // point. Desktop ships the provider, but the first Company does not start
  // it until the owner deliberately enables it.
  if (!enabledUnlessFalse(env.SPS_ENABLE_BUNDLED_EXTENSIONS, true)) return false;
  return enabledUnlessFalse(env.SPS_ENABLE_DEFAULT_MEMORY, false);
}

export function isSpsPluginDiscoveryEnabled(env = process.env) {
  // Discovery is the one first-company helper. It only gives an already
  // connected Agent catalog-search and draft tools; it does not select a
  // Workplane, memory strategy, or access model.
  if (!enabledUnlessFalse(env.SPS_ENABLE_BUNDLED_EXTENSIONS, true)) return false;
  return enabledUnlessFalse(env.SPS_ENABLE_PLUGIN_DISCOVERY, true);
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
