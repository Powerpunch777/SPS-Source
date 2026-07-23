export function areSpsBundledExtensionsEnabled(env = process.env) {
  // SPS Desktop ships the official Room Workplane and Default Memory as part
  // of its out-of-the-box collaboration experience. Keep an explicit switch
  // for development and recovery, but do not make a normal desktop launch
  // look partially configured.
  return String(env.SPS_ENABLE_BUNDLED_EXTENSIONS ?? "true").trim().toLowerCase() !== "false";
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
