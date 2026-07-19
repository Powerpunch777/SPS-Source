function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return "";
}

// A person may give a computer a custom name, but first-run setup should not
// demand one before the Google account is known. The account name is a useful
// default and the Windows host name remains a last-resort fallback.
export function resolveSpsNodeDisplayName({ configuredName, accountName, hostname }) {
  return firstNonEmpty(configuredName, accountName, hostname, "SPS Desktop").slice(0, 120);
}
