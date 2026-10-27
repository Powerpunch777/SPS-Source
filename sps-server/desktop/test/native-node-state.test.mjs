import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { emptyState, loadState, saveState } from "../src/state.mjs";
import { nativeNodeIdentityCapsule, nativeNodeScopeKey, normalizeSpsNativeNodeState,
  readNativeNodeIdentityCapsule, validateSpsNativeNodeIdentity } from "../src/native-node-state.mjs";
import { lstat, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SCOPE = Object.freeze({ identityIssuer: "https://identity.example", subject: "member-1",
  hostId: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-8222-222222222222",
  deviceId: "33333333-3333-4333-8333-333333333333" });

function identity() {
  const ed = generateKeyPairSync("ed25519");
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return validateSpsNativeNodeIdentity({ algorithm: "ed25519", publicKeyPem: ed.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: ed.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), transportAlgorithm: "rsa-oaep-sha256",
    transportPublicKeyPem: rsa.publicKey.export({ type: "spki", format: "pem" }).toString(),
    transportPrivateKeyPem: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString() });
}

test("Node identity capsule is bound to the full issuer, subject, Host, workspace, and device scope", () => {
  const key = identity();
  const capsule = nativeNodeIdentityCapsule(SCOPE, key);
  assert.deepEqual(readNativeNodeIdentityCapsule(SCOPE, capsule), key);
  for (const [field, value] of [["identityIssuer", "https://other.example"], ["subject", "other-member"],
    ["hostId", "44444444-4444-4444-8444-444444444444"], ["workspaceId", "55555555-5555-4555-8555-555555555555"],
    ["deviceId", "66666666-6666-4666-8666-666666666666"]]) {
    assert.notEqual(nativeNodeScopeKey({ ...SCOPE, [field]: value }), nativeNodeScopeKey(SCOPE));
    assert.throws(() => readNativeNodeIdentityCapsule({ ...SCOPE, [field]: value }, capsule), /configuration is invalid/);
  }
});

test("Native Node state rejects duplicate scopes and preserves disabled or pending entries", () => {
  const entry = { ...SCOPE, nodeId: null, encryptedIdentity: Buffer.from("protected capsule").toString("base64"), enabled: false };
  const normalized = normalizeSpsNativeNodeState({ v: 1, entries: [entry] });
  assert.deepEqual(normalized.entries[0], entry);
  assert.throws(() => normalizeSpsNativeNodeState({ v: 1, entries: [entry, entry] }), /configuration is invalid/);
});

test("loading a v12 desktop state upgrades to v13 while preserving existing identity and legacy fields", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sps-native-node-state-"));
  const canonicalDirectory = await realpath(directory);
  const directoryIdentity = await lstat(canonicalDirectory, { bigint: true });
  try {
    const legacy = { ...emptyState(), version: 12, nodeId: "legacy-node", nodeStatus: "active",
      encryptedDesktopAccount: "opaque-account-ciphertext", identity: { publicKeyPem: "legacy-public-key" },
      accountConnections: { "member-1": { hubUrl: "https://host.example", connectionKind: "remote" } } };
    await writeFile(path.join(directory, "sps-desktop-state.json"), JSON.stringify(legacy));
    const loaded = await loadState(directory, { strictVersion: true });
    assert.equal(loaded.version, 13);
    assert.equal(loaded.nodeId, "legacy-node");
    assert.equal(loaded.nodeStatus, "active");
    assert.equal(loaded.encryptedDesktopAccount, "opaque-account-ciphertext");
    assert.deepEqual(loaded.identity, legacy.identity);
    assert.equal(loaded.accountConnections["member-1"].hubUrl, "https://host.example");
    assert.equal(loaded.accountConnections["member-1"].connectionKind, "remote");
    assert.deepEqual(loaded.nativeNodes, { v: 1, entries: [] });
    await saveState(directory, loaded);
    const reloaded = await loadState(directory, { strictVersion: true });
    assert.equal(reloaded.version, 13);
    assert.equal(reloaded.nodeId, "legacy-node");
    assert.deepEqual(reloaded.identity, legacy.identity);
    assert.deepEqual(reloaded.nativeNodes, { v: 1, entries: [] });
  } finally {
    assert.equal(await realpath(directory), canonicalDirectory);
    assert.equal(path.dirname(canonicalDirectory), await realpath(os.tmpdir()));
    const current = await lstat(canonicalDirectory, { bigint: true });
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(current.dev, directoryIdentity.dev);
    assert.equal(current.ino, directoryIdentity.ino);
    assert.equal(current.birthtimeNs, directoryIdentity.birthtimeNs);
    await rm(canonicalDirectory, { recursive: true });
  }
});
