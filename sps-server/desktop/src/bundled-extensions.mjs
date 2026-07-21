export function areSpsBundledExtensionsEnabled(env = process.env) {
  return String(env.SPS_ENABLE_BUNDLED_EXTENSIONS ?? "").trim().toLowerCase() === "true";
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
