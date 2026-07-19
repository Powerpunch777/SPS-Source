export function normalizeSpsHubOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function requireSpsHubOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid SPS Hub URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("SPS Hub URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("SPS Hub URL must not include a username or password.");
  }
  return url.origin;
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
