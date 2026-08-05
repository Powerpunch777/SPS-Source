import { execFile } from "node:child_process";

const TAILNET_SUFFIX = ".ts.net";
export const SPS_MINIMUM_TAILSCALE_VERSION = "1.52.0";

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSpsTailnetHostname(value) {
  const hostname = asTrimmedString(value).toLowerCase().replace(/\.+$/, "");
  if (!hostname || hostname.includes("://") || /[/?#@:\\]/.test(hostname)) {
    throw new Error("SPS Desktop needs a Tailscale DNS hostname, not a URL or IP address.");
  }
  if (!hostname.endsWith(TAILNET_SUFFIX) || !/^[a-z0-9][a-z0-9.-]*\.ts\.net$/.test(hostname)) {
    throw new Error("SPS Desktop accepts only a MagicDNS Tailscale hostname ending in .ts.net.");
  }
  return hostname;
}

export function spsTailnetPublicUrl(hostname) {
  return `https://${normalizeSpsTailnetHostname(hostname)}`;
}

export function parseSpsTailscaleStatus(raw) {
  let status;
  try {
    status = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("Tailscale returned invalid status data.");
  }
  if (status?.BackendState !== "Running") {
    throw new Error("Tailscale is installed but not connected on this computer.");
  }
  const hostname = normalizeSpsTailnetHostname(status?.Self?.DNSName);
  const addresses = Array.isArray(status?.Self?.TailscaleIPs)
    ? status.Self.TailscaleIPs.filter((value) => typeof value === "string")
    : [];
  return {
    hostname,
    url: spsTailnetPublicUrl(hostname),
    addresses,
    deviceName: asTrimmedString(status?.Self?.HostName) || hostname,
    httpsAvailable: Array.isArray(status?.CertDomains) && status.CertDomains.length > 0,
  };
}

function parseNumericVersion(value) {
  const match = asTrimmedString(value).match(/^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function compareNumericVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function parseSpsTailscaleVersion(raw) {
  let versionData;
  try {
    versionData = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("Tailscale returned invalid version data.");
  }
  const reported = [versionData?.majorMinorPatch, versionData?.short]
    .filter((value) => asTrimmedString(value));
  const parsedVersions = reported.map(parseNumericVersion);
  if (parsedVersions.length === 0 || parsedVersions.some((value) => !value)) {
    throw new Error("Tailscale returned invalid version data.");
  }
  const parsed = parsedVersions[0];
  if (parsedVersions.some((value) => compareNumericVersions(parsed, value) !== 0)) {
    throw new Error("Tailscale returned conflicting version data.");
  }
  return {
    version: `${parsed[0]}.${parsed[1]}.${parsed[2]}`,
    supported: compareNumericVersions(parsed, parseNumericVersion(SPS_MINIMUM_TAILSCALE_VERSION)) >= 0,
  };
}

export function requireSupportedSpsTailscaleVersion(versionData) {
  return assertSupportedSpsTailscaleVersion(parseSpsTailscaleVersion(versionData));
}

function assertSupportedSpsTailscaleVersion(result) {
  if (!result.supported) {
    throw new Error(
      `SPS private team access requires Tailscale ${SPS_MINIMUM_TAILSCALE_VERSION} or later. Update Tailscale and try again (installed: ${result.version}).`,
    );
  }
  return result;
}

export function buildSpsTailscaleServeInvocation({ ownerHostUrl }) {
  const target = new URL(ownerHostUrl);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname)) {
    throw new Error("SPS Desktop can proxy only its loopback Owner Host through Tailscale.");
  }
  return {
    command: "tailscale",
    // Reserve the root HTTPS handler explicitly so SPS can later remove only
    // the rule it created instead of resetting a user's whole Serve setup.
    args: ["serve", "--https=443", "--bg", target.origin],
  };
}

export function buildSpsTailscaleServeDisableInvocation() {
  return {
    command: "tailscale",
    args: ["serve", "--https=443", "off"],
  };
}

export function parseSpsTailscaleServeStatus(raw) {
  let status;
  try {
    status = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("Tailscale returned invalid Serve status data.");
  }
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    throw new Error("Tailscale returned invalid Serve status data.");
  }
  return status;
}

export function isEmptySpsTailscaleServeStatus(status) {
  return Object.keys(parseSpsTailscaleServeStatus(status)).length === 0;
}

export function hasSpsTailscaleServeHandler({ status, hostname, ownerHostUrl }) {
  const normalizedHostname = normalizeSpsTailnetHostname(hostname);
  const target = new URL(ownerHostUrl);
  const expectedProxy = target.origin;
  const web = parseSpsTailscaleServeStatus(status).Web;
  if (!web || typeof web !== "object" || Array.isArray(web)) return false;

  return Object.entries(web).some(([address, entry]) => {
    if (address.trim().toLowerCase() !== `${normalizedHostname}:443`) return false;
    const proxy = entry?.Handlers?.["/"]?.Proxy;
    return proxy === expectedProxy;
  });
}

function isLoopbackHttpProxy(value) {
  try {
    const target = new URL(value);
    return target.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname);
  } catch {
    return false;
  }
}

// A port can legitimately change when a local Owner Host recovers after an
// interrupted update. Treat only the existing SPS hostname + loopback root
// handler as ours; other Tailscale Serve configurations stay untouched.
export function hasSpsTailscaleLoopbackRootHandler({ status, hostname }) {
  const normalizedHostname = normalizeSpsTailnetHostname(hostname);
  const web = parseSpsTailscaleServeStatus(status).Web;
  if (!web || typeof web !== "object" || Array.isArray(web)) return false;
  const proxy = web[`${normalizedHostname}:443`]?.Handlers?.["/"]?.Proxy;
  return typeof proxy === "string" && isLoopbackHttpProxy(proxy);
}

function execute(command, args, { execFileImpl = execFile } = {}) {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, { windowsHide: true, timeout: 15_000, maxBuffer: 512 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = asTrimmedString(stderr) || asTrimmedString(error.message) || "Tailscale command failed.";
        reject(new Error(detail));
        return;
      }
      resolve(String(stdout ?? ""));
    });
  });
}

export async function inspectSpsTailscale(options = {}) {
  return parseSpsTailscaleStatus(await execute("tailscale", ["status", "--json"], options));
}

export async function inspectSpsTailscaleVersion(options = {}) {
  return parseSpsTailscaleVersion(await execute("tailscale", ["version", "--json"], options));
}

export async function inspectSpsTailscaleServe(options = {}) {
  return parseSpsTailscaleServeStatus(await execute("tailscale", ["serve", "status", "--json"], options));
}

export async function enableSpsTailscaleServe({ ownerHostUrl, ...options }) {
  assertSupportedSpsTailscaleVersion(await inspectSpsTailscaleVersion(options));
  const before = await inspectSpsTailscaleServe(options);
  if (!isEmptySpsTailscaleServeStatus(before)) {
    throw new Error(
      "SPS will not replace an existing Tailscale Serve setup. Remove or move the existing Serve rule before enabling private team access.",
    );
  }
  const invocation = buildSpsTailscaleServeInvocation({ ownerHostUrl });
  await execute(invocation.command, invocation.args, options);
  const tailnet = await inspectSpsTailscale(options);
  const serve = await inspectSpsTailscaleServe(options);
  if (!hasSpsTailscaleServeHandler({
    status: serve,
    hostname: tailnet.hostname,
    ownerHostUrl,
  })) {
    throw new Error("Tailscale did not confirm the HTTPS route requested by SPS.");
  }
  return {
    tailnet,
    serve,
  };
}

export async function reconcileSpsTailscaleServe({ hostname, ownerHostUrl, ...options }) {
  assertSupportedSpsTailscaleVersion(await inspectSpsTailscaleVersion(options));
  const before = await inspectSpsTailscaleServe(options);
  if (hasSpsTailscaleServeHandler({ status: before, hostname, ownerHostUrl })) {
    return { changed: false, serve: before };
  }
  if (!isEmptySpsTailscaleServeStatus(before) && !hasSpsTailscaleLoopbackRootHandler({ status: before, hostname })) {
    throw new Error(
      "SPS will not replace this Tailscale Serve setup because its root handler is no longer the SPS loopback route.",
    );
  }

  const invocation = buildSpsTailscaleServeInvocation({ ownerHostUrl });
  await execute(invocation.command, invocation.args, options);
  const serve = await inspectSpsTailscaleServe(options);
  if (!hasSpsTailscaleServeHandler({ status: serve, hostname, ownerHostUrl })) {
    throw new Error("Tailscale did not confirm the repaired SPS HTTPS route.");
  }
  return { changed: true, serve };
}

export async function disableSpsTailscaleServe({ hostname, ownerHostUrl, ...options }) {
  const current = await inspectSpsTailscaleServe(options);
  if (isEmptySpsTailscaleServeStatus(current)) return { removed: false, serve: current };
  if (!hasSpsTailscaleServeHandler({ status: current, hostname, ownerHostUrl })) {
    throw new Error(
      "SPS will not remove this Tailscale Serve setup because its root handler changed after SPS created it. Remove the SPS root handler manually before returning this Owner Host to authenticated loopback mode.",
    );
  }
  const invocation = buildSpsTailscaleServeDisableInvocation();
  await execute(invocation.command, invocation.args, options);
  const after = await inspectSpsTailscaleServe(options);
  if (hasSpsTailscaleServeHandler({ status: after, hostname, ownerHostUrl })) {
    throw new Error("Tailscale kept the SPS root handler after removal. Resolve it in Tailscale Serve before returning to authenticated loopback mode.");
  }
  return { removed: true, serve: after };
}
