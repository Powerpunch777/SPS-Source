const E2E_MULTI_INSTANCE_ENV = "SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE";
const E2E_LOOPBACK_IDENTITY_ENV = "SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY";

function isLoopbackHostname(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export function allowsSpsDesktopE2ELoopbackIdentity(environment = process.env) {
  return environment?.[E2E_MULTI_INSTANCE_ENV] === "1"
    && environment?.[E2E_LOOPBACK_IDENTITY_ENV] === "1";
}

function normalizedIdentityUrl(value, environment = process.env) {
  const raw = String(value ?? "").trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("SPS Owner Host identity requires an HTTPS SPS Identity URL.");
  }

  const permitsLoopbackHttp = allowsSpsDesktopE2ELoopbackIdentity(environment);
  const valid = parsed.protocol === "https:"
    || (permitsLoopbackHttp && parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname));
  if (!valid || parsed.username || parsed.password) {
    throw new Error("SPS Owner Host identity requires an HTTPS SPS Identity URL.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function spsOwnerHostIdentityEnvironment(identityUrl, environment = process.env) {
  const issuer = normalizedIdentityUrl(identityUrl, environment);
  return {
    SPS_AUTH_IDENTITY_ENABLED: "true",
    SPS_IDENTITY_ISSUER: issuer,
    SPS_IDENTITY_AUDIENCE: "sps-core",
    SPS_IDENTITY_JWKS_URL: `${issuer}/.well-known/jwks.json`,
    SPS_AUTH_GOOGLE_ONLY: "false",
  };
}

export function spsOwnerHostRuntimeEnvironment({ identityUrl, teamAccessEnabled, authSecret, environment } = {}) {
  const identity = spsOwnerHostIdentityEnvironment(identityUrl, environment);
  // SPS Desktop always authenticates the local Host account. Enabling a team
  // adds only the Tailscale-facing secrets and proxy trust, not a separate
  // sign-in model.
  if (!teamAccessEnabled) return identity;
  const secret = String(authSecret ?? "").trim();
  if (!secret) {
    throw new Error("Private team access credentials are unavailable in Windows secure storage.");
  }
  return {
    ...identity,
    SPS_AUTH_SECRET: secret,
    // The Core's signed Agent-run protocol remains a separate runtime input.
    // Keep it in the Owner Vault with the private-team credential.
    PAPERCLIP_AGENT_JWT_SECRET: secret,
    TRUST_PROXY: "loopback",
  };
}
