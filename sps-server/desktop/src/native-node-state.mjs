import { createPrivateKey, createPublicKey } from "node:crypto";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";
import { validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";

const fields = ["identityIssuer", "subject", "hostId", "workspaceId", "deviceId", "nodeId", "encryptedIdentity", "enabled"];
const fail = () => new Error("The saved Native Node configuration is invalid. Existing keys were preserved.");
export const nativeNodeScopeKey = scope => JSON.stringify([scope.identityIssuer, scope.subject, scope.hostId, scope.workspaceId, scope.deviceId]);

export function normalizeSpsNativeNodeState(input) {
  try {
    const value = record(input, ["v", "entries"]);
    if (value.v !== 1 || !Array.isArray(value.entries) || value.entries.length > 128) throw fail();
    const descriptors = Object.getOwnPropertyDescriptors(value.entries);
    if (Object.getPrototypeOf(value.entries) !== Array.prototype
      || Reflect.ownKeys(descriptors).length !== value.entries.length + 1) throw fail();
    const items = Array.from({ length: value.entries.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw fail();
      return descriptor.value;
    });
    const seen = new Set();
    const entries = items.map(raw => {
      const entry = record(raw, fields);
      validateSpsNativeMemberPendingContext({ identityIssuer: entry.identityIssuer, subject: entry.subject,
        hostId: entry.hostId, deviceKeyId: entry.deviceId, serverSpkiSha256: "0".repeat(64), issuerSpkiSha256: "1".repeat(64) });
      if (typeof entry.enabled !== "boolean"
        || typeof entry.encryptedIdentity !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.encryptedIdentity)
        || entry.encryptedIdentity.length > 32768) throw fail();
      uuid(entry.hostId); uuid(entry.workspaceId); uuid(entry.deviceId);
      if (entry.nodeId !== null) uuid(entry.nodeId);
      const key = nativeNodeScopeKey(entry);
      if (seen.has(key)) throw fail();
      seen.add(key); return Object.freeze({ ...entry });
    });
    return Object.freeze({ v: 1, entries: Object.freeze(entries) });
  } catch { throw fail(); }
}

export function validateSpsNativeNodeIdentity(input) {
  try {
    const value = record(input, ["algorithm", "publicKeyPem", "privateKeyPem", "transportAlgorithm", "transportPublicKeyPem", "transportPrivateKeyPem"]);
    if (value.algorithm !== "ed25519" || value.transportAlgorithm !== "rsa-oaep-sha256"
      || Object.values(value).some(item => typeof item !== "string" || item.length > 8192)) throw fail();
    for (const [publicName, privateName, kind] of [["publicKeyPem", "privateKeyPem", "ed25519"],
      ["transportPublicKeyPem", "transportPrivateKeyPem", "rsa"]]) {
      const publicKey = createPublicKey(value[publicName]), privateKey = createPrivateKey(value[privateName]);
      if (publicKey.asymmetricKeyType !== kind || privateKey.asymmetricKeyType !== kind
        || kind === "rsa" && (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
        || !publicKey.export({ type: "spki", format: "der" }).equals(createPublicKey(privateKey).export({ type: "spki", format: "der" }))) throw fail();
    }
    return Object.freeze({ ...value });
  } catch { throw fail(); }
}

export function nativeNodeIdentityCapsule(scope, identity) {
  return JSON.stringify({ v: 1, kind: "sps.native.node-identity", scope: nativeNodeScopeKey(scope),
    identity: validateSpsNativeNodeIdentity(identity) });
}
export function readNativeNodeIdentityCapsule(scope, plaintext) {
  try {
    if (typeof plaintext !== "string" || Buffer.byteLength(plaintext) > 24576) throw fail();
    const value = record(JSON.parse(plaintext), ["v", "kind", "scope", "identity"]);
    if (value.v !== 1 || value.kind !== "sps.native.node-identity" || value.scope !== nativeNodeScopeKey(scope)) throw fail();
    return validateSpsNativeNodeIdentity(value.identity);
  } catch { throw fail(); }
}
