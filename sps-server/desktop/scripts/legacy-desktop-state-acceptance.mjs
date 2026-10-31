import assert from "node:assert/strict";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectLegacyDesktopStateV11 } from "./legacy-desktop-state-fixture.mjs";

export async function captureLegacyStateEvidence(app, expectedSubject) {
  return await app.evaluate(({ app, safeStorage }, expectedSubject) => {
    const fs = process.getBuiltinModule("fs");
    const path = process.getBuiltinModule("path");
    const crypto = process.getBuiltinModule("crypto");
    const statePath = path.join(app.getPath("userData"), "sps-desktop-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8").replace(/^\uFEFF/, ""));
    if (state.version !== 13) throw new Error("Expected current v13 state before legacy projection.");
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows safeStorage is unavailable for migration evidence.");
    const decrypt = value => safeStorage.decryptString(Buffer.from(value, "base64"));
    const digest = value => crypto.createHash("sha256").update(value).digest("hex");
    if (typeof state.encryptedDesktopAccount !== "string") throw new Error("Persisted fixture account ciphertext is missing.");
    const accountJson = decrypt(state.encryptedDesktopAccount);
    const account = JSON.parse(accountJson);
    if (account.subject !== expectedSubject) throw new Error("Persisted fixture account subject did not decrypt as expected.");

    let identity = state.identity;
    let generatedIdentity = null;
    if (identity === null) {
      const hasNativeNodes = Array.isArray(state.nativeNodes?.entries) && state.nativeNodes.entries.length > 0;
      if (state.nodeId || hasNativeNodes) throw new Error("Refusing to create a fixture key for a state with a Node ID or grants.");
      const pair = crypto.generateKeyPairSync("ed25519");
      const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
      const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
      generatedIdentity = {
        publicKeyPem,
        encryptedPrivateKey: safeStorage.encryptString(privateKeyPem).toString("base64"),
      };
      identity = generatedIdentity;
    } else if (!identity || typeof identity.publicKeyPem !== "string" || typeof identity.encryptedPrivateKey !== "string") {
      throw new Error("Existing persisted Node identity is malformed; refusing to replace it.");
    }

    const route = {
      desktopDeviceId: state.desktopDeviceId ?? null,
      ownerHostOwnerSubject: state.ownerHostOwnerSubject ?? null,
      accountConnections: state.accountConnections ?? {},
      profile: state.profile ?? null,
      nodeId: state.nodeId ?? null,
    };
    const decryptDigest = value => value ? digest(decrypt(value)) : null;
    const nodePrivateKey = decrypt(identity.encryptedPrivateKey);
    const transportPrivateKey = identity.encryptedTransportPrivateKey
      ? decrypt(identity.encryptedTransportPrivateKey)
      : null;
    const snapshot = {
      accountSubject: account.subject,
      accountDigest: digest(accountJson),
      routeDigest: digest(JSON.stringify(route)),
      desktopDeviceId: route.desktopDeviceId,
      ownerHostOwnerSubject: route.ownerHostOwnerSubject,
      nodeId: route.nodeId,
      nodePublicKeyPem: identity.publicKeyPem,
      nodePrivateKeyDigest: digest(nodePrivateKey),
      transportPublicKeyPem: identity.transportPublicKeyPem ?? null,
      transportPrivateKeyDigest: transportPrivateKey ? digest(transportPrivateKey) : null,
      boardCredentialDigest: decryptDigest(state.encryptedBoardApiToken),
      teamCredentialDigest: decryptDigest(state.encryptedTeamCredentials),
      hostProjectShareSecretDigest: decryptDigest(state.encryptedHostProjectShareSecrets),
    };
    return { snapshot, generatedIdentity };
  }, expectedSubject);
}

export async function rewriteAsLegacyV11State(profile, fixture, stateEvidence) {
  if (!fixture || typeof fixture.directory !== "string" || typeof fixture.assertCurrent !== "function") {
    throw new TypeError("An owned fixture with a directory and assertCurrent() is required.");
  }
  if (!path.isAbsolute(fixture.directory) || !path.isAbsolute(profile)) {
    throw new Error("Legacy state fixture and profile must be absolute paths.");
  }
  await fixture.assertCurrent();
  const fixtureDirectory = path.resolve(fixture.directory);
  const profileDirectory = path.resolve(profile);
  if (path.dirname(profileDirectory) !== fixtureDirectory || path.basename(profileDirectory) === ".") {
    throw new Error("Legacy state profile must be a direct child of its owned fixture.");
  }
  const profileInfo = await lstat(profileDirectory);
  if (!profileInfo.isDirectory() || profileInfo.isSymbolicLink()) {
    throw new Error("Legacy state profile must be a plain, non-link directory.");
  }

  const statePath = path.join(profileDirectory, "sps-desktop-state.json");
  if (path.resolve(path.dirname(statePath)) !== profileDirectory) {
    throw new Error("Legacy state fixture escaped its owned profile.");
  }
  const stateIdentity = await lstat(statePath, { bigint: true });
  const regularState = info => info.isFile() && !info.isSymbolicLink() && info.nlink === 1n;
  if (!regularState(stateIdentity)) throw new Error("Legacy state must be an unlinked regular fixture file.");
  const current = JSON.parse((await readFile(statePath, "utf8")).replace(/^\uFEFF/, ""));
  assert.equal(current.version, 13);
  if (stateEvidence.generatedIdentity) {
    assert.equal(current.identity, null, "A generated fixture identity may only fill a truly missing identity.");
    current.identity = stateEvidence.generatedIdentity;
  }
  const legacy = projectLegacyDesktopStateV11(current);
  assert.equal(legacy.encryptedDesktopAccount, current.encryptedDesktopAccount);
  assert.equal(legacy.desktopDeviceId, current.desktopDeviceId);
  assert.equal(legacy.ownerHostOwnerSubject, current.ownerHostOwnerSubject);
  assert.deepEqual(legacy.accountConnections, current.accountConnections);
  assert.deepEqual(legacy.profile, current.profile);
  assert.equal(legacy.encryptedBoardApiToken, current.encryptedBoardApiToken);
  assert.equal(legacy.encryptedHostProjectShareSecrets, current.encryptedHostProjectShareSecrets);
  await fixture.assertCurrent();
  const latest = await lstat(statePath, { bigint: true });
  if (!regularState(latest) || ["dev", "ino", "birthtimeNs"].some(key => latest[key] !== stateIdentity[key])) {
    throw new Error("Legacy state fixture file changed before projection.");
  }
  await writeFile(statePath, `${JSON.stringify(legacy, null, 2)}\n`, { flag: "w" });
  return legacy;
}
