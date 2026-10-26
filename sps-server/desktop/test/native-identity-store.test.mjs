import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { mkdirSync, promises as nodeFs, rmdirSync } from "node:fs";
import { lstat, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeHostIdentityStore } from "../src/native-identity-store.mjs";

const validIdentity = Object.freeze({
  v: 1,
  kind: "sps.native.host-identity",
  hostId: "11111111-1111-4111-8111-111111111111",
  server: Object.freeze({
    certificatePem: "-----BEGIN CERTIFICATE-----\nSERVER_CERTIFICATE_SECRET\n-----END CERTIFICATE-----\n",
    privateKeyPem: "-----BEGIN PRIVATE KEY-----\nSERVER_PRIVATE_KEY_SECRET\n-----END PRIVATE KEY-----\n",
  }),
  memberIssuer: Object.freeze({
    certificatePem: "-----BEGIN CERTIFICATE-----\nISSUER_CERTIFICATE_SECRET\n-----END CERTIFICATE-----\n",
    privateKeyPem: "-----BEGIN PRIVATE KEY-----\nISSUER_PRIVATE_KEY_SECRET\n-----END PRIVATE KEY-----\n",
  }),
});

function makeSafeStorage({ failDecrypt = false, onDecrypt = () => {} } = {}) {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
    },
    decryptString(value) {
      onDecrypt();
      if (failDecrypt) throw new Error("fake authentication failed");
      if (value.length < 28) throw new Error("fake ciphertext is invalid");
      const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

function validateIdentity(value) {
  if (JSON.stringify(value) !== JSON.stringify(validIdentity)) throw new Error("identity rejected");
  return validIdentity;
}

async function removeKnownFixtureLink(root, canonicalRoot, relativePath) {
  const segments = relativePath.split(path.sep);
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    parent = path.join(parent, segment);
    let stat;
    try {
      stat = await lstat(parent);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    const canonicalParent = await realpath(parent);
    const relativeParent = path.relative(canonicalRoot, canonicalParent);
    if (stat.isSymbolicLink() || !stat.isDirectory() || relativeParent === ".."
      || relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent)) return;
  }
  const target = path.join(parent, segments.at(-1));
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) await rm(target, { recursive: false, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function assertNoFixtureLinks(directory) {
  for (const name of await readdir(directory)) {
    const child = path.join(directory, name);
    const stat = await lstat(child);
    if (stat.isSymbolicLink()) throw new Error("Refusing to recursively remove a fixture containing a link.");
    if (stat.isDirectory()) await assertNoFixtureLinks(child);
  }
}

async function fixture(t) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sps-native-identity-store-"));
  const originalStat = await lstat(temporaryRoot);
  const canonicalRoot = await realpath(temporaryRoot);
  const root = canonicalRoot;
  const userDataDirectory = path.join(root, "application-data");
  const vaultDirectory = path.join(root, "owner-vault");
  await mkdir(userDataDirectory);
  await mkdir(vaultDirectory);
  t.after(async () => {
    const tempParent = await realpath(os.tmpdir());
    const currentRoot = await realpath(root);
    const relative = path.relative(tempParent, currentRoot);
    const segments = relative.split(path.sep).filter(Boolean);
    const currentStat = await lstat(root);
    if (currentRoot !== canonicalRoot || segments.length !== 1
      || !segments[0].startsWith("sps-native-identity-store-")
      || currentStat.isSymbolicLink() || !currentStat.isDirectory()
      || currentStat.dev !== originalStat.dev || currentStat.ino !== originalStat.ino) {
      throw new Error("Refusing to recursively remove a changed native identity test fixture.");
    }
    for (const relativeLink of [
      "linked-user-data",
      "linked-vault",
      path.join("application-data", "native-connectivity", "credentials"),
    ]) {
      await removeKnownFixtureLink(root, canonicalRoot, relativeLink);
    }
    await assertNoFixtureLinks(root);
    const finalRoot = await realpath(root);
    const finalStat = await lstat(root);
    if (finalRoot !== canonicalRoot || finalStat.isSymbolicLink() || !finalStat.isDirectory()
      || finalStat.dev !== originalStat.dev || finalStat.ino !== originalStat.ino) {
      throw new Error("Refusing to recursively remove a changed native identity test fixture.");
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, userDataDirectory, vaultDirectory };
}

function storeFor(paths, overrides = {}) {
  return createSpsNativeHostIdentityStore({
    ...paths,
    safeStorage: makeSafeStorage(),
    platform: "win32",
    validateIdentity,
    ...overrides,
  });
}

function replaceEmptyVault(paths) {
  rmdirSync(paths.vaultDirectory);
  mkdirSync(paths.vaultDirectory);
}

async function credentialsDirectory(userDataDirectory) {
  return path.join(userDataDirectory, "native-connectivity", "credentials");
}

async function slotFile(userDataDirectory, vaultDirectory) {
  const canonicalVault = await realpath(vaultDirectory);
  const slot = createHash("sha256").update(canonicalVault.toLowerCase(), "utf8").digest("hex");
  return path.join(await credentialsDirectory(userDataDirectory), `host-identity-${slot}.json`);
}

async function removeEmptyOwnedVault(paths) {
  const rootStat = await lstat(paths.root);
  const canonicalRoot = await realpath(paths.root);
  const vaultStat = await lstat(paths.vaultDirectory);
  assert.equal(rootStat.isSymbolicLink(), false);
  assert.equal(rootStat.isDirectory(), true);
  assert.equal(vaultStat.isSymbolicLink(), false);
  assert.equal(vaultStat.isDirectory(), true);
  assert.equal(await realpath(path.dirname(paths.vaultDirectory)), canonicalRoot);
  assert.equal(await realpath(paths.vaultDirectory), path.resolve(paths.vaultDirectory));
  await rmdir(paths.vaultDirectory);
}

test("fixture paths are canonical children of the owned temporary root", async t => {
  const paths = await fixture(t);
  for (const directory of Object.values(paths)) {
    assert.equal(await realpath(directory), directory);
  }
  assert.equal(path.dirname(paths.userDataDirectory), paths.root);
  assert.equal(path.dirname(paths.vaultDirectory), paths.root);
  assert.equal(path.dirname(paths.root), await realpath(os.tmpdir()));
});

test("requires Windows and available safeStorage without importing Electron", () => {
  assert.throws(() => createSpsNativeHostIdentityStore({ platform: "linux" }), {
    code: "ERR_SPS_NATIVE_IDENTITY_STORE_UNSUPPORTED_PLATFORM",
  });
  assert.throws(() => createSpsNativeHostIdentityStore({
    platform: "win32",
    safeStorage: { isEncryptionAvailable: () => false },
  }), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_ENCRYPTION_UNAVAILABLE" });
  assert.throws(() => createSpsNativeHostIdentityStore({
    platform: "win32",
    safeStorage: { isEncryptionAvailable: () => true },
  }), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_ENCRYPTION_UNAVAILABLE" });
});

test("never places credential storage inside or around an exported Owner Vault", async t => {
  const paths = await fixture(t);
  const nestedData = path.join(paths.vaultDirectory, "projects", "application-data");
  await mkdir(nestedData, { recursive: true });
  await assert.rejects(storeFor({ ...paths, userDataDirectory: nestedData }).create(validIdentity), {
    code: "ERR_SPS_NATIVE_IDENTITY_STORE_OPTIONS",
  });
  const nativeRoot = path.join(paths.userDataDirectory, "native-connectivity");
  const nestedVault = path.join(nativeRoot, "vault");
  await mkdir(nestedVault, { recursive: true });
  await assert.rejects(storeFor({ ...paths, vaultDirectory: nestedVault }).create(validIdentity), {
    code: "ERR_SPS_NATIVE_IDENTITY_STORE_OPTIONS",
  });

  const childVault = path.join(paths.root, "child-vault");
  await mkdir(childVault);
  const parentUserDataStore = storeFor({ userDataDirectory: paths.root, vaultDirectory: childVault });
  assert.deepEqual(await parentUserDataStore.inspectPresence(), { state: "absent" });
  await parentUserDataStore.create(validIdentity);
  assert.equal(await parentUserDataStore.read(), validIdentity);
});

test("inspectPresence is frozen, bounded, and detects a corrupt slot for a deleted Vault without decrypting", async t => {
  const paths = await fixture(t);
  let decryptCalls = 0;
  const safeStorage = makeSafeStorage({ onDecrypt: () => { decryptCalls += 1; } });
  const store = storeFor(paths, { safeStorage });
  assert.deepEqual(await store.inspectPresence(), { state: "absent" });
  assert.equal(Object.isFrozen(await store.inspectPresence()), true);
  await store.create(validIdentity);
  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  await writeFile(file, "unknown future credential format");

  await removeEmptyOwnedVault(paths);
  const missingVault = path.join(paths.root, "OWNER-VAULT");
  const staleStore = storeFor({ ...paths, vaultDirectory: missingVault }, { safeStorage });
  const presence = await staleStore.inspectPresence();
  assert.deepEqual(presence, { state: "present" });
  assert.equal(Object.isFrozen(presence), true);
  assert.equal(decryptCalls, 0);
  await assert.rejects(staleStore.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED" });
  await assert.rejects(staleStore.create(validIdentity), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED" });
  assert.equal(decryptCalls, 0);
});

test("a completely missing Vault without credentials is absent and inspection creates no directories", async t => {
  const paths = await fixture(t);
  await removeEmptyOwnedVault(paths);
  const missingVault = path.join(paths.root, "missing-parent", "owner-vault");
  const store = storeFor({ ...paths, vaultDirectory: missingVault });
  const presence = await store.inspectPresence();
  assert.deepEqual(presence, { state: "absent" });
  assert.equal(Object.isFrozen(presence), true);
  await assert.rejects(readdir(path.join(paths.userDataDirectory, "native-connectivity")), { code: "ENOENT" });
});

test("inspectPresence rejects non-directory ancestors and invalid credential directories with static errors", async t => {
  const paths = await fixture(t);
  const blockedVaultParent = path.join(paths.root, "vault-parent-file");
  await writeFile(blockedVaultParent, "not a directory");
  const blockedVaultStore = storeFor({ ...paths, vaultDirectory: path.join(blockedVaultParent, "vault") });
  await assert.rejects(blockedVaultStore.inspectPresence(), error => {
    assert.equal(error.code, "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED");
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });

  const credentialRoot = path.join(paths.userDataDirectory, "native-connectivity");
  await writeFile(credentialRoot, "not a directory");
  await assert.rejects(storeFor(paths).inspectPresence(), {
    code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED",
  });
});

test("inspectPresence treats a directory at the expected slot path as present", async t => {
  const paths = await fixture(t);
  const credentials = await credentialsDirectory(paths.userDataDirectory);
  await mkdir(credentials, { recursive: true });
  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  await mkdir(file);
  const presence = await storeFor(paths).inspectPresence();
  assert.deepEqual(presence, { state: "present" });
  assert.equal(Object.isFrozen(presence), true);
});

test("persists only encrypted canonical data under application userData and reads validated identity", async t => {
  const paths = await fixture(t);
  const safeStorage = makeSafeStorage();
  const store = storeFor(paths, { safeStorage });
  assert.equal(await store.read(), null);
  assert.equal(await store.create(validIdentity), validIdentity);
  assert.equal(await store.read(), validIdentity);
  assert.equal(Object.isFrozen(await store.read()), true);

  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  const raw = await readFile(file, "utf8");
  const outer = JSON.parse(raw);
  assert.equal(raw, JSON.stringify(outer));
  assert.deepEqual(Object.keys(outer), ["v", "kind", "ciphertext"]);
  assert.equal(outer.v, 2);
  assert.equal(outer.kind, "sps.native.host-identity-store");
  assert.equal(Buffer.from(outer.ciphertext, "base64").toString("base64"), outer.ciphertext);
  for (const secret of [validIdentity.hostId, ...Object.values(validIdentity.server), ...Object.values(validIdentity.memberIssuer)]) {
    assert.equal(raw.includes(secret), false);
  }
  assert.deepEqual(await readdir(await credentialsDirectory(paths.userDataDirectory)), [path.basename(file)]);
  assert.deepEqual(await readdir(paths.vaultDirectory), []);
});

test("uses the default certificate validator for identities saved and reloaded by the store", async t => {
  const paths = await fixture(t);
  const now = Math.floor(Date.now() / 1000) * 1000;
  const identity = await createSpsNativeHostIdentity({
    hostId: validIdentity.hostId,
    hostnames: ["localhost", "127.0.0.1"],
    notBefore: now - 60_000,
    notAfter: now + 5 * 60_000,
    issuerNotAfter: now + 10 * 60_000,
  });
  const store = createSpsNativeHostIdentityStore({
    ...paths,
    safeStorage: makeSafeStorage(),
    platform: "win32",
  });
  await store.create(identity);
  const reloaded = await store.read();
  assert.deepEqual(reloaded, identity);
  assert.equal(Object.isFrozen(reloaded), true);
  assert.equal(Object.isFrozen(reloaded.server), true);
  assert.equal(Object.isFrozen(reloaded.memberIssuer), true);
});

test("a recreated Vault cannot read or adopt a valid credential from its previous incarnation", async t => {
  const paths = await fixture(t);
  const now = Math.floor(Date.now() / 1000) * 1000;
  const identity = await createSpsNativeHostIdentity({
    hostId: validIdentity.hostId,
    hostnames: ["localhost", "127.0.0.1"],
    notBefore: now - 60_000,
    notAfter: now + 5 * 60_000,
    issuerNotAfter: now + 10 * 60_000,
  });
  const store = createSpsNativeHostIdentityStore({
    ...paths,
    safeStorage: makeSafeStorage(),
    platform: "win32",
  });
  await store.create(identity);
  assert.deepEqual(await store.read(), identity);
  const previous = await lstat(paths.vaultDirectory, { bigint: true });

  await removeEmptyOwnedVault(paths);
  await mkdir(paths.vaultDirectory);
  const replacement = await lstat(paths.vaultDirectory, { bigint: true });
  assert.notDeepEqual(
    [previous.dev, previous.ino, previous.birthtimeNs],
    [replacement.dev, replacement.ino, replacement.birthtimeNs],
  );

  assert.deepEqual(await store.inspectPresence(), { state: "present" });
  await assert.rejects(store.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });
  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  const beforeCreate = await readFile(file);
  await assert.rejects(store.create(identity), { code: "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS" });
  assert.deepEqual(await readFile(file), beforeCreate);
});

test("version 1 credentials stay present and are never decrypted, migrated, or overwritten", async t => {
  const paths = await fixture(t);
  let decryptCalls = 0;
  const safeStorage = makeSafeStorage({ onDecrypt: () => { decryptCalls += 1; } });
  const store = storeFor(paths, { safeStorage });
  await store.create(validIdentity);
  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  const oldEnvelope = JSON.stringify({
    v: 1,
    kind: "sps.native.host-identity-store",
    context: { userDataDirectory: await realpath(paths.userDataDirectory), vaultDirectory: await realpath(paths.vaultDirectory) },
    identity: validIdentity,
  });
  const oldSlot = JSON.stringify({
    v: 1,
    kind: "sps.native.host-identity-store",
    ciphertext: safeStorage.encryptString(oldEnvelope).toString("base64"),
  });
  await writeFile(file, oldSlot, "utf8");

  assert.deepEqual(await store.inspectPresence(), { state: "present" });
  await assert.rejects(store.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });
  await assert.rejects(store.create(validIdentity), { code: "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS" });
  assert.equal(await readFile(file, "utf8"), oldSlot);
  assert.equal(decryptCalls, 0);
});

test("rejects altered version 2 Vault incarnation context fields", async t => {
  const paths = await fixture(t);
  const safeStorage = makeSafeStorage();
  const store = storeFor(paths, { safeStorage });
  await store.create(validIdentity);
  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  const originalBytes = await readFile(file);
  const outer = JSON.parse(originalBytes.toString("utf8"));
  const envelope = JSON.parse(safeStorage.decryptString(Buffer.from(outer.ciphertext, "base64")));
  assert.equal(outer.v, 2);
  assert.equal(envelope.v, 2);
  assert.deepEqual(Object.keys(envelope.context), ["userDataDirectory", "vaultDirectory", "vaultIncarnation"]);
  assert.deepEqual(Object.keys(envelope.context.vaultIncarnation), ["dev", "ino", "birthtimeNs"]);

  for (const field of ["dev", "ino", "birthtimeNs"]) {
    const tampered = structuredClone(envelope);
    tampered.context.vaultIncarnation[field] = (BigInt(tampered.context.vaultIncarnation[field]) + 1n).toString(10);
    const ciphertext = safeStorage.encryptString(JSON.stringify(tampered));
    await writeFile(file, JSON.stringify({ v: 2, kind: outer.kind, ciphertext: ciphertext.toString("base64") }), "utf8");
    await assert.rejects(store.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });
  }
  await writeFile(file, originalBytes);
  assert.deepEqual(await store.read(), validIdentity);
});

test("rejects unavailable or non-positive BigInt Vault incarnation metadata", async t => {
  const paths = await fixture(t);
  const store = storeFor(paths);
  await store.create(validIdentity);
  const originalLstat = nodeFs.lstat;

  for (const [field, replacement] of [["dev", 0n], ["ino", 0n], ["birthtimeNs", 0n], ["birthtimeNs", undefined]]) {
    let vaultStatCalls = 0;
    t.mock.method(nodeFs, "lstat", async function (target, options) {
      const stat = await Reflect.apply(originalLstat, nodeFs, [target, options]);
      if (options?.bigint !== true || await realpath(target) !== paths.vaultDirectory) return stat;
      vaultStatCalls++;
      return {
        dev: field === "dev" ? replacement : stat.dev,
        ino: field === "ino" ? replacement : stat.ino,
        birthtimeNs: field === "birthtimeNs" ? replacement : stat.birthtimeNs,
        isDirectory: () => stat.isDirectory(),
        isSymbolicLink: () => stat.isSymbolicLink(),
      };
    });
    try {
      await assert.rejects(store.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED" });
      assert.ok(vaultStatCalls > 0);
      const readStatCalls = vaultStatCalls;
      await assert.rejects(store.create(validIdentity), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED" });
      assert.ok(vaultStatCalls > readStatCalls);
    } finally {
      t.mock.restoreAll();
    }
  }
});

test("create is create-only even when the existing slot is corrupt", async t => {
  const paths = await fixture(t);
  const store = storeFor(paths);
  await store.create(validIdentity);
  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  await writeFile(file, "corrupt existing user data");
  await assert.rejects(store.create(validIdentity), { code: "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS" });
  assert.equal(await readFile(file, "utf8"), "corrupt existing user data");
  await assert.rejects(store.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });
});

test("rejects malformed, noncanonical, plaintext, and oversized store files", async t => {
  const paths = await fixture(t);
  const store = storeFor(paths);
  await store.create(validIdentity);
  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  const valid = await readFile(file);
  for (const raw of [
    Buffer.from("{"),
    Buffer.from(" \"duplicate\":1"),
    Buffer.from([0xff, 0xfe, 0xfd]),
    Buffer.from(JSON.stringify({ v: 2, kind: "sps.native.host-identity-store", ciphertext: "!!!!" })),
    Buffer.from(JSON.stringify(validIdentity)),
    Buffer.alloc(700 * 1024 + 1, 0x61),
  ]) {
    await writeFile(file, raw);
    await assert.rejects(store.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });
  }
  await writeFile(file, valid);
  assert.equal(await store.read(), validIdentity);
});

test("rejects swapped ciphertexts and ciphertext bound to a different userData context", async t => {
  const paths = await fixture(t);
  const secondVault = path.join(paths.root, "second-vault");
  const secondUserData = path.join(paths.root, "second-application-data");
  await mkdir(secondVault);
  await mkdir(secondUserData);
  const safeStorage = makeSafeStorage();
  const firstStore = storeFor(paths, { safeStorage });
  await firstStore.create(validIdentity);
  const firstFile = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  const firstBytes = await readFile(firstFile);

  const secondVaultStore = storeFor({ userDataDirectory: paths.userDataDirectory, vaultDirectory: secondVault }, { safeStorage });
  await secondVaultStore.read();
  const secondVaultFile = await slotFile(paths.userDataDirectory, secondVault);
  await writeFile(secondVaultFile, firstBytes);
  await assert.rejects(secondVaultStore.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });

  const secondContextStore = storeFor({ userDataDirectory: secondUserData, vaultDirectory: paths.vaultDirectory }, { safeStorage });
  await mkdir(await credentialsDirectory(secondUserData), { recursive: true });
  const secondContextFile = await slotFile(secondUserData, paths.vaultDirectory);
  await writeFile(secondContextFile, firstBytes);
  await assert.rejects(secondContextStore.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });
});

test("maps authenticated-decryption failures to a static error without secret diagnostics", async t => {
  const paths = await fixture(t);
  await storeFor(paths).create(validIdentity);
  const store = storeFor(paths, { safeStorage: makeSafeStorage({ failDecrypt: true }) });
  await assert.rejects(store.read(), error => {
    assert.equal(error.code, "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT");
    assert.equal(error.message.includes("SERVER_PRIVATE_KEY_SECRET"), false);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });
});

test("concurrent instances cannot replace the first persisted identity", async t => {
  const paths = await fixture(t);
  const safeStorage = makeSafeStorage();
  const first = storeFor(paths, { safeStorage });
  const second = storeFor(paths, { safeStorage });
  const results = await Promise.allSettled([first.create(validIdentity), second.create(validIdentity)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS");
  assert.equal(await first.read(), validIdentity);
  assert.deepEqual((await readdir(await credentialsDirectory(paths.userDataDirectory))).filter(name => name.endsWith(".tmp")), []);
});

test("rejects linked roots, junctioned storage directories, and linked slot files", async t => {
  const paths = await fixture(t);
  const outside = path.join(paths.root, "outside");
  await mkdir(outside);
  const linkedUserData = path.join(paths.root, "linked-user-data");
  await symlink(outside, linkedUserData, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(storeFor({ userDataDirectory: linkedUserData, vaultDirectory: paths.vaultDirectory }).create(validIdentity), {
    code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED",
  });
  assert.deepEqual(await readdir(outside), []);

  const linkedVault = path.join(paths.root, "linked-vault");
  await symlink(outside, linkedVault, process.platform === "win32" ? "junction" : "dir");
  const linkedVaultStore = storeFor({ userDataDirectory: paths.userDataDirectory, vaultDirectory: linkedVault });
  await assert.rejects(linkedVaultStore.read(), {
    code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED",
  });
  await assert.rejects(linkedVaultStore.inspectPresence(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED" });

  const junctionPaths = { userDataDirectory: paths.userDataDirectory, vaultDirectory: paths.vaultDirectory };
  const junctionStore = storeFor(junctionPaths);
  await mkdir(path.join(paths.userDataDirectory, "native-connectivity"));
  const linkedCredentials = path.join(paths.userDataDirectory, "native-connectivity", "credentials");
  await symlink(outside, linkedCredentials, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(junctionStore.create(validIdentity), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED" });
  await assert.rejects(junctionStore.inspectPresence(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED" });
  assert.deepEqual(await readdir(outside), []);

  assert.equal((await lstat(linkedCredentials)).isSymbolicLink(), true);
  await unlink(linkedCredentials);
  await mkdir(linkedCredentials);
  const file = await slotFile(paths.userDataDirectory, paths.vaultDirectory);
  const linkedFile = path.join(outside, "outside-secret.json");
  await writeFile(linkedFile, "outside sentinel");
  let fileSymlinkCreated = false;
  try { await symlink(linkedFile, file); fileSymlinkCreated = true; }
  catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.diagnostic(`File symlink check unavailable on this host (${error.code}); hardlink and directory checks still run.`);
      await rm(file, { force: true });
    } else throw error;
  }
  if (fileSymlinkCreated) {
    await assert.rejects(junctionStore.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });
    await assert.rejects(junctionStore.create(validIdentity), { code: "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS" });
    assert.deepEqual(await junctionStore.inspectPresence(), { state: "present" });
    assert.equal(await readFile(linkedFile, "utf8"), "outside sentinel");
    await rm(file);
  }

  await writeFile(file, "hard-linked slot");
  await link(file, path.join(outside, "hard-link.json"));
  await assert.rejects(junctionStore.read(), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT" });
});

test("validates before creating storage and rejects malformed identity input", async t => {
  const paths = await fixture(t);
  const store = storeFor(paths, { validateIdentity: () => { throw new Error("private validation detail"); } });
  await assert.rejects(store.create(validIdentity), error => {
    assert.equal(error.code, "ERR_SPS_NATIVE_IDENTITY_INVALID");
    assert.equal(error.message.includes("private validation detail"), false);
    return true;
  });
  await assert.rejects(readdir(path.join(paths.userDataDirectory, "native-connectivity")), { code: "ENOENT" });
  assert.equal(await storeFor(paths).read(), null);
});

test("a synchronous pre-commit authority guard can cancel without publishing a credential slot", async t => {
  const paths = await fixture(t);
  const store = storeFor(paths);
  await assert.rejects(store.create(validIdentity, { beforeCommit: () => { throw new Error("private authority diagnostic"); } }), {
    code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED",
  });
  assert.deepEqual(await store.inspectPresence(), { state: "absent" });
  assert.equal((await readdir(await credentialsDirectory(paths.userDataDirectory))).length, 0);
  await assert.rejects(store.create(validIdentity, { beforeCommit: () => Promise.reject(new Error("private async diagnostic")) }), {
    code: "ERR_SPS_NATIVE_IDENTITY_STORE_OPTIONS",
  });
  assert.deepEqual(await store.inspectPresence(), { state: "absent" });
  let invoked = false;
  const options = Object.defineProperty({}, "beforeCommit", { enumerable: true, get() { invoked = true; return () => {}; } });
  assert.throws(() => store.create(validIdentity, options), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_OPTIONS" });
  assert.equal(invoked, false);
});

test("a Vault replaced inside the synchronous pre-commit guard cannot receive the pending identity", async t => {
  const paths = await fixture(t);
  const store = storeFor(paths);
  await assert.rejects(store.create(validIdentity, {
    beforeCommit: () => replaceEmptyVault(paths),
  }), error => {
    assert.equal(error.code, "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED");
    assert.equal(error.message.includes(paths.vaultDirectory), false);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });
  assert.deepEqual(await store.inspectPresence(), { state: "absent" });
  assert.deepEqual((await readdir(await credentialsDirectory(paths.userDataDirectory))).filter(name => name.endsWith(".tmp")), []);
});

test("authority revoked during the final asynchronous Vault check cannot publish a credential slot", async t => {
  const paths = await fixture(t);
  const store = storeFor(paths);
  const originalLstat = nodeFs.lstat;
  let guardCalls = 0;
  let revoked = false;
  nodeFs.lstat = async (...args) => {
    const result = await originalLstat(...args);
    if (guardCalls > 0 && args[1]?.bigint === true && await realpath(args[0]) === paths.vaultDirectory) {
      await new Promise(resolve => setImmediate(() => { revoked = true; resolve(); }));
    }
    return result;
  };
  try {
    await assert.rejects(store.create(validIdentity, { beforeCommit: () => {
      guardCalls++;
      if (revoked) throw new Error("requester no longer authorized");
    } }), { code: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED" });
  } finally { nodeFs.lstat = originalLstat; }
  assert.equal(revoked, true);
  assert.equal(guardCalls, 2);
  assert.deepEqual(await store.inspectPresence(), { state: "absent" });
  assert.deepEqual(await readdir(await credentialsDirectory(paths.userDataDirectory)), []);
});

test("a Vault replaced during decryption fails before read returns an identity", async t => {
  const paths = await fixture(t);
  const safeStorage = makeSafeStorage({ onDecrypt: () => replaceEmptyVault(paths) });
  const writer = storeFor(paths, { safeStorage });
  await writer.create(validIdentity);
  const reader = storeFor(paths, { safeStorage });
  await assert.rejects(reader.read(), error => {
    assert.equal(error.code, "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED");
    assert.equal(error.message.includes(paths.vaultDirectory), false);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });
});
