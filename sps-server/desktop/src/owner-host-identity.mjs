function normalizedIdentityUrl(value) {
  const url = String(value ?? "").trim().replace(/\/$/, "");
  if (!/^https:\/\//i.test(url)) {
    throw new Error("SPS Owner Host identity requires an HTTPS SPS Identity URL.");
  }
  return url;
}

export function spsOwnerHostIdentityEnvironment(identityUrl) {
  const issuer = normalizedIdentityUrl(identityUrl);
  return {
    SPS_AUTH_IDENTITY_ENABLED: "true",
    SPS_IDENTITY_ISSUER: issuer,
    SPS_IDENTITY_AUDIENCE: "sps-core",
    SPS_IDENTITY_JWKS_URL: `${issuer}/.well-known/jwks.json`,
    SPS_AUTH_GOOGLE_ONLY: "false",
  };
}

export function spsOwnerHostRuntimeEnvironment({ identityUrl, teamAccessEnabled, authSecret } = {}) {
  const identity = spsOwnerHostIdentityEnvironment(identityUrl);
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
