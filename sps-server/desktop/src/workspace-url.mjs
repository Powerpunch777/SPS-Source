export function normalizeSpsHubOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isSpsHubApiUrl(value, hubOrigin) {
  const origin = normalizeSpsHubOrigin(hubOrigin);
  if (!origin) return false;
  try {
    const url = new URL(value);
    return url.origin === origin && (url.pathname === "/api" || url.pathname.startsWith("/api/"));
  } catch {
    return false;
  }
}
