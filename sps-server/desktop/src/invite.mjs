import { requireSpsHubOrigin } from "./workspace-url.mjs";

const SPS_INVITE_PREFIX = "sps_invite_";
const SPS_ROUTED_INVITE_PREFIX = "SPS2-";
const MAX_ROUTED_INVITE_LENGTH = 1024;
const SPS_CODE_SUFFIX_PATTERN = /^[a-z0-9]{8}(?:[a-z0-9]{8})?$/i;
const SPS_CODE_INPUT_PATTERN = /^(?:[a-z0-9]{8}|[a-z0-9]{16}|[a-z0-9]{4}(?:[\s_-][a-z0-9]{4}){1,3})$/i;

export function spsCodeToInviteToken(input) {
  const withoutPrefix = String(input ?? "").trim().replace(/^sps[\s_-]*/i, "");
  if (!SPS_CODE_INPUT_PATTERN.test(withoutPrefix)) return null;
  const suffix = withoutPrefix.replace(/[\s_-]/g, "");
  if (!SPS_CODE_SUFFIX_PATTERN.test(suffix)) return null;
  return SPS_INVITE_PREFIX + suffix.toLowerCase();
}

export function normalizeSpsInviteToken(input) {
  const value = String(input ?? "").trim().toLowerCase();
  if (value.startsWith(SPS_INVITE_PREFIX)) {
    const suffix = value.slice(SPS_INVITE_PREFIX.length);
    return SPS_CODE_SUFFIX_PATTERN.test(suffix) ? `${SPS_INVITE_PREFIX}${suffix}` : null;
  }
  return spsCodeToInviteToken(value);
}

export function spsInviteTokenToCode(input) {
  const token = normalizeSpsInviteToken(input);
  if (!token) return null;
  const suffix = token.slice(SPS_INVITE_PREFIX.length).toUpperCase();
  return `SPS-${suffix.match(/.{1,4}/g).join("-")}`;
}

export function buildInviteUrl(hubUrl, invite) {
  const token = normalizeSpsInviteToken(invite);
  if (!token) throw new Error("Enter an SPS code in the form SPS-XXXX-XXXX-XXXX-XXXX");
  const hub = new URL(requireSpsHubOrigin(hubUrl));
  hub.pathname = "/invite/" + encodeURIComponent(token);
  hub.search = "";
  hub.hash = "";
  return hub.toString();
}

// A routed code is intentionally self-contained: a new Desktop needs the
// private team address before it can redeem the one-time invitation token.
// The invitation token remains the server-enforced credential; this merely
// carries the address needed to reach that server.
export function createSpsRoutedInviteCode(hubUrl, invite) {
  const hub = requireSpsHubOrigin(hubUrl);
  const code = spsInviteTokenToCode(invite);
  if (!code) throw new Error("A valid SPS invitation is required");
  const payload = JSON.stringify({ v: 1, hub, code });
  return `${SPS_ROUTED_INVITE_PREFIX}${Buffer.from(payload, "utf8").toString("base64url")}`;
}

export function parseSpsRoutedInviteCode(input) {
  const value = String(input ?? "").trim();
  if (!value.startsWith(SPS_ROUTED_INVITE_PREFIX) || value.length > MAX_ROUTED_INVITE_LENGTH) return null;
  const encoded = value.slice(SPS_ROUTED_INVITE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const keys = Object.keys(payload).sort();
    if (keys.length !== 3 || keys.join(",") !== "code,hub,v" || payload.v !== 1) return null;
    if (typeof payload.hub !== "string" || typeof payload.code !== "string") return null;
    const code = spsInviteTokenToCode(payload.code);
    if (!code) return null;
    return { hub: requireSpsHubOrigin(payload.hub), code };
  } catch {
    return null;
  }
}

export function parseSpsJoinUri(value) {
  try {
    const uri = new URL(value);
    if (uri.protocol !== "sps:" || uri.hostname !== "join") return null;
    const hub = uri.searchParams.get("hub");
    const invite = uri.searchParams.get("code");
    const code = spsInviteTokenToCode(invite);
    if (!hub || !code) return null;

    return { hub: requireSpsHubOrigin(hub), code };
  } catch {
    return null;
  }
}

export function findSpsJoinUriArg(argv) {
  if (!Array.isArray(argv)) return null;
  return argv.find((value) => typeof value === "string" && parseSpsJoinUri(value)) ?? null;
}
