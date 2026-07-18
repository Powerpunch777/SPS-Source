import { requireSpsHubOrigin } from "./workspace-url.mjs";

const SPS_INVITE_PREFIX = "sps_invite_";
const SPS_CODE_SUFFIX_PATTERN = /^[a-z0-9]{8}(?:[a-z0-9]{8})?$/i;
const SPS_CODE_INPUT_PATTERN = /^(?:[a-z0-9]{8}|[a-z0-9]{16}|[a-z0-9]{4}(?:[\s_-][a-z0-9]{4}){1,3})$/i;

export function spsCodeToInviteToken(input) {
  const withoutPrefix = String(input ?? "").trim().replace(/^sps[\s_-]*/i, "");
  if (!SPS_CODE_INPUT_PATTERN.test(withoutPrefix)) return null;
  const suffix = withoutPrefix.replace(/[\s_-]/g, "");
  if (!SPS_CODE_SUFFIX_PATTERN.test(suffix)) return null;
  return SPS_INVITE_PREFIX + suffix.toLowerCase();
}

export function buildInviteUrl(hubUrl, code) {
  const token = spsCodeToInviteToken(code);
  if (!token) throw new Error("Enter an SPS code in the form SPS-XXXX-XXXX-XXXX-XXXX");
  const hub = new URL(requireSpsHubOrigin(hubUrl));
  hub.pathname = "/invite/" + encodeURIComponent(token);
  hub.search = "";
  hub.hash = "";
  return hub.toString();
}

export function parseSpsJoinUri(value) {
  try {
    const uri = new URL(value);
    if (uri.protocol !== "sps:" || uri.hostname !== "join") return null;
    const hub = uri.searchParams.get("hub");
    const code = uri.searchParams.get("code");
    if (!hub || !code || !spsCodeToInviteToken(code)) return null;

    return { hub: requireSpsHubOrigin(hub), code: code.toUpperCase() };
  } catch {
    return null;
  }
}

export function findSpsJoinUriArg(argv) {
  if (!Array.isArray(argv)) return null;
  return argv.find((value) => typeof value === "string" && parseSpsJoinUri(value)) ?? null;
}
