const SPS_TEAM_WORKPLANE_PLUGIN_KEY = "local.room-chat";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function ownerHostOrigin(value) {
  const url = new URL(value);
  if (!LOOPBACK_HOSTS.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("SPS Team Workplane can be bound only to the local Owner Host.");
  }
  return url.origin;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function spsTeamWorkplaneRuntimeConfig(ownerHostUrl, currentConfig = {}) {
  return {
    ...record(currentConfig),
    // The Desktop Owner Host selects its loopback port during bootstrap. Never
    // leave the workplane on the manifest's generic development port.
    spsApiUrl: ownerHostOrigin(ownerHostUrl),
  };
}

export async function synchronizeSpsTeamWorkplaneConfig({
  ownerHostUrl,
  desktopAccessToken = "",
  sessionCookie = "",
  fetchImpl = fetch,
} = {}) {
  const origin = ownerHostOrigin(ownerHostUrl);
  const configUrl = new URL(`/api/plugins/${SPS_TEAM_WORKPLANE_PLUGIN_KEY}/config`, origin);
  const accessHeaders = String(desktopAccessToken || "").trim()
    ? { "x-sps-desktop-access": String(desktopAccessToken).trim() }
    : {};
  const identityHeaders = String(sessionCookie || "").trim()
    ? { cookie: `sps_identity_session=${encodeURIComponent(String(sessionCookie).trim())}` }
    : {};
  const headers = { accept: "application/json", ...accessHeaders, ...identityHeaders };
  const currentResponse = await fetchImpl(configUrl, { headers });
  if (currentResponse.status === 404) {
    return { configured: false, changed: false, reason: "plugin_not_installed" };
  }
  if (!currentResponse.ok) {
    throw new Error(`Could not read SPS Team Workplane configuration (HTTP ${currentResponse.status}).`);
  }
  const current = await currentResponse.json();
  const config = spsTeamWorkplaneRuntimeConfig(origin, current?.configJson);
  if (record(current?.configJson).spsApiUrl === config.spsApiUrl) {
    return { configured: true, changed: false, config };
  }
  const savedResponse = await fetchImpl(configUrl, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ configJson: config }),
  });
  if (!savedResponse.ok) {
    throw new Error(`Could not configure SPS Team Workplane (HTTP ${savedResponse.status}).`);
  }
  return { configured: true, changed: true, config };
}
