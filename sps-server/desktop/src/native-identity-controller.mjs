import { randomUUID, X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { defaultSpsNativeCertificateValidity } from "./native-connection-policy.mjs";
import {
  createSpsNativeHostIdentity, inspectSpsNativeHostIdentity, requireCurrentSpsNativeHostIdentity,
} from "./native-identity-certificates.mjs";

const MESSAGES = Object.freeze({
  native_identity_host_required: "The current signed-in local Host is required.",
  native_identity_authority_changed: "The local Host or account changed. No Native access was granted.",
  native_identity_busy: "Another Native identity operation is in progress.",
  native_identity_recovery_required: "Existing Native credentials require explicit recovery and were not replaced.",
  native_identity_unavailable: "Native identity storage is unavailable. Existing credentials were not replaced.",
  native_identity_restore_blocked: "Native credentials already exist for this Vault. Resolve them before restoring a different Host.",
});

function error(code) { return Object.assign(new Error(MESSAGES[code]), { code }); }

export function requireSpsNativeIdentityPreparationInput(input) {
  const descriptor = input && typeof input === "object" && !Array.isArray(input)
    && [Object.prototype, null].includes(Object.getPrototypeOf(input))
    && Reflect.ownKeys(input).length === 1 && Object.getOwnPropertyDescriptor(input, "serverAddress");
  const address = descriptor?.value;
  if (!descriptor?.enumerable || typeof address !== "string" || address.length > 45) {
    throw new TypeError("Native identity preparation requires one private IP address.");
  }
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168) {
      return Object.freeze({ serverAddress: address });
    }
  } else if (family === 6 && /^f[cd]/i.test(address)) {
    return Object.freeze({ serverAddress: new URL(`https://[${address}]`).hostname.slice(1, -1) });
  }
  throw new TypeError("Native identity preparation requires one private IP address.");
}

function status(state, extra = {}) {
  return Object.freeze({ state, lanEnabled: false, canPrepare: state === "not_prepared", ...extra });
}

function authority(value) {
  if (!value || typeof value.ownerSubject !== "string" || !value.ownerSubject
    || typeof value.userDataDirectory !== "string" || !value.userDataDirectory
    || typeof value.vaultDirectory !== "string" || !value.vaultDirectory) throw error("native_identity_host_required");
  return Object.freeze({ ownerSubject: value.ownerSubject, userDataDirectory: value.userDataDirectory, vaultDirectory: value.vaultDirectory });
}

function sameAuthority(a, b) {
  return a.ownerSubject === b.ownerSubject && a.userDataDirectory === b.userDataDirectory && a.vaultDirectory === b.vaultDirectory;
}

export async function assertSpsNativeHostCredentialsAbsentForRestore(store) {
  try {
    const presence = await store.inspectPresence();
    if (presence?.state !== "absent") throw error("native_identity_restore_blocked");
  } catch (failure) {
    if (failure?.code === "native_identity_restore_blocked") throw failure;
    throw error("native_identity_unavailable");
  }
}

// Main-only orchestration. The caller supplies actual Host/session authorization;
// no renderer path, account ID, secret, key or LAN capability is accepted or returned.
export function createSpsNativeIdentityController({
  getAuthority,
  authenticateHost,
  getStore,
  now = Date.now,
  createIdentity = createSpsNativeHostIdentity,
  createHostId = randomUUID,
}) {
  let preparing = false;
  const capture = () => authority(getAuthority());
  function recheck(expected, assertRequester) {
    assertRequester?.();
    let current;
    try { current = capture(); } catch { throw error("native_identity_authority_changed"); }
    if (!sameAuthority(expected, current)) throw error("native_identity_authority_changed");
  }

  async function inspectOwned(expected) {
    const store = getStore(expected);
    const presence = await store.inspectPresence();
    recheck(expected);
    if (!["absent", "present"].includes(presence?.state)) throw error("native_identity_unavailable");
    let value;
    try { value = await store.read(); } catch {
      recheck(expected);
      return status(presence.state === "present" ? "recovery_required" : "unavailable");
    }
    recheck(expected);
    if (!value) return status(presence.state === "absent" ? "not_prepared" : "recovery_required");
    let details;
    try { details = inspectSpsNativeHostIdentity(value, now()); } catch { return status("recovery_required"); }
    return status(details.state, {
      serverSpkiSha256: details.serverSpkiSha256,
      serverNotAfter: details.serverNotAfter, memberIssuerNotAfter: details.memberIssuerNotAfter,
    });
  }

  return Object.freeze({
    async inspect() {
      let expected;
      try { expected = capture(); } catch { return status("host_required"); }
      try { return await inspectOwned(expected); } catch { return status("unavailable"); }
    },

    async prepare(input, { assertRequester } = {}) {
      const { serverAddress } = requireSpsNativeIdentityPreparationInput(input);
      if (preparing) throw error("native_identity_busy");
      preparing = true;
      try {
        const expected = capture();
        recheck(expected, assertRequester);
        await authenticateHost();
        recheck(expected, assertRequester);
        const existing = await inspectOwned(expected);
        recheck(expected, assertRequester);
        if (existing.state !== "not_prepared") throw error("native_identity_recovery_required");
        const clock = now();
        const server = defaultSpsNativeCertificateValidity("server", clock);
        const issuer = defaultSpsNativeCertificateValidity("issuer-ca", clock);
        const hostId = createHostId();
        const value = await createIdentity({
          hostId, hostnames: [serverAddress],
          notBefore: server.notBeforeEpochSeconds * 1000, notAfter: server.notAfterEpochSeconds * 1000,
          issuerNotAfter: issuer.notAfterEpochSeconds * 1000,
        });
        recheck(expected, assertRequester);
        requireCurrentSpsNativeHostIdentity(value, now());
        if (value.hostId !== hostId || !new X509Certificate(value.server.certificatePem).checkIP(serverAddress)) {
          throw error("native_identity_unavailable");
        }
        const store = getStore(expected);
        // The synchronous guard runs immediately before submitting the no-replace commit.
        await store.create(value, { beforeCommit: () => recheck(expected, assertRequester) });
        recheck(expected, assertRequester);
        return await inspectOwned(expected);
      } catch (failure) {
        if (Object.hasOwn(MESSAGES, failure?.code)) throw error(failure.code);
        if (failure?.code === "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS") throw error("native_identity_recovery_required");
        throw error("native_identity_unavailable");
      } finally { preparing = false; }
    },
  });
}
