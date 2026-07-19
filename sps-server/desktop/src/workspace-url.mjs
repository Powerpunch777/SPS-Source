export function normalizeSpsHubOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

export function isSpsLoopbackHubOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

export function requireSpsHubOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid SPS Hub URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SPS Hub URL must use HTTPS, or HTTP only for a local test Hub.");
  }
  if (url.username || url.password) {
    throw new Error("SPS Hub URL must not include a username or password.");
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error("SPS Hub URL must use HTTPS outside this computer. HTTP is allowed only for localhost testing.");
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
