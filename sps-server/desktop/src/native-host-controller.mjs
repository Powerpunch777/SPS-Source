import { isIP } from "node:net";
import { X509Certificate } from "node:crypto";
import { nativeCertificateRecord as record } from "./native-certificate-primitives.mjs";
import { requireCurrentSpsNativeHostIdentity, inspectSpsNativeHostIdentity,
  validateSpsNativeServerCertificateTransition } from "./native-identity-certificates.mjs";
import { createSpsNativeInviteCode } from "./native-connection-invite.mjs";

const error = () => Object.assign(new Error("Native Host connectivity is unavailable. Existing credentials were preserved."), { code: "native_host_unavailable" });
const AUTHORITY_KEYS = ["ownerSubject", "userDataDirectory", "vaultDirectory", "generation"];
export function requireSpsNativeHostListenInput(input) {
  const value = record(input, ["bindAddress", "port"]);
  const family = isIP(value.bindAddress);
  let privateAddress = false;
  if (family === 4) {
    const [first, second] = value.bindAddress.split(".").map(Number);
    privateAddress = first === 10 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168;
  } else if (family === 6) privateAddress = /^f[cd]/i.test(value.bindAddress);
  if (!privateAddress || !Number.isSafeInteger(value.port) || value.port < 1024 || value.port > 65535) throw new TypeError("Select a private network address and a port from 1024 to 65535.");
  return Object.freeze(value);
}

// Product orchestration: explicit per-launch opt-in, independent of Plugins and
// Agents. It never changes Windows Firewall, OS trust or existing Core binds.
export function createSpsNativeHostController({ getAuthority, authenticate, getIdentity,
  getCoreIdentity, localAddresses, createIngress, dispatch, dispatchWorkspace, issuePairing, copyInvitation,
  getServerCertificates }) {
  let current = null, busy = false, stopping = 0, generation = 0;
  function capture() {
    try {
      const value = record(getAuthority(), AUTHORITY_KEYS);
      if (["ownerSubject", "userDataDirectory", "vaultDirectory"].some(key => typeof value[key] !== "string" || !value[key])
        || !(typeof value.generation === "bigint" || Number.isSafeInteger(value.generation))) throw error();
      return Object.freeze(value);
    } catch { throw error(); }
  }
  function guard(expected, epoch, requester) {
    requester?.();
    const latest = capture();
    if (epoch !== generation || AUTHORITY_KEYS.some(key => latest[key] !== expected[key])) throw error();
  }
  function assertListening(selected) {
    const state = selected.ingress.inspect();
    if (state?.state !== "listening" || state.bindAddress !== selected.bindAddress || state.port !== selected.port) throw error();
    for (const encoded of [selected.certificates.server, selected.certificates.issuer]) {
      const certificate = new X509Certificate(Buffer.from(encoded, "base64url"));
      if (Date.now() < Date.parse(certificate.validFrom) || Date.now() >= Date.parse(certificate.validTo)) throw error();
    }
  }
  function certificates(identity) {
    return { server: new X509Certificate(identity.server.certificatePem).raw.toString("base64url"),
      issuer: new X509Certificate(identity.memberIssuer.certificatePem).raw.toString("base64url") };
  }
  async function serverCertificateHistory(identity, authority) {
    const currentPem = identity.server.certificatePem;
    const supplied = typeof getServerCertificates === "function"
      ? await getServerCertificates(authority) : [currentPem];
    if (!Array.isArray(supplied) || supplied.length < 1 || supplied.length > 257
      || supplied.some(value => typeof value !== "string" || !value.length || value.length > 16_384)
      || supplied.at(-1) !== currentPem) throw error();
    const history = Object.freeze([...supplied]);
    for (let index = 1; index < history.length; index++) {
      validateSpsNativeServerCertificateTransition({ hostId: identity.hostId,
        predecessorCertificatePem: history[index - 1], certificatePem: history[index] });
    }
    return history;
  }
  async function stop() {
    generation++;
    const previous = current;
    current = null;
    if (previous) {
      stopping++;
      try { await previous.ingress.stop(); }
      finally { stopping--; }
    }
  }
  return Object.freeze({
    isActive() { return busy || stopping > 0 || current !== null; },
    inspect() {
      if (!current) return Object.freeze({ state: "off" });
      try { guard(current.authority, current.epoch); assertListening(current); }
      catch { void stop().catch(() => {}); return Object.freeze({ state: "off" }); }
      return Object.freeze({ state: "listening", bindAddress: current.bindAddress, port: current.port, hostId: current.hostId });
    },
    async start(input, { confirm, assertRequester } = {}) {
      const value = requireSpsNativeHostListenInput(input);
      if (busy || current || typeof confirm !== "function") throw error();
      busy = true;
      let candidate = null;
      try {
        const authority = capture(), epoch = generation;
        const check = () => guard(authority, epoch, assertRequester);
        check();
        await authenticate(); check();
        const addresses = localAddresses();
        if (!Array.isArray(addresses) || !addresses.includes(value.bindAddress)) throw error();
        const identity = requireCurrentSpsNativeHostIdentity(await getIdentity(authority));
        check();
        const serverCertificates = await serverCertificateHistory(identity, authority);
        check();
        const details = inspectSpsNativeHostIdentity(identity);
        const metadata = await getCoreIdentity();
        check();
        if (!metadata || metadata.hostId !== identity.hostId || metadata.serverSpkiSha256 !== details.serverSpkiSha256) throw error();
        if (await confirm(Object.freeze({ ...value, hostId: identity.hostId, serverSpkiSha256: details.serverSpkiSha256 })) !== true) {
          check(); return Object.freeze({ cancelled: true });
        }
        check();
        if (!localAddresses().includes(value.bindAddress)) throw error();
        // The settings requester authorizes start, but a closed settings window
        // is not an account/Host revocation after successful opt-in.
        candidate = createIngress({ getIdentity: () => identity, getServerCertificates: () => serverCertificates,
          assertCurrent: () => guard(authority, epoch), dispatch,
          ...(dispatchWorkspace ? { dispatchWorkspace } : {}) });
        const bound = await candidate.start(value);
        check();
        if (!bound || bound.state !== "listening" || bound.bindAddress !== value.bindAddress || bound.port !== value.port
          || bound.hostId !== identity.hostId) throw error();
        current = { ...value, hostId: identity.hostId, authority, epoch, ingress: candidate, certificates: certificates(identity) };
        candidate = null;
        return this.inspect();
      } catch { throw error(); }
      finally { if (candidate) await candidate.stop().catch(() => {}); busy = false; }
    },
    async copyInvite({ confirm, assertRequester } = {}) {
      if (busy || !current || typeof confirm !== "function" || typeof issuePairing !== "function" || typeof copyInvitation !== "function") throw error();
      busy = true;
      try {
        const selected = current;
        const check = () => {
          guard(selected.authority, selected.epoch, assertRequester);
          if (current !== selected) throw error();
          assertListening(selected);
        };
        check(); await authenticate(); check();
        if (await confirm(Object.freeze({ bindAddress: selected.bindAddress, port: selected.port, hostId: selected.hostId })) !== true) {
          check(); return Object.freeze({ cancelled: true });
        }
        check();
        const identity = requireCurrentSpsNativeHostIdentity(await getIdentity(selected.authority)); check();
        const currentCertificates = certificates(identity);
        if (currentCertificates.server !== selected.certificates.server || currentCertificates.issuer !== selected.certificates.issuer) throw error();
        const details = inspectSpsNativeHostIdentity(identity);
        const binding = await getCoreIdentity(); check();
        if (identity.hostId !== selected.hostId || binding.hostId !== selected.hostId || binding.serverSpkiSha256 !== details.serverSpkiSha256) throw error();
        const pairing = record(await issuePairing(), ["pairingId", "pairingSecret", "issuedAt", "expiresAt"]); check();
        if (pairing.expiresAt - pairing.issuedAt !== 3600000 || pairing.expiresAt <= Date.now()) throw error();
        const address = isIP(selected.bindAddress) === 6 ? `[${selected.bindAddress}]` : selected.bindAddress;
        const code = createSpsNativeInviteCode({ v: 2, kind: "sps.native-lan.pairing", hostId: selected.hostId,
          origin: `https://${address}:${selected.port}`, spkiSha256: details.serverSpkiSha256,
          serverCertificate: new X509Certificate(identity.server.certificatePem).raw.toString("base64url"), ...pairing });
        check();
        const copied = copyInvitation(code);
        if (copied !== undefined) { if (copied instanceof Promise) void copied.catch(() => {}); throw error(); }
        check();
        return Object.freeze({ copied: true, expiresAt: new Date(pairing.expiresAt).toISOString() });
      } catch { throw error(); }
      finally { busy = false; }
    },
    stop,
  });
}
