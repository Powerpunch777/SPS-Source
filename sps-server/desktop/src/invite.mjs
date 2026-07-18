const SPS_INVITE_PREFIX = "sps_invite_";

export function spsCodeToInviteToken(input) {
  const withoutPrefix = String(input ?? "").trim().replace(/^sps[\s_-]*/i, "");
  if (!/^[a-z0-9]{4}(?:[\s_-]?[a-z0-9]{4})$/i.test(withoutPrefix)) return null;
  return SPS_INVITE_PREFIX + withoutPrefix.replace(/[\s_-]/g, "").toLowerCase();
}

export function buildInviteUrl(hubUrl, code) {
  const token = spsCodeToInviteToken(code);
  if (!token) throw new Error("Enter an SPS code in the form SPS-XXXX-XXXX");
  const hub = new URL(hubUrl);
  if (hub.protocol !== "http:" && hub.protocol !== "https:") {
    throw new Error("SPS Hub URL must use HTTP or HTTPS");
  }
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

    const hubUrl = new URL(hub);
    if (hubUrl.protocol !== "http:" && hubUrl.protocol !== "https:") return null;
    return { hub: hubUrl.origin, code: code.toUpperCase() };
  } catch {
    return null;
  }
}

export function findSpsJoinUriArg(argv) {
  if (!Array.isArray(argv)) return null;
  return argv.find((value) => typeof value === "string" && parseSpsJoinUri(value)) ?? null;
}
