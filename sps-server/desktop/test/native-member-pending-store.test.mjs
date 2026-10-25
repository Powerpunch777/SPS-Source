import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, rmdir, stat, writeFile, link } from "node:fs/promises";
import { mkdirSync, renameSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSpsNativeMemberKeyRequest } from "../src/native-member-certificates.mjs";
import { createSpsNativeMemberPendingKeyStore } from "../src/native-member-pending-store.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const OTHER_HOST = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const OTHER_DEVICE = "44444444-4444-4444-8444-444444444444";
const PREFIX = "sps-native-member-pending-store-test-";
const STORE_MESSAGES = Object.freeze({
  OPTIONS: "Native Member pending storage options are invalid.",
  FAILED: "Native Member pending storage is unavailable.",
  CORRUPT: "Native Member pending storage is invalid or does not match the expected context.",
  ALREADY_EXISTS: "A Native Member pending key already exists for this account and device.",
});
const CONTEXT = Object.freeze({
  identityIssuer: "https://identity.example.test",
  subject: "member@example.test",
  hostId: HOST,
  deviceKeyId: DEVICE,
  serverSpkiSha256: "a".repeat(64),
  issuerSpkiSha256: "b".repeat(64),
});
let keyRequest;

function makeSafeStorage() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(plaintext) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
    },
    decryptString(bytes) {
      if (bytes.length < 28) throw new Error("fixture authentication failure");
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function samePath(left, right) {
  const normalize = value => path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32"
    ? normalize(left).toLowerCase() === normalize(right).toLowerCase()
    : normalize(left) === normalize(right);
}

async function makeFixture() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), PREFIX));
  const createdIdentity = await lstat(temporary, { bigint: true });
  const root = await realpath(temporary);
  assert.equal(path.basename(root).startsWith(PREFIX), true);
  const rootIdentity = await lstat(root, { bigint: true });
  assert.equal(rootIdentity.isDirectory(), true);
  assert.equal(rootIdentity.isSymbolicLink(), false);
  assert.equal(rootIdentity.dev, createdIdentity.dev);
  assert.equal(rootIdentity.ino, createdIdentity.ino);
  assert.equal(path.dirname(root), await realpath(os.tmpdir()));

  const userDataDirectory = path.join(root, "user-data");
  const vaultDirectory = path.join(root, "vault");
  await mkdir(userDataDirectory);
  await mkdir(vaultDirectory);
  assert.equal(samePath(await realpath(userDataDirectory), userDataDirectory), true);
  assert.equal(samePath(await realpath(vaultDirectory), vaultDirectory), true);

  const safeStorage = makeSafeStorage();
  async function removeOwnedFixture() {
    assert.equal(path.resolve(root), root);
    assert.equal(samePath(await realpath(root), root), true);
    assert.equal(path.basename(root).startsWith(PREFIX), true);
    const currentRoot = await lstat(root, { bigint: true });
    assert.equal(currentRoot.isDirectory(), true);
    assert.equal(currentRoot.isSymbolicLink(), false);
    assert.equal(currentRoot.dev, rootIdentity.dev);
    assert.equal(currentRoot.ino, rootIdentity.ino);

    const inodes = new Map();
    async function verifyTree(directory) {
      for (const name of await readdir(directory)) {
        const item = path.resolve(directory, name);
        assert.equal(inside(root, item), true);
        const itemStat = await lstat(item, { bigint: true });
        if (itemStat.isSymbolicLink()) {
          const target = await realpath(item);
          assert.equal(inside(root, target), true);
          continue;
        }
        assert.equal(samePath(await realpath(item), item), true);
        if (itemStat.isDirectory()) {
          await verifyTree(item);
        } else {
          assert.equal(itemStat.isFile(), true);
          const id = `${itemStat.dev}:${itemStat.ino}`;
          const group = inodes.get(id) ?? { count: 0, links: itemStat.nlink };
          assert.equal(itemStat.nlink, group.links);
          group.count++;
          inodes.set(id, group);
        }
      }
    }
    await verifyTree(root);
    for (const group of inodes.values()) assert.equal(group.links, BigInt(group.count));
    const finalRoot = await lstat(root, { bigint: true });
    assert.equal(await realpath(root), root);
    assert.equal(finalRoot.isDirectory() && !finalRoot.isSymbolicLink(), true);
    assert.equal(finalRoot.dev, rootIdentity.dev);
    assert.equal(finalRoot.ino, rootIdentity.ino);
    await rm(root, { recursive: true, force: false });
    await assert.rejects(lstat(root), { code: "ENOENT" });
  }

  return {
    root,
    rootIdentity,
    userDataDirectory,
    vaultDirectory,
    safeStorage,
    store(overrides = {}) {
      return createSpsNativeMemberPendingKeyStore({
        userDataDirectory,
        vaultDirectory,
        context: CONTEXT,
        safeStorage,
        platform: "win32",
        ...overrides,
      });
    },
    async cleanup() { await removeOwnedFixture(); },
  };
}

async function withFixture(run) {
  const fixture = await makeFixture();
  try { await run(fixture); } finally { await fixture.cleanup(); }
}

function storeError(name) {
  return error => {
    assert.equal(error.code, `ERR_SPS_NATIVE_MEMBER_PENDING_STORE_${name}`);
    assert.equal(error.message, STORE_MESSAGES[name]);
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.doesNotMatch(error.message, /PRIVATE KEY|customer|access_token|[A-Za-z]:\\/);
    return true;
  };
}

function capsuleError(name) {
  return error => {
    assert.equal(error.code, `ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_${name}`);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  };
}

function storeDirectory(fixture) {
  return path.join(fixture.userDataDirectory, "native-connectivity", "member-pending");
}

async function slotFiles(fixture) {
  return (await readdir(storeDirectory(fixture))).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
}

async function removeOwnedEntry(fixture, target) {
  assert.equal(inside(fixture.root, path.resolve(target)), true);
  assert.equal(inside(fixture.root, await realpath(target)), true);
  assert.equal(await realpath(path.dirname(target)), storeDirectory(fixture));
  const info = await lstat(target);
  if (info.isDirectory() && !info.isSymbolicLink()) {
    assert.deepEqual(await readdir(target), []);
    await rmdir(target);
  } else await rm(target, { force: true });
}

test("inspection reports absence without creating the native store", async () => withFixture(async fixture => {
  const store = fixture.store();
  const presence = await store.inspectPresence();
  assert.deepEqual(presence, { state: "absent" });
  assert.equal(Object.isFrozen(presence), true);
  assert.equal(Object.isFrozen(store), true);
  assert.deepEqual(await readdir(fixture.userDataDirectory), []);
  assert.deepEqual(await readdir(fixture.vaultDirectory), []);
}));

test("creates and reads an actual Member key request outside the Vault without cleartext", async () => withFixture(async fixture => {
  const store = fixture.store();
  const vaultIdentity = await stat(fixture.vaultDirectory, { bigint: true });
  const created = await store.create(keyRequest);
  assert.deepEqual(created, keyRequest);
  assert.equal(Object.isFrozen(created), true);
  assert.deepEqual(await store.read(), keyRequest);
  assert.deepEqual(await store.inspectPresence(), { state: "present" });

  const entries = await slotFiles(fixture);
  assert.equal(entries.length, 1);
  const slot = path.join(storeDirectory(fixture), entries[0]);
  assert.equal(inside(fixture.userDataDirectory, slot), true);
  assert.equal(inside(fixture.vaultDirectory, slot), false);
  const serialized = await readFile(slot, "utf8");
  assert.doesNotMatch(serialized, /PRIVATE KEY|member@example\.test|identity\.example\.test|11111111-1111-4111-8111-111111111111/);
  assert.equal(serialized.includes(keyRequest.privateKeyPem), false);
  assert.equal(serialized.includes(keyRequest.requestPem), false);
  assert.deepEqual(await readdir(fixture.vaultDirectory), []);
  const vaultAfter = await stat(fixture.vaultDirectory, { bigint: true });
  assert.equal(vaultAfter.dev, vaultIdentity.dev);
  assert.equal(vaultAfter.ino, vaultIdentity.ino);
}));

test("refuses a second create when the logical slot is corrupt and preserves its bytes", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const slot = path.join(storeDirectory(fixture), (await slotFiles(fixture))[0]);
  await writeFile(slot, "{not a capsule", "utf8");
  const before = await readFile(slot);
  await assert.rejects(store.read(), storeError("CORRUPT"));
  await assert.rejects(store.create(keyRequest), storeError("ALREADY_EXISTS"));
  assert.deepEqual(await readFile(slot), before);
}));

test("serializes concurrent stores with one atomic first writer", async () => withFixture(async fixture => {
  const first = fixture.store();
  const second = fixture.store();
  const otherKey = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  const results = await Promise.allSettled([first.create(keyRequest), second.create(otherKey)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  const rejected = results.find(result => result.status === "rejected");
  assert.equal(storeError("ALREADY_EXISTS")(rejected.reason), true);
  const winner = results[0].status === "fulfilled" ? keyRequest : otherKey;
  assert.deepEqual(await first.read(), winner);
  assert.equal((await slotFiles(fixture)).length, 1);
}));

test("does not adopt a key from a different issuer, subject, Host, or device logical slot", async () => withFixture(async fixture => {
  const original = fixture.store();
  await original.create(keyRequest);
  for (const context of [
    { ...CONTEXT, identityIssuer: "https://other-identity.example.test" },
    { ...CONTEXT, subject: "other@example.test" },
    { ...CONTEXT, hostId: OTHER_HOST },
    { ...CONTEXT, deviceKeyId: OTHER_DEVICE },
  ]) {
    const store = fixture.store({ context });
    assert.deepEqual(await store.inspectPresence(), { state: "absent" });
    assert.equal(await store.read(), null);
  }
  assert.equal((await slotFiles(fixture)).length, 1);
}));

test("pin changes reuse the logical slot but cannot adopt or replace its key", async () => withFixture(async fixture => {
  const original = fixture.store();
  await original.create(keyRequest);
  const bytes = await readFile(path.join(storeDirectory(fixture), (await slotFiles(fixture))[0]));
  for (const context of [
    { ...CONTEXT, serverSpkiSha256: "c".repeat(64) },
    { ...CONTEXT, issuerSpkiSha256: "d".repeat(64) },
  ]) {
    const rotated = fixture.store({ context });
    await assert.rejects(rotated.read(), storeError("CORRUPT"));
    await assert.rejects(rotated.create(keyRequest), storeError("ALREADY_EXISTS"));
  }
  assert.equal((await slotFiles(fixture)).length, 1);
  assert.deepEqual(await readFile(path.join(storeDirectory(fixture), (await slotFiles(fixture))[0])), bytes);
}));

test("ciphertext copied into another logical slot is rejected", async () => withFixture(async fixture => {
  const first = fixture.store();
  const otherContext = { ...CONTEXT, subject: "other@example.test" };
  const other = fixture.store({ context: otherContext });
  await first.create(keyRequest);
  const firstName = (await slotFiles(fixture))[0];
  await other.create(keyRequest);
  const otherName = (await slotFiles(fixture)).find(name => name !== firstName);
  assert.ok(otherName);
  const firstPath = path.join(storeDirectory(fixture), firstName);
  const otherPath = path.join(storeDirectory(fixture), otherName);
  await writeFile(otherPath, await readFile(firstPath));
  await assert.rejects(other.read(), storeError("CORRUPT"));
  assert.deepEqual(await first.read(), keyRequest);
}));

test("rejects malformed, oversized, nonregular, linked, and hardlinked slot files", async () => withFixture(async fixture => {
  const store = fixture.store();
  const cases = [
    ["malformed", async slot => writeFile(slot, "not-json", "utf8")],
    ["oversized", async slot => writeFile(slot, Buffer.alloc(96 * 1024 + 1, 0x61))],
    ["directory", async slot => { await rm(slot); await mkdir(slot); }],
    ["symlink", async slot => {
      await rm(slot);
      const target = path.join(fixture.root, "owned-link-target.txt");
      await writeFile(target, "not a capsule", "utf8");
      symlinkSync(target, slot, "file");
    }],
    ["hardlink", async slot => link(slot, `${slot}.owned-alias`)],
  ];
  for (const [name, corrupt] of cases) {
    await store.create(keyRequest);
    const slot = path.join(storeDirectory(fixture), (await slotFiles(fixture))[0]);
    await corrupt(slot);
    await assert.rejects(store.read(), storeError("CORRUPT"), name);
    await removeOwnedEntry(fixture, name === "hardlink" ? `${slot}.owned-alias` : slot);
  }
}));

test("reports a directory occupying the slot as present and refuses to create over it", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const slot = path.join(storeDirectory(fixture), (await slotFiles(fixture))[0]);
  await rm(slot);
  await mkdir(slot);
  assert.deepEqual(await store.inspectPresence(), { state: "present" });
  await assert.rejects(store.create(keyRequest), storeError("ALREADY_EXISTS"));
}));

test("denies a user-data root junction and a store-directory junction", async () => withFixture(async fixture => {
  const rootTarget = path.join(fixture.root, "root-target");
  const rootLink = path.join(fixture.root, "root-junction");
  await mkdir(rootTarget);
  symlinkSync(rootTarget, rootLink, "junction");
  const rootStore = fixture.store({ userDataDirectory: rootLink });
  await assert.rejects(rootStore.inspectPresence(), storeError("FAILED"));
  assert.deepEqual(await readdir(rootTarget), []);

  const nativeDirectory = path.join(fixture.userDataDirectory, "native-connectivity");
  const target = path.join(fixture.root, "store-target");
  await mkdir(nativeDirectory);
  await mkdir(target);
  symlinkSync(target, path.join(nativeDirectory, "member-pending"), "junction");
  const storeLink = fixture.store();
  await assert.rejects(storeLink.inspectPresence(), storeError("FAILED"));
  await assert.rejects(storeLink.create(keyRequest), storeError("FAILED"));
  assert.deepEqual(await readdir(target), []);
}));

test("rejects any overlap between the user-data storage and Vault roots", async () => withFixture(async fixture => {
  for (const vaultDirectory of [
    fixture.userDataDirectory,
    path.join(fixture.userDataDirectory, "native-connectivity"),
    path.join(fixture.userDataDirectory, "native-connectivity", "member-pending", "vault-child"),
  ]) {
    const store = fixture.store({ vaultDirectory });
    await assert.rejects(store.create(keyRequest), storeError("OPTIONS"));
  }
  assert.deepEqual(await readdir(fixture.userDataDirectory), []);
}));

test("synchronous throws and asynchronous before-commit guards leave no key slot", async () => withFixture(async fixture => {
  const store = fixture.store();
  await assert.rejects(store.create(keyRequest, { beforeCommit() { throw new Error("deny"); } }), storeError("FAILED"));
  const forged = Object.assign(new Error("SECRET_FORGED_CALLBACK_MESSAGE", {
    cause: new Error("SECRET_FORGED_CALLBACK_CAUSE"),
  }), { code: "ERR_SPS_NATIVE_MEMBER_PENDING_STORE_ALREADY_EXISTS" });
  await assert.rejects(store.create(keyRequest, { beforeCommit() { throw forged; } }), storeError("FAILED"));

  let codeGetterCalls = 0;
  const codeGetterError = new Error("SECRET_CODE_GETTER_MESSAGE");
  Object.defineProperty(codeGetterError, "code", {
    get() { codeGetterCalls++; throw new Error("SECRET_CODE_GETTER_THROW"); },
  });
  await assert.rejects(store.create(keyRequest, { beforeCommit() { throw codeGetterError; } }), storeError("FAILED"));
  assert.equal(codeGetterCalls, 0);

  await assert.rejects(store.create(keyRequest, { beforeCommit: () => Promise.resolve() }), storeError("OPTIONS"));
  assert.deepEqual(await store.inspectPresence(), { state: "absent" });
  assert.equal((await readdir(storeDirectory(fixture))).some(name => name.endsWith(".json")), false);
}));

test("rejects a malformed key request before creating native storage directories", async () => withFixture(async fixture => {
  const store = fixture.store();
  await assert.rejects(store.create({ ...keyRequest, hostId: OTHER_HOST }), storeError("FAILED"));
  await assert.rejects(lstat(path.join(fixture.userDataDirectory, "native-connectivity")), { code: "ENOENT" });
  assert.deepEqual(await readdir(fixture.vaultDirectory), []);
}));

test("rechecks root and store-directory identities before committing", async () => withFixture(async fixture => {
  const rootStore = fixture.store();
  await assert.rejects(rootStore.create(keyRequest, {
    beforeCommit() {
      renameSync(fixture.userDataDirectory, path.join(fixture.root, "user-data-replaced"));
      mkdirSync(fixture.userDataDirectory);
    },
  }), storeError("FAILED"));
  assert.deepEqual(await readdir(fixture.userDataDirectory), []);

  const folderFixture = await makeFixture();
  try {
    const folderStore = folderFixture.store();
    await assert.rejects(folderStore.create(keyRequest, {
      beforeCommit() {
        const folder = storeDirectory(folderFixture);
        renameSync(folder, path.join(folderFixture.root, "member-pending-replaced"));
        mkdirSync(folder);
      },
    }), storeError("FAILED"));
    assert.equal((await readdir(storeDirectory(folderFixture))).some(name => name.endsWith(".json")), false);
  } finally { await folderFixture.cleanup(); }
}));

test("uses static store option errors and the capsule's static platform and encryption errors", async () => withFixture(async fixture => {
  assert.throws(() => fixture.store({ context: { ...CONTEXT, subject: " invalid" } }), storeError("OPTIONS"));
  assert.throws(() => fixture.store({ platform: "linux" }), capsuleError("UNSUPPORTED_PLATFORM"));
  assert.throws(() => fixture.store({ safeStorage: { isEncryptionAvailable: () => false, encryptString() {}, decryptString() {} } }),
    capsuleError("ENCRYPTION_UNAVAILABLE"));
}));

test.before(async () => {
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
});
