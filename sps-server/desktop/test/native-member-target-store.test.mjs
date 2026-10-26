import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { lstat, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import { createSpsNativeHostIdentity, inspectSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest } from "../src/native-member-certificates.mjs";
import {
  createSpsNativeMemberHostTargetReader,
  createSpsNativeMemberPendingKeyStore,
  createSpsNativeMemberPublicationRecovery,
} from "../src/native-member-pending-store.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const OTHER_HOST = "22222222-2222-4222-8222-222222222222";
const PREFIX = "sps-native-member-target-store-test-";
const ORIGIN = "https://127.0.0.1:43100";
const NOW = Math.floor(Date.now() / 1000) * 1000;
let hostIdentity, otherHostIdentity, keyRequest, context, target;

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

function scopeFor(value = context) {
  return Object.freeze({ identityIssuer: value.identityIssuer, subject: value.subject,
    hostId: value.hostId, deviceKeyId: value.deviceKeyId });
}

function scopeSlot(value = context) {
  return createHash("sha256").update(JSON.stringify({ identityIssuer: value.identityIssuer, subject: value.subject,
    hostId: value.hostId, deviceKeyId: value.deviceKeyId })).digest("hex");
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
  assert.equal(samePath(path.dirname(root), await realpath(os.tmpdir())), true);

  const userDataDirectory = path.join(root, "user-data");
  const vaultDirectory = path.join(root, "vault");
  await mkdir(userDataDirectory);
  await mkdir(vaultDirectory);
  assert.equal(samePath(await realpath(userDataDirectory), userDataDirectory), true);
  assert.equal(samePath(await realpath(vaultDirectory), vaultDirectory), true);
  const safeStorage = makeSafeStorage();

  async function cleanup() {
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
          assert.equal(inside(root, await realpath(item)), true);
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
    assert.equal(samePath(await realpath(root), root), true);
    assert.equal(finalRoot.isDirectory() && !finalRoot.isSymbolicLink(), true);
    assert.equal(finalRoot.dev, rootIdentity.dev);
    assert.equal(finalRoot.ino, rootIdentity.ino);
    await rm(root, { recursive: true, force: false });
    await assert.rejects(lstat(root), { code: "ENOENT" });
  }

  return {
    root,
    userDataDirectory,
    vaultDirectory,
    safeStorage,
    store(overrides = {}) {
      return createSpsNativeMemberPendingKeyStore({ userDataDirectory, vaultDirectory, context,
        safeStorage, platform: "win32", ...overrides });
    },
    reader(overrides = {}) {
      return createSpsNativeMemberHostTargetReader({ userDataDirectory, vaultDirectory, scope: scopeFor(),
        safeStorage, platform: "win32", ...overrides });
    },
    publicationRecovery(overrides = {}) {
      return createSpsNativeMemberPublicationRecovery({ userDataDirectory, vaultDirectory, scope: scopeFor(),
        safeStorage, platform: "win32", ...overrides });
    },
    async cleanup() { await cleanup(); },
  };
}

async function withFixture(run) {
  const fixture = await makeFixture();
  try { await run(fixture); } finally { await fixture.cleanup(); }
}

function storeError(name) {
  return error => {
    assert.equal(error.code, `ERR_SPS_NATIVE_MEMBER_PENDING_STORE_${name}`);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  };
}

function storeDirectory(fixture) {
  return path.join(fixture.userDataDirectory, "native-connectivity", "member-pending");
}

function pendingPath(fixture, value = context) {
  return path.join(storeDirectory(fixture), `${scopeSlot(value)}.json`);
}

function targetPath(fixture, value = context) {
  return path.join(storeDirectory(fixture), `${scopeSlot(value)}.target.json`);
}

test("target reads return null without creating storage, and target creation never creates a pending key", async () => withFixture(async fixture => {
  const store = fixture.store();
  assert.equal(await store.readTarget(), null);
  assert.equal(await fixture.reader().read(), null);
  assert.deepEqual(await readdir(fixture.userDataDirectory), []);
  assert.deepEqual(await readdir(fixture.vaultDirectory), []);

  await assert.rejects(store.createTarget(target));
  await assert.rejects(lstat(pendingPath(fixture)), { code: "ENOENT" });
  await assert.rejects(lstat(targetPath(fixture)), { code: "ENOENT" });
}));

test("creates the separate same-scope target slot and cold-restarts from its four-field reader", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  assert.deepEqual(await store.createTarget(target), target);
  assert.deepEqual(await store.readTarget(), target);

  const pending = pendingPath(fixture), savedTarget = targetPath(fixture);
  assert.equal(path.basename(savedTarget), `${path.basename(pending, ".json")}.target.json`);
  assert.deepEqual((await readdir(storeDirectory(fixture))).sort(),
    [path.basename(pending), path.basename(savedTarget)].sort());

  await rm(pending);
  const restartedReader = fixture.reader();
  const recovered = await restartedReader.read();
  assert.deepEqual(recovered, target);
  assert.deepEqual(Object.keys(recovered).sort(), ["context", "kind", "origin", "serverCertificatePem", "v"]);
  assert.equal(Object.hasOwn(recovered, "keyRequest"), false);
  assert.equal(Object.hasOwn(recovered, "privateKeyPem"), false);
  await assert.rejects(fixture.store().readTarget());
}));

test("stores Host target metadata only as encrypted safeStorage ciphertext", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);

  const savedTarget = targetPath(fixture);
  const serialized = await readFile(savedTarget, "utf8");
  assert.doesNotMatch(serialized,
    /member@example\.test|identity\.example\.test|https:\/\/127\.0\.0\.1:43100|BEGIN CERTIFICATE|11111111-1111-4111-8111-111111111111/);
  assert.equal(serialized.includes(keyRequest.privateKeyPem), false);

  const envelope = JSON.parse(serialized);
  assert.equal(typeof envelope.ciphertext, "string");
  const plaintext = fixture.safeStorage.decryptString(Buffer.from(envelope.ciphertext, "base64"));
  const inner = JSON.parse(plaintext);
  assert.deepEqual(inner.target, target);
  assert.equal(plaintext.includes(target.origin), true);
  assert.equal(plaintext.includes(context.subject), true);
  assert.equal(Object.hasOwn(inner, "keyRequest"), false);
  assert.equal(Object.hasOwn(inner.target, "privateKeyPem"), false);
  assert.equal(plaintext.includes(keyRequest.privateKeyPem), false);
  assert.equal(plaintext.includes(keyRequest.requestPem), false);
  assert.deepEqual(await readdir(fixture.vaultDirectory), []);
}));

test("requires exact trusted pins while the cold reader scopes lookup to account, Host, and device", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);

  await assert.rejects(store.createTarget({ ...target, context: { ...context, subject: "other@example.test" } }));
  const changedPins = fixture.store({ context: { ...context, serverSpkiSha256: "c".repeat(64) } });
  await assert.rejects(changedPins.readTarget(), storeError("CORRUPT"));

  const cold = await fixture.reader().read();
  assert.equal(cold.context.serverSpkiSha256, context.serverSpkiSha256);
  assert.equal(cold.context.issuerSpkiSha256, context.issuerSpkiSha256);
  for (const foreignScope of [
    { ...scopeFor(), identityIssuer: "https://other-identity.example.test" },
    { ...scopeFor(), subject: "other@example.test" },
    { ...scopeFor(), hostId: OTHER_HOST },
    { ...scopeFor(), deviceKeyId: "44444444-4444-4444-8444-444444444444" },
  ]) {
    assert.equal(await fixture.reader({ scope: foreignScope }).read(), null);
  }

  const foreignAccount = { ...scopeFor(), subject: "other@example.test" };
  const foreignSlot = targetPath(fixture, foreignAccount);
  await writeFile(foreignSlot, await readFile(targetPath(fixture)));
  await assert.rejects(fixture.reader({ scope: foreignAccount }).read());

  const wrongHostCertificate = { ...target, serverCertificatePem: otherHostIdentity.server.certificatePem };
  await assert.rejects(store.createTarget(wrongHostCertificate));
}));

test("createTarget is create-only and preserves the original encrypted bytes", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);
  const savedTarget = targetPath(fixture);
  const before = await readFile(savedTarget);

  await assert.rejects(store.createTarget({ ...target, origin: "https://127.0.0.1:43101" }), storeError("ALREADY_EXISTS"));
  assert.deepEqual(await readFile(savedTarget), before);
  assert.deepEqual(await store.readTarget(), target);
}));

test("synchronous beforeCommit aborts target creation without replacing existing bytes", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const pendingBefore = await readFile(pendingPath(fixture));
  await assert.rejects(store.createTarget(target, { beforeCommit() { throw new Error("declined"); } }));
  await assert.rejects(lstat(targetPath(fixture)), { code: "ENOENT" });
  assert.deepEqual(await readFile(pendingPath(fixture)), pendingBefore);

  await store.createTarget(target);
  const savedTarget = targetPath(fixture);
  const targetBefore = await readFile(savedTarget);
  await assert.rejects(store.createTarget(target, { beforeCommit: () => Promise.resolve() }));
  await assert.rejects(store.createTarget(target, { beforeCommit() { throw new Error("declined"); } }));
  assert.deepEqual(await readFile(savedTarget), targetBefore);
}));

test("readTarget and the cold reader reject a server certificate after it expires", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);
  const expiration = Date.parse(new X509Certificate(target.serverCertificatePem).validTo);
  assert.ok(expiration > Date.now());

  const actualNow = Date.now;
  Date.now = () => expiration + 1;
  try {
    await assert.rejects(store.readTarget(), storeError("CORRUPT"));
    await assert.rejects(fixture.reader().read());
  } finally {
    Date.now = actualNow;
  }
}));

test("readTarget rechecks the original pending key instead of returning detached target metadata", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);

  await writeFile(pendingPath(fixture), "tampered pending capsule", "utf8");
  await assert.rejects(store.readTarget(), storeError("CORRUPT"));
}));

test("tampered target ciphertext is denied by both full-context and cold readers", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);

  const savedTarget = targetPath(fixture);
  const envelope = JSON.parse(await readFile(savedTarget, "utf8"));
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  assert.ok(ciphertext.length > 0);
  ciphertext[ciphertext.length - 1] ^= 1;
  envelope.ciphertext = ciphertext.toString("base64");
  await writeFile(savedTarget, JSON.stringify(envelope), "utf8");

  await assert.rejects(store.readTarget());
  await assert.rejects(fixture.reader().read());
}));

test("target readers reject symlinked and hardlinked target slots", async t => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);
  const savedTarget = targetPath(fixture);
  const external = path.join(fixture.root, "owned-target-copy.json");
  await writeFile(external, await readFile(savedTarget));
  await rm(savedTarget);

  let symlinkCreated = false;
  try {
    symlinkSync(external, savedTarget, "file");
    symlinkCreated = true;
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
    t.diagnostic(`Symlink check unavailable on this host (${error.code}); hardlink check still runs.`);
  }
  if (symlinkCreated) {
    await assert.rejects(store.readTarget());
    await assert.rejects(fixture.reader().read());
    await rm(savedTarget);
  }

  await store.createTarget(target);
  const alias = `${savedTarget}.owned-alias`;
  await link(savedTarget, alias);
  await assert.rejects(store.readTarget());
  await assert.rejects(fixture.reader().read());
  await rm(alias);
}));

test("interrupted target publication fails closed without deleting a same-inode temporary alias", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);
  const final = targetPath(fixture);
  const before = await readFile(final);
  const alias = path.join(storeDirectory(fixture), `.pending-${randomUUID()}.tmp`);
  // Reproduce the link-before-unlink filesystem state, not a hardware crash.
  await link(final, alias);
  assert.equal((await lstat(final)).nlink, 2);
  await assert.rejects(fixture.reader().read(), storeError("CORRUPT"));
  await assert.rejects(fixture.store().readTarget(), storeError("CORRUPT"));
  await assert.rejects(fixture.store().createTarget(target), storeError("ALREADY_EXISTS"));
  assert.deepEqual(await readFile(final), before);
  assert.deepEqual(await readFile(alias), before);
  assert.equal((await lstat(final)).nlink, 2);
}));

test("explicit target recovery authenticates both protected records and preserves the read-only cold-reader boundary", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);
  const final = targetPath(fixture);
  const alias = path.join(storeDirectory(fixture), `.pending-${randomUUID()}.tmp`);
  await link(final, alias);
  await assert.rejects(fixture.reader().read(), storeError("CORRUPT"));
  assert.equal(await store.recoverInterruptedPublication("target", { beforeCommit() {} }), true);
  assert.equal((await lstat(final)).nlink, 1);
  assert.deepEqual(await store.readTarget(), target);
  assert.deepEqual(await fixture.reader().read(), target);
}));

test("indexed-scope restart recovery repairs linked target metadata, then exposes it through the ordinary cold reader", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  await store.createTarget(target);
  const final = targetPath(fixture);
  const alias = path.join(storeDirectory(fixture), `.pending-${randomUUID()}.tmp`);
  await link(final, alias);
  await assert.rejects(fixture.reader().read(), storeError("CORRUPT"));
  const recovery = fixture.publicationRecovery();
  await assert.rejects(recovery.recoverInterruptedPublications({ beforeCommit() { throw new Error("account changed"); } }),
    storeError("FAILED"));
  assert.equal((await lstat(final)).nlink, 2);
  assert.equal((await lstat(alias)).nlink, 2);
  assert.deepEqual(await recovery.recoverInterruptedPublications({ beforeCommit() {} }), { recovered: ["target"] });
  assert.equal((await lstat(final)).nlink, 1);
  assert.deepEqual(await fixture.reader().read(), target);
  assert.deepEqual(await store.readTarget(), target);
}));

test("indexed-scope restart recovery derives context from the pending capsule when target metadata is absent", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const final = pendingPath(fixture);
  const alias = path.join(storeDirectory(fixture), `.pending-${randomUUID()}.tmp`);
  await link(final, alias);
  const recovery = fixture.publicationRecovery();
  assert.deepEqual(await recovery.recoverInterruptedPublications({ beforeCommit() {} }), { recovered: ["pending"] });
  assert.equal((await lstat(final)).nlink, 1);
  assert.deepEqual(await store.read(), keyRequest);
  assert.equal(await store.readTarget(), null);
}));

test.before(async () => {
  const identityOptions = {
    hostnames: ["127.0.0.1"],
    notBefore: NOW - 60_000,
    notAfter: NOW + 90 * 86_400_000,
    issuerNotAfter: NOW + 365 * 86_400_000,
  };
  hostIdentity = await createSpsNativeHostIdentity({ ...identityOptions, hostId: HOST });
  otherHostIdentity = await createSpsNativeHostIdentity({ ...identityOptions, hostId: OTHER_HOST });
  const details = inspectSpsNativeHostIdentity(hostIdentity);
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  context = Object.freeze({
    identityIssuer: "https://identity.example.test",
    subject: "member@example.test",
    hostId: HOST,
    deviceKeyId: DEVICE,
    serverSpkiSha256: details.serverSpkiSha256,
    issuerSpkiSha256: details.memberIssuerSpkiSha256,
  });
  target = Object.freeze({
    v: 1,
    kind: "sps.native.member-host-target",
    context,
    origin: ORIGIN,
    serverCertificatePem: hostIdentity.server.certificatePem,
  });
});
