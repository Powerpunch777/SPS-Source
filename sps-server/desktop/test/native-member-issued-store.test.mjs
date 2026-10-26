import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { lstat, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import "reflect-metadata";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import {
  createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate, publicSpsNativeMemberEnrollmentRequest,
} from "../src/native-member-certificates.mjs";
import { createSpsNativeMemberPendingKeyStore, createSpsNativeMemberPublicationRecovery } from "../src/native-member-pending-store.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const OTHER_HOST = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const PREFIX = "sps-native-member-issued-store-test-";
const PAIRING_SECRET = "pairing-secret-that-must-not-be-stored";
const NOW = Math.floor(Date.now() / 1000) * 1000;
const STORE_MESSAGES = Object.freeze({
  OPTIONS: "Native Member pending storage options are invalid.",
  FAILED: "Native Member pending storage is unavailable.",
  CORRUPT: "Native Member pending storage is invalid or does not match the expected context.",
  ALREADY_EXISTS: "A Native Member pending key already exists for this account and device.",
});
let host, otherHost, keyRequest, context;

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

  async function cleanup() {
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
    assert.equal(await realpath(root), root);
    assert.equal(finalRoot.isDirectory() && !finalRoot.isSymbolicLink(), true);
    assert.equal(finalRoot.dev, rootIdentity.dev);
    assert.equal(finalRoot.ino, rootIdentity.ino);
    await rm(root, { recursive: true, force: false });
    await assert.rejects(lstat(root), { code: "ENOENT" });
  }

  return {
    root, userDataDirectory, vaultDirectory, safeStorage,
    store(overrides = {}) {
      return createSpsNativeMemberPendingKeyStore({
        userDataDirectory, vaultDirectory, context, safeStorage, platform: "win32", ...overrides,
      });
    },
    publicationRecovery(overrides = {}) {
      const scope = { identityIssuer: context.identityIssuer, subject: context.subject,
        hostId: context.hostId, deviceKeyId: context.deviceKeyId };
      return createSpsNativeMemberPublicationRecovery({ userDataDirectory, vaultDirectory, scope,
        safeStorage, platform: "win32", ...overrides });
    },
    cleanup,
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
    assert.doesNotMatch(error.message, /PRIVATE KEY|pairing-secret|customer|access_token|[A-Za-z]:\\/);
    return true;
  };
}

function unavailableOrCorruptError(error) {
  assert.ok(["CORRUPT", "FAILED"].some(name => error?.code === `ERR_SPS_NATIVE_MEMBER_PENDING_STORE_${name}`));
  assert.equal(Object.hasOwn(error, "cause"), false);
  return true;
}

function storeDirectory(fixture) {
  return path.join(fixture.userDataDirectory, "native-connectivity", "member-pending");
}

async function pendingFiles(fixture) {
  return (await readdir(storeDirectory(fixture))).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
}

async function issuedFiles(fixture) {
  return (await readdir(storeDirectory(fixture))).filter(name => /^[a-f0-9]{64}\.issued\.json$/.test(name));
}

async function pendingPath(fixture) {
  const files = await pendingFiles(fixture);
  assert.equal(files.length, 1);
  return path.join(storeDirectory(fixture), files[0]);
}

async function issuedPath(fixture) {
  const files = await issuedFiles(fixture);
  assert.equal(files.length, 1);
  return path.join(storeDirectory(fixture), files[0]);
}

async function fileIdentity(file) {
  const value = await lstat(file, { bigint: true });
  return { dev: value.dev, ino: value.ino, nlink: value.nlink, size: value.size };
}

async function directoryIdentity(directory) {
  const value = await lstat(directory, { bigint: true });
  assert.equal(value.isDirectory(), true);
  assert.equal(value.isSymbolicLink(), false);
  return { dev: value.dev, ino: value.ino };
}

function spkiSha256(certificatePem) {
  const certificate = new X509Certificate(certificatePem);
  return createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest("hex");
}

async function makeIssuance({ hostIdentity = host, requestKey = keyRequest, expiresAt = new Date(Date.now() + 60_000).toISOString() } = {}) {
  const request = await publicSpsNativeMemberEnrollmentRequest(requestKey);
  const certificate = await issueSpsNativeMemberCertificate({
    hostIdentity,
    request,
    notBefore: NOW - 60_000,
    notAfter: NOW + 60 * 60_000,
    now: NOW,
  });
  return Object.freeze({
    enrollmentId: randomUUID(),
    certificate: new X509Certificate(certificate.certificatePem).raw.toString("base64url"),
    issuerCertificate: new X509Certificate(certificate.issuerCertificatePem).raw.toString("base64url"),
    expiresAt,
  });
}

function assertFrozenResult(value, expectedIssuance) {
  assert.deepEqual(Object.keys(value).sort(), ["credential", "issuance"]);
  assert.equal(Object.isFrozen(value), true);
  assert.deepEqual(value.issuance, expectedIssuance);
  assert.equal(Object.isFrozen(value.issuance), true);
  assert.equal(Object.isFrozen(value.credential), true);
  assert.deepEqual(Object.keys(value.credential), [
    "v", "kind", "hostId", "deviceKeyId", "certificatePem", "privateKeyPem", "issuerCertificatePem",
  ]);
  assert.equal(value.credential.hostId, HOST);
  assert.equal(value.credential.deviceKeyId, DEVICE);
  assert.equal(value.credential.privateKeyPem, keyRequest.privateKeyPem);
  assert.equal(Buffer.from(new X509Certificate(value.credential.certificatePem).raw).toString("base64url"), expectedIssuance.certificate);
  assert.equal(Buffer.from(new X509Certificate(value.credential.issuerCertificatePem).raw).toString("base64url"), expectedIssuance.issuerCertificate);
}

async function saveIssued(fixture, store, issuance) {
  await store.create(keyRequest);
  const keyFile = await pendingPath(fixture);
  const folder = storeDirectory(fixture);
  const beforeBytes = await readFile(keyFile);
  const beforeIdentity = await fileIdentity(keyFile);
  const beforeDirectory = await directoryIdentity(folder);
  const result = await store.createIssued(issuance);
  assertFrozenResult(result, issuance);
  assert.deepEqual(await readFile(keyFile), beforeBytes);
  assert.deepEqual(await fileIdentity(keyFile), beforeIdentity);
  assert.deepEqual(await directoryIdentity(folder), beforeDirectory);
  return result;
}

before(async () => {
  const identityOptions = {
    hostnames: ["127.0.0.1"],
    notBefore: NOW - 60_000,
    notAfter: NOW + 90 * 86_400_000,
    issuerNotAfter: NOW + 365 * 86_400_000,
  };
  host = await createSpsNativeHostIdentity({ ...identityOptions, hostId: HOST });
  otherHost = await createSpsNativeHostIdentity({ ...identityOptions, hostId: OTHER_HOST });
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  context = Object.freeze({
    identityIssuer: "https://identity.example.test",
    subject: "member@example.test",
    hostId: HOST,
    deviceKeyId: DEVICE,
    serverSpkiSha256: spkiSha256(host.server.certificatePem),
    issuerSpkiSha256: spkiSha256(host.memberIssuer.certificatePem),
  });
});

test("stores issued public certificates beside the pending key and rereads after store recreation, even after invitation expiry", async () => withFixture(async fixture => {
  const store = fixture.store();
  const issuance = await makeIssuance({ expiresAt: new Date(NOW - 1_000).toISOString() });
  const result = await saveIssued(fixture, store, issuance);
  assert.ok(Date.parse(issuance.expiresAt) <= Date.now());
  assert.ok(Date.parse(new X509Certificate(result.credential.certificatePem).validTo) > Date.now());
  assert.equal((await issuedFiles(fixture)).length, 1);

  const keyFile = await pendingPath(fixture);
  const issuedFile = await issuedPath(fixture);
  assert.equal(inside(fixture.userDataDirectory, issuedFile), true);
  assert.equal(inside(fixture.vaultDirectory, issuedFile), false);
  assert.deepEqual(await readdir(fixture.vaultDirectory), []);
  assert.doesNotMatch(await readFile(issuedFile, "utf8"), /PRIVATE KEY|BEGIN CERTIFICATE REQUEST|pairing-secret-that-must-not-be-stored/);

  const envelope = JSON.parse(await readFile(issuedFile, "utf8"));
  assert.equal(typeof envelope.ciphertext, "string");
  const plaintext = fixture.safeStorage.decryptString(Buffer.from(envelope.ciphertext, "base64"));
  assert.doesNotMatch(plaintext, /PRIVATE KEY|BEGIN CERTIFICATE REQUEST|pairing-secret-that-must-not-be-stored/);
  assert.equal(plaintext.includes(keyRequest.privateKeyPem), false);
  assert.equal(plaintext.includes(keyRequest.requestPem), false);
  assert.equal(plaintext.includes(PAIRING_SECRET), false);

  const restarted = fixture.store();
  const keyIdentityBeforeRead = await fileIdentity(keyFile);
  const directoryBeforeRead = await directoryIdentity(storeDirectory(fixture));
  const reread = await restarted.readIssued();
  assertFrozenResult(reread, issuance);
  assert.deepEqual(reread, result);
  assert.deepEqual(await fileIdentity(keyFile), keyIdentityBeforeRead);
  assert.deepEqual(await directoryIdentity(storeDirectory(fixture)), directoryBeforeRead);
  assert.deepEqual(await readFile(keyFile), await readFile(await pendingPath(fixture)));
}));

test("returns null for an absent issued slot and rejects issuance without a pending key", async () => withFixture(async fixture => {
  const store = fixture.store();
  assert.equal(await store.readIssued(), null);
  await assert.rejects(store.createIssued(await makeIssuance()), unavailableOrCorruptError);
  assert.deepEqual(await readdir(fixture.userDataDirectory), []);
  assert.deepEqual(await readdir(fixture.vaultDirectory), []);
}));

test("explicit issued recovery requires its matching live pending key and removes only the verified alias", async () => withFixture(async fixture => {
  const store = fixture.store();
  const issuance = await makeIssuance();
  await saveIssued(fixture, store, issuance);
  const final = await issuedPath(fixture);
  const alias = path.join(storeDirectory(fixture), `.pending-${randomUUID()}.tmp`);
  const original = await readFile(final);
  await link(final, alias);
  assert.equal(await store.recoverInterruptedPublication("issued", { beforeCommit() {} }), true);
  assert.equal((await lstat(final)).nlink, 1);
  await assert.rejects(lstat(alias), { code: "ENOENT" });
  assert.deepEqual(await readFile(final), original);
  assertFrozenResult(await store.readIssued(), issuance);
}));

test("cold indexed-scope recovery derives pins from the protected pending record before repairing an issued slot", async () => withFixture(async fixture => {
  const store = fixture.store();
  const issuance = await makeIssuance();
  await saveIssued(fixture, store, issuance);
  const final = await issuedPath(fixture);
  const alias = path.join(storeDirectory(fixture), `.pending-${randomUUID()}.tmp`);
  await link(final, alias);
  const recovery = fixture.publicationRecovery();
  assert.deepEqual(await recovery.recoverInterruptedPublications({ beforeCommit() {} }), { recovered: ["issued"] });
  assert.equal((await lstat(final)).nlink, 1);
  assertFrozenResult(await store.readIssued(), issuance);
}));

test("an orphan issued copy is corrupt without its pending key; other logical slots are absent and pin changes reject", async () => withFixture(async fixture => {
  const original = fixture.store();
  const issuance = await makeIssuance();
  await saveIssued(fixture, original, issuance);
  const originalIssuedFile = await issuedPath(fixture);
  const bytes = await readFile(originalIssuedFile);
  const otherUserData = path.join(fixture.root, "orphan-user-data");
  await mkdir(otherUserData);
  const orphanDirectory = path.join(otherUserData, "native-connectivity", "member-pending");
  await mkdir(orphanDirectory, { recursive: true });
  const slot = createHash("sha256").update(JSON.stringify({ identityIssuer: context.identityIssuer,
    subject: context.subject, hostId: context.hostId, deviceKeyId: context.deviceKeyId })).digest("hex");
  const orphanStore = fixture.store({ userDataDirectory: otherUserData });
  const orphanFile = path.join(orphanDirectory, `${slot}.issued.json`);
  await writeFile(orphanFile, bytes);
  await assert.rejects(orphanStore.readIssued(), storeError("CORRUPT"));

  const otherLogicalSlots = [
    { ...context, identityIssuer: "https://other-identity.example.test" },
    { ...context, subject: "other@example.test" },
    { ...context, hostId: OTHER_HOST },
    { ...context, deviceKeyId: "44444444-4444-4444-8444-444444444444" },
  ];
  for (const changedContext of otherLogicalSlots) {
    assert.equal(await fixture.store({ context: changedContext }).readIssued(), null);
  }

  const changedPins = [
    { ...context, serverSpkiSha256: "c".repeat(64) },
    { ...context, issuerSpkiSha256: "d".repeat(64) },
  ];
  for (const changedContext of changedPins) {
    await assert.rejects(fixture.store({ context: changedContext }).readIssued(), storeError("CORRUPT"));
  }
  assert.deepEqual(await readFile(originalIssuedFile), bytes);
}));

test("does not publish a certificate if the pending key file changes during preparation", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const keyFile = await pendingPath(fixture);
  const keyIdentity = await fileIdentity(keyFile);
  await assert.rejects(store.createIssued(await makeIssuance(), { beforeCommit() {
    writeFileSync(keyFile, "fixture-changed-pending-bytes", "utf8");
  } }), storeError("CORRUPT"));
  assert.deepEqual(await issuedFiles(fixture), []);
  assert.equal(await readFile(keyFile, "utf8"), "fixture-changed-pending-bytes");
  const after = await fileIdentity(keyFile);
  assert.equal(after.dev, keyIdentity.dev);
  assert.equal(after.ino, keyIdentity.ino);
  assert.equal(after.nlink, keyIdentity.nlink);
}));

test("a post-publication guard failure is reported without deleting committed files", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const keyFile = await pendingPath(fixture), bytes = await readFile(keyFile);
  let checks = 0;
  const issuance = await makeIssuance();
  await assert.rejects(store.createIssued(issuance, { beforeCommit() {
    if (++checks === 3) throw new Error("fixture lifecycle changed after publication");
  } }), storeError("FAILED"));
  assert.equal(checks, 3);
  assert.equal((await issuedFiles(fixture)).length, 1);
  assert.deepEqual(await readFile(keyFile), bytes);
  assertFrozenResult(await store.readIssued(), issuance);
}));

test("rejects an issuance for another Host and a leaf signed for another local key", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const pendingFile = await pendingPath(fixture);
  const pendingBytes = await readFile(pendingFile);
  const pendingIdentity = await fileIdentity(pendingFile);
  const foreignKey = await createSpsNativeMemberKeyRequest({ hostId: OTHER_HOST, deviceKeyId: DEVICE });
  await assert.rejects(store.createIssued(await makeIssuance({ hostIdentity: otherHost, requestKey: foreignKey })), unavailableOrCorruptError);
  assert.deepEqual(await issuedFiles(fixture), []);
  assert.deepEqual(await readFile(pendingFile), pendingBytes);
  assert.deepEqual(await fileIdentity(pendingFile), pendingIdentity);

  const sameScopeWrongKey = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  const otherUserData = path.join(fixture.root, "other-user-data");
  await mkdir(otherUserData);
  const wrongKeyStore = fixture.store({ userDataDirectory: otherUserData });
  await wrongKeyStore.create(sameScopeWrongKey);
  const wrongPending = path.join(fixture.root, "other-user-data", "native-connectivity", "member-pending",
    (await readdir(path.join(fixture.root, "other-user-data", "native-connectivity", "member-pending")))
      .find(name => /^[a-f0-9]{64}\.json$/.test(name)));
  const wrongPendingBytes = await readFile(wrongPending);
  await assert.rejects(wrongKeyStore.createIssued(await makeIssuance()), unavailableOrCorruptError);
  assert.deepEqual(await readFile(wrongPending), wrongPendingBytes);
}));

test("synchronous precommit denial leaves no issued slot; duplicates preserve both files and directory identity", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const keyFile = await pendingPath(fixture);
  const folder = storeDirectory(fixture);
  const keyBeforeGuard = await readFile(keyFile);
  const keyIdentityBeforeGuard = await fileIdentity(keyFile);
  const directoryBeforeGuard = await directoryIdentity(folder);
  await assert.rejects(store.createIssued(await makeIssuance(), {
    beforeCommit() { throw new Error("authorization denied"); },
  }), storeError("FAILED"));
  assert.deepEqual(await issuedFiles(fixture), []);
  assert.deepEqual(await readFile(keyFile), keyBeforeGuard);
  assert.deepEqual(await fileIdentity(keyFile), keyIdentityBeforeGuard);
  assert.deepEqual(await directoryIdentity(folder), directoryBeforeGuard);
  assert.deepEqual((await readdir(folder)).sort(), [(await pendingFiles(fixture))[0]]);

  await assert.rejects(store.createIssued(await makeIssuance(), { beforeCommit: () => Promise.resolve() }), storeError("OPTIONS"));
  assert.deepEqual(await issuedFiles(fixture), []);

  const issuance = await makeIssuance();
  await store.createIssued(issuance);
  const issuedFile = await issuedPath(fixture);
  const beforeDuplicate = {
    keyBytes: await readFile(keyFile), keyIdentity: await fileIdentity(keyFile),
    issuedBytes: await readFile(issuedFile), issuedIdentity: await fileIdentity(issuedFile),
    directoryIdentity: await directoryIdentity(folder),
  };
  await assert.rejects(store.createIssued(await makeIssuance()), storeError("ALREADY_EXISTS"));

  assert.deepEqual(await readFile(keyFile), beforeDuplicate.keyBytes);
  assert.deepEqual(await fileIdentity(keyFile), beforeDuplicate.keyIdentity);
  assert.deepEqual(await readFile(issuedFile), beforeDuplicate.issuedBytes);
  assert.deepEqual(await fileIdentity(issuedFile), beforeDuplicate.issuedIdentity);
  assert.deepEqual(await directoryIdentity(folder), beforeDuplicate.directoryIdentity);
}));

test("two independent stores race to one create-only issued winner", async () => withFixture(async fixture => {
  const first = fixture.store();
  const second = fixture.store();
  await first.create(keyRequest);
  const keyFile = await pendingPath(fixture);
  const pendingBytes = await readFile(keyFile);
  const pendingIdentity = await fileIdentity(keyFile);
  const folder = storeDirectory(fixture);
  const folderIdentity = await directoryIdentity(folder);
  const firstIssuance = await makeIssuance();
  const secondIssuance = await makeIssuance();
  const results = await Promise.allSettled([
    first.createIssued(firstIssuance),
    second.createIssued(secondIssuance),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  const rejected = results.find(result => result.status === "rejected");
  assert.equal(storeError("ALREADY_EXISTS")(rejected.reason), true);
  const winner = results[0].status === "fulfilled" ? firstIssuance : secondIssuance;
  assertFrozenResult(await first.readIssued(), winner);
  assert.equal((await issuedFiles(fixture)).length, 1);
  assert.deepEqual(await readFile(keyFile), pendingBytes);
  assert.deepEqual(await fileIdentity(keyFile), pendingIdentity);
  assert.deepEqual(await directoryIdentity(folder), folderIdentity);
}));

test("beforeCommit directory replacement cannot publish into a replacement store directory", async () => withFixture(async fixture => {
  const store = fixture.store();
  await store.create(keyRequest);
  const folder = storeDirectory(fixture);
  const originalIdentity = await directoryIdentity(folder);
  const pendingFile = await pendingPath(fixture);
  const pendingBytes = await readFile(pendingFile);
  let replaced = false;
  await assert.rejects(store.createIssued(await makeIssuance(), {
    beforeCommit() {
      if (replaced) return;
      renameSync(folder, `${folder}.replaced`);
      mkdirSync(folder);
      replaced = true;
    },
  }), storeError("FAILED"));
  assert.equal(replaced, true);
  assert.deepEqual(await issuedFiles(fixture), []);
  assert.deepEqual(await readdir(folder), []);
  assert.notDeepEqual(await directoryIdentity(folder), originalIdentity);

  // The store leaves its owned temp in the renamed directory rather than cleaning through a replaced path.
  const replacedFolder = `${folder}.replaced`;
  assert.deepEqual(await directoryIdentity(replacedFolder), originalIdentity);
  const oldFiles = await readdir(replacedFolder);
  const temporaryFiles = oldFiles.filter(name => /^\.pending-[0-9a-f-]+\.tmp$/.test(name));
  assert.equal(temporaryFiles.length, 1);
  assert.deepEqual(oldFiles.filter(name => /^[a-f0-9]{64}\.json$/.test(name)), [path.basename(pendingFile)]);
  const temporaryFile = path.join(replacedFolder, temporaryFiles[0]);
  const temporaryStat = await lstat(temporaryFile, { bigint: true });
  assert.equal(temporaryStat.isFile(), true);
  assert.equal(temporaryStat.isSymbolicLink(), false);
  assert.equal(temporaryStat.nlink, 1n);
  await assert.rejects(lstat(pendingFile), { code: "ENOENT" });
  assert.deepEqual(await readFile(path.join(replacedFolder, path.basename(pendingFile))), pendingBytes);

  const serialized = await readFile(temporaryFile, "utf8");
  const envelope = JSON.parse(serialized);
  assert.deepEqual(Object.keys(envelope).sort(), ["ciphertext", "kind", "v"]);
  assert.equal(envelope.v, 1);
  assert.equal(envelope.kind, "sps.native.member-issued-capsule");
  assert.equal(typeof envelope.ciphertext, "string");
  assert.doesNotMatch(serialized, /PRIVATE KEY|CERTIFICATE REQUEST|pairing-secret-that-must-not-be-stored/);
  assert.equal(serialized.includes(keyRequest.privateKeyPem), false);
  assert.equal(serialized.includes(keyRequest.requestPem), false);
  const plaintext = fixture.safeStorage.decryptString(Buffer.from(envelope.ciphertext, "base64"));
  assert.notEqual(serialized, plaintext);
  const issued = JSON.parse(plaintext);
  assert.deepEqual(Object.keys(issued).sort(), ["context", "issuance", "kind", "v"]);
  assert.equal(issued.kind, "sps.native.member-issued");
  assert.doesNotMatch(plaintext, /PRIVATE KEY|CERTIFICATE REQUEST|pairing-secret-that-must-not-be-stored/);
  assert.equal(plaintext.includes(keyRequest.privateKeyPem), false);
  assert.equal(plaintext.includes(keyRequest.requestPem), false);
  assert.equal(plaintext.includes(PAIRING_SECRET), false);
  assert.deepEqual(await readdir(fixture.vaultDirectory), []);
}));

test("rejects malformed or tampered issued capsules without changing the pending key", async () => {
  for (const mode of ["malformed", "tampered"]) await withFixture(async fixture => {
    const store = fixture.store();
    await saveIssued(fixture, store, await makeIssuance());
    const keyFile = await pendingPath(fixture);
    const keyBytes = await readFile(keyFile);
    const keyIdentity = await fileIdentity(keyFile);
    const folderIdentity = await directoryIdentity(storeDirectory(fixture));
    const issuedFile = await issuedPath(fixture);
    if (mode === "malformed") {
      await writeFile(issuedFile, "{not-json", "utf8");
    } else {
      const envelope = JSON.parse(await readFile(issuedFile, "utf8"));
      const bytes = Buffer.from(envelope.ciphertext, "base64");
      bytes[bytes.length - 1] ^= 1;
      envelope.ciphertext = bytes.toString("base64");
      await writeFile(issuedFile, JSON.stringify(envelope), "utf8");
    }
    await assert.rejects(store.readIssued(), storeError("CORRUPT"));
    assert.deepEqual(await readFile(keyFile), keyBytes);
    assert.deepEqual(await fileIdentity(keyFile), keyIdentity);
    assert.deepEqual(await directoryIdentity(storeDirectory(fixture)), folderIdentity);
  });
});

test("rejects issued symlinks, hardlinks, and directories without following or overwriting them", async t => {
  for (const mode of ["symlink", "hardlink", "directory"]) await withFixture(async fixture => {
    const store = fixture.store();
    await saveIssued(fixture, store, await makeIssuance());
    const issuedFile = await issuedPath(fixture);
    if (mode === "symlink") {
      await rm(issuedFile);
      const target = path.join(fixture.root, "owned-issued-link-target.txt");
      await writeFile(target, "not an issued capsule", "utf8");
      try { symlinkSync(target, issuedFile, "file"); }
      catch (error) {
        if (process.platform === "win32" && ["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
          t.diagnostic(`File symlink check unavailable on this host (${error.code}); hardlink and directory checks still run.`);
          return;
        }
        throw error;
      }
    } else if (mode === "hardlink") {
      await link(issuedFile, `${issuedFile}.owned-alias`);
    } else {
      await rm(issuedFile);
      await mkdir(issuedFile);
    }
    await assert.rejects(store.readIssued(), storeError("CORRUPT"));
    await assert.rejects(store.createIssued(await makeIssuance()), storeError("ALREADY_EXISTS"));
  });
});
