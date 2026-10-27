import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID, X509Certificate } from "node:crypto";
import { nativeCertificateRecord as record } from "./native-certificate-primitives.mjs";
import { createSpsNativeMemberPendingCapsule, validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";
import { createSpsNativeMemberIssuedCapsule } from "./native-member-issued-capsule.mjs";
import { createSpsNativeMemberRenewalCapsule, validateSpsNativeMemberRenewalResponse } from "./native-member-renewal-capsule.mjs";
import { createSpsNativeMemberTargetCapsule, validateSpsNativeMemberHostTarget,
  validateSpsNativeMemberServerCertificateResponse } from "./native-member-target-capsule.mjs";
import { validateSpsNativeServerCertificateTransition } from "./native-identity-certificates.mjs";
import { normalizeSpsNativeMemberKeyIndex } from "./native-member-key-index.mjs";
import { sameNativeMemberFileIdentity } from "./native-member-file-identity.mjs";

const MAX_BYTES = 96 * 1024;
const RENEWAL_FIELDS = ["renewalId", "deviceId", "predecessorCertificateSha256", "certificate", "issuerCertificate", "certificateNotBefore", "certificateNotAfter"];
const errors = Object.freeze({
  OPTIONS: "Native Member pending storage options are invalid.",
  FAILED: "Native Member pending storage is unavailable.",
  CORRUPT: "Native Member pending storage is invalid or does not match the expected context.",
  ALREADY_EXISTS: "A Native Member pending key already exists for this account and device.",
});
const internalFailures = new WeakMap();
const fail = name => {
  const error = Object.assign(new Error(errors[name]), { code: `ERR_SPS_NATIVE_MEMBER_PENDING_STORE_${name}` });
  internalFailures.set(error, name);
  return error;
};
const sameFile = (a, b) => a?.dev?.toString() === b?.dev?.toString() && a?.ino?.toString() === b?.ino?.toString();
const sameDirectory = (a, b) => sameFile(a, b) && a.birthtimeNs === b.birthtimeNs;
const isWithin = (root, child) => {
  const relative = path.relative(root, child);
  return !relative || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function directory(input, allowMissing = false) {
  const resolved = path.resolve(input), root = path.parse(resolved).root;
  let current = root, canonical = await fs.realpath(root);
  const parts = resolved.slice(root.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) {
      if (allowMissing && error?.code === "ENOENT") return path.join(canonical, ...parts.slice(index));
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail("FAILED");
    canonical = await fs.realpath(current);
  }
  return canonical;
}

async function childDirectory(parent, name, create) {
  const child = path.join(parent, name);
  let stat;
  try { stat = await fs.lstat(child); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!create) return null;
    try { await fs.mkdir(child, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") throw error; }
    stat = await fs.lstat(child);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(child) !== child) throw fail("FAILED");
  return child;
}

async function slotStat(file, rejectInvalid = true) {
  let stat;
  try { stat = await fs.lstat(file); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  if (rejectInvalid && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_BYTES)) throw fail("CORRUPT");
  return stat;
}

async function directoryIdentity(directory) {
  const stat = await fs.lstat(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || [stat.dev, stat.ino, stat.birthtimeNs].some(value => typeof value !== "bigint" || value <= 0n)) throw fail("FAILED");
  return stat;
}

async function syncDirectory(directory) {
  let handle;
  try { handle = await fs.open(directory, constants.O_RDONLY); await handle.sync(); }
  catch (error) { if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EACCES"].includes(error?.code)) throw error; }
  finally { await handle?.close(); }
}

async function boundedRead(file, expected) {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const start = await handle.stat();
    if (!start.isFile() || start.nlink !== 1 || start.size > MAX_BYTES || !sameFile(start, expected)
      || !sameFile(start, await slotStat(file))) throw fail("CORRUPT");
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const end = await handle.stat();
    if (length > MAX_BYTES || end.size !== start.size || end.nlink !== 1 || !sameFile(start, end)
      || !sameFile(end, await slotStat(file))) throw fail("CORRUPT");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
  } finally { await handle.close(); }
}

async function boundedReadExact(file, expected, expectedLinkCount = 2n) {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const start = await handle.stat({ bigint: true });
    const pathStart = await fs.lstat(file, { bigint: true });
    if (!start.isFile() || start.nlink !== expectedLinkCount || start.size > BigInt(MAX_BYTES)
      || !sameNativeMemberFileIdentity(start, expected) || !pathStart.isFile() || pathStart.isSymbolicLink()
      || pathStart.nlink !== expectedLinkCount || !sameNativeMemberFileIdentity(start, pathStart)) throw fail("CORRUPT");
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const end = await handle.stat({ bigint: true });
    const pathEnd = await fs.lstat(file, { bigint: true });
    if (length > MAX_BYTES || end.nlink !== expectedLinkCount || !sameNativeMemberFileIdentity(start, end)
      || !pathEnd.isFile() || pathEnd.isSymbolicLink() || pathEnd.nlink !== expectedLinkCount
      || !sameNativeMemberFileIdentity(end, pathEnd)) throw fail("CORRUPT");
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)); }
    catch { throw fail("CORRUPT"); }
  } finally { await handle.close(); }
}

const TEMPORARY_ALIAS = /^\.pending-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/;

async function findTemporaryAlias(folder, final, maxEntries = null) {
  if (final.nlink !== 2n) throw fail("CORRUPT");
  let allNames;
  if (maxEntries === null) allNames = await fs.readdir(folder);
  else {
    allNames = [];
    const handle = await fs.opendir(folder);
    for await (const entry of handle) {
      allNames.push(entry.name);
      if (allNames.length > maxEntries) throw fail("CORRUPT");
    }
  }
  const names = allNames.filter(name => TEMPORARY_ALIAS.test(name));
  const matches = [];
  for (const name of names) {
    const file = path.join(folder, name);
    let stat;
    try { stat = await fs.lstat(file, { bigint: true }); }
    catch (error) { if (error?.code === "ENOENT") continue; throw error; }
    if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 2n && sameNativeMemberFileIdentity(final, stat)) {
      matches.push({ file, stat });
    }
  }
  if (matches.length !== 1) throw fail("CORRUPT");
  return matches[0];
}

// Main-private create-only pending-key storage. This does not authenticate a user,
// trust a new pin, approve a device, rotate credentials or grant Node/Source access.
export function createSpsNativeMemberPendingKeyStore(options) {
  return createStore(options, false);
}

// A cold restart has only the account-scoped key index. Pins come from the
// protected retained record, never from a new peer or an expired invitation.
export function createSpsNativeMemberHostTargetReader(options) {
  return createStore(options, true);
}

// Explicit cold-start recovery derives its full pin context only from protected
// target or pending ciphertext that matches the indexed account/Host/device scope.
export function createSpsNativeMemberPublicationRecovery(options) {
  return createStore(options, true, "publication-recovery");
}

function createStore(options, targetReader, mode = "full") {
  let config, context;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(options ?? {});
    const hasPlatform = Object.hasOwn(descriptors, "platform");
    config = record(options, ["userDataDirectory", "vaultDirectory", targetReader ? "scope" : "context", "safeStorage", ...(hasPlatform ? ["platform"] : [])]);
    for (const field of ["userDataDirectory", "vaultDirectory"]) {
      if (typeof config[field] !== "string" || !path.isAbsolute(config[field])) throw fail("OPTIONS");
      config[field] = path.resolve(config[field]);
    }
    context = targetReader
      ? normalizeSpsNativeMemberKeyIndex({ v: 1, entries: [config.scope] }).entries[0]
      : validateSpsNativeMemberPendingContext(config.context);
  } catch { throw fail("OPTIONS"); }
  const capsule = createSpsNativeMemberPendingCapsule({ safeStorage: config.safeStorage, platform: config.platform ?? process.platform });
  const issuedCapsule = createSpsNativeMemberIssuedCapsule({ safeStorage: config.safeStorage, platform: config.platform ?? process.platform });
  const renewalCapsule = createSpsNativeMemberRenewalCapsule({ safeStorage: config.safeStorage, platform: config.platform ?? process.platform });
  const targetCapsule = createSpsNativeMemberTargetCapsule({ safeStorage: config.safeStorage, platform: config.platform ?? process.platform });
  const scope = Object.freeze({ identityIssuer: context.identityIssuer, subject: context.subject,
    hostId: context.hostId, deviceKeyId: context.deviceKeyId });
  const slot = createHash("sha256").update(JSON.stringify(scope)).digest("hex");
  let queue = Promise.resolve();
  function serialize(action) {
    const result = queue.then(action, action);
    queue = result.catch(() => {});
    return result;
  }
  async function paths(create = false, kind = "pending") {
    const root = await directory(config.userDataDirectory), vault = await directory(config.vaultDirectory, true);
    const native = path.join(root, "native-connectivity");
    if (isWithin(vault, native) || isWithin(native, vault)) throw fail("OPTIONS");
    const nativeRoot = await childDirectory(root, "native-connectivity", create);
    const parentFolder = nativeRoot && await childDirectory(nativeRoot, "member-pending", create);
    const renewal = typeof kind === "string" && /^renewal:[0-9a-f]{64}$/.test(kind);
    const serverCertificate = typeof kind === "string" && /^server-certificate:[0-9a-f]{64}$/.test(kind);
    const renewalDirectory = renewal || kind === "renewals";
    const serverCertificateDirectory = serverCertificate || kind === "server-certificates";
    if (!renewalDirectory && !serverCertificateDirectory && !["pending", "issued", "target"].includes(kind)) throw fail("OPTIONS");
    const folder = parentFolder && (renewalDirectory ? await childDirectory(parentFolder, `${slot}.renewals`, create)
      : serverCertificateDirectory ? await childDirectory(parentFolder, `${slot}.server-certificates`, create) : parentFolder);
    const suffix = kind === "issued" ? ".issued" : kind === "target" ? ".target"
      : kind === "renewals" ? ".directory" : kind === "server-certificates" ? ".directory" : "";
    const filename = renewal ? `${kind.slice(8)}.json` : serverCertificate ? `${kind.slice(19)}.json` : `${slot}${suffix}.json`;
    return folder ? { root, folder, parentFolder, kind, file: path.join(folder, filename),
      rootIdentity: await directoryIdentity(root), parentFolderIdentity: await directoryIdentity(parentFolder),
      folderIdentity: await directoryIdentity(folder) } : null;
  }
  async function recheck(expected) {
    const current = await paths(false, expected.kind);
    if (!current || current.root !== expected.root || current.folder !== expected.folder || current.parentFolder !== expected.parentFolder || current.file !== expected.file
      || !sameDirectory(current.rootIdentity, expected.rootIdentity)
      || !sameDirectory(current.parentFolderIdentity, expected.parentFolderIdentity)
      || !sameDirectory(current.folderIdentity, expected.folderIdentity)) throw fail("FAILED");
  }
  async function cleanupTemporary(temporary, owned, expected) {
    if (!owned) return;
    try {
      await recheck(expected);
      const stat = await fs.lstat(temporary);
      if (!stat.isFile() || stat.isSymbolicLink() || ![1, 2].includes(stat.nlink) || !sameFile(stat, owned)) return;
      if (stat.nlink === 2) {
        const final = await fs.lstat(expected.file);
        if (!final.isFile() || final.isSymbolicLink() || final.nlink !== 2 || !sameFile(final, owned)) return;
      }
      await fs.unlink(temporary);
    } catch { /* Never clean through a replaced path. */ }
  }

  async function readPending() {
    const target = await paths();
    if (!target) return null;
    const stat = await slotStat(target.file);
    if (!stat) { await recheck(target); return null; }
    const bytes = await boundedRead(target.file, stat);
    const key = await capsule.open(bytes, context);
    await recheck(target);
    if (!sameFile(stat, await slotStat(target.file))) throw fail("CORRUPT");
    return { key, target, stat, bytes };
  }
  async function recheckPending(expected) {
    await recheck(expected.target);
    const current = await slotStat(expected.target.file);
    if (!current || !sameFile(current, expected.stat)
      || await boundedRead(expected.target.file, current) !== expected.bytes) throw fail("CORRUPT");
    await recheck(expected.target);
  }
  function commitGuard(input) {
    let guard;
    try {
      const descriptors = Object.getOwnPropertyDescriptors(input);
      const hasGuard = Object.hasOwn(descriptors, "beforeCommit");
      guard = record(input, hasGuard ? ["beforeCommit"] : []).beforeCommit;
      if (guard !== undefined && typeof guard !== "function") throw fail("OPTIONS");
    } catch { throw fail("OPTIONS"); }
    return () => {
      const result = guard?.();
      if (result !== undefined) {
        if (result instanceof Promise) void result.catch(() => {});
        throw fail("OPTIONS");
      }
    };
  }
  function requireCurrentIssued(value) {
    const now = Date.now();
    for (const pem of [value.credential.certificatePem, value.credential.issuerCertificatePem]) {
      const certificate = new X509Certificate(pem);
      if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now) throw fail("CORRUPT");
    }
    return value;
  }
  const certificateHash = pem => createHash("sha256").update(new X509Certificate(pem).raw).digest("hex");
  const sameRenewalResponse = (a, b) => RENEWAL_FIELDS.every(field => a?.[field] === b?.[field]);
  const publicKeyBytes = value => (value instanceof X509Certificate ? value : new X509Certificate(value)).publicKey.export({ type: "spki", format: "der" });
  async function boundedDirectoryNames(folder, maxEntries = 256) {
    const names = [], directoryHandle = await fs.opendir(folder);
    for await (const entry of directoryHandle) {
      names.push(entry.name);
      if (names.length > maxEntries) throw fail("CORRUPT");
    }
    return names;
  }
  async function readRenewal(target, pending) {
    const stat = target && await slotStat(target.file);
    if (!target || !stat || !pending) return null;
    const raw = await boundedRead(target.file, stat);
    const value = await renewalCapsule.openHistorical(raw, context, pending.key);
    await recheck(target); await recheckPending(pending);
    if (!sameFile(stat, await slotStat(target.file)) || await boundedRead(target.file, stat) !== raw) throw fail("CORRUPT");
    return Object.freeze({ stat, raw, value });
  }
  async function readIssuedChain({ allowExpired = false } = {}) {
    const target = await paths(false, "issued");
    if (!target) return null;
    const stat = await slotStat(target.file);
    if (!stat) { await recheck(target); return null; }
    const pending = await readPending();
    if (!pending) throw fail("CORRUPT");
    const baseRaw = await boundedRead(target.file, stat);
    const base = await issuedCapsule.openHistorical(baseRaw, context, pending.key);
    await recheck(target); await recheckPending(pending);
    if (!sameFile(stat, await slotStat(target.file))) throw fail("CORRUPT");
    const renewalDirectory = await paths(false, "renewals");
    const names = renewalDirectory ? await boundedDirectoryNames(renewalDirectory.folder, 257) : [];
    const entries = names.filter(name => /^[0-9a-f]{64}\.json$/.test(name));
    if (entries.length > 256 || names.some(name => !/^[0-9a-f]{64}\.json$/.test(name) && !TEMPORARY_ALIAS.test(name))) throw fail("CORRUPT");
    let issuance = base.issuance, credential = base.credential, latestHistorical = base, deviceId = null, latestRaw = null;
    const visited = new Set(), linked = new Set();
    let generations = 0;
    while (true) {
      const predecessor = certificateHash(credential.certificatePem);
      if (visited.has(predecessor)) throw fail("CORRUPT");
      visited.add(predecessor);
      const name = `${predecessor}.json`;
      if (!entries.includes(name)) break;
      if (++generations > 256) throw fail("CORRUPT");
      const file = path.join(renewalDirectory.folder, name), childStat = await slotStat(file);
      if (!childStat) throw fail("CORRUPT");
      const childRaw = await boundedRead(file, childStat);
      const child = await renewalCapsule.openHistorical(childRaw, context, pending.key);
      const leaf = new X509Certificate(child.credential.certificatePem);
      const oldLeaf = new X509Certificate(credential.certificatePem);
      if (child.response.predecessorCertificateSha256 !== predecessor
        || (deviceId !== null && child.response.deviceId !== deviceId)
        || child.credential.issuerCertificatePem !== base.credential.issuerCertificatePem
        || !publicKeyBytes(leaf).equals(publicKeyBytes(base.credential.certificatePem))
        || certificateHash(child.credential.certificatePem) === predecessor
        || Date.parse(leaf.validTo) <= Date.parse(oldLeaf.validTo)) throw fail("CORRUPT");
      deviceId ??= child.response.deviceId;
      await recheck(renewalDirectory);
      if (!sameFile(childStat, await slotStat(file)) || await boundedRead(file, childStat) !== childRaw) throw fail("CORRUPT");
      linked.add(name); latestRaw = childRaw;
      latestHistorical = child;
      issuance = Object.freeze({ ...issuance, certificate: child.issuance.certificate, issuerCertificate: child.issuance.issuerCertificate });
      credential = child.credential;
    }
    if (linked.size !== entries.length) throw fail("CORRUPT");
    const latest = allowExpired ? latestHistorical : latestRaw
      ? await renewalCapsule.open(latestRaw, context, pending.key)
      : await issuedCapsule.open(baseRaw, context, pending.key);
    const result = Object.freeze({ issuance, credential: latest.credential });
    if (!allowExpired) requireCurrentIssued(result);
    await recheckPending(pending); await recheck(target);
    if (renewalDirectory) await recheck(renewalDirectory);
    return Object.freeze({ ...result, deviceId });
  }
  async function readTargetMetadata() {
    const target = await paths(false, "target");
    if (!target) return null;
    const stat = await slotStat(target.file, false);
    if (!stat) {
      await recheck(target);
      const orphanHistory = await paths(false, "server-certificates");
      if (orphanHistory) throw fail("CORRUPT");
      return null;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_BYTES) throw fail("CORRUPT");
    const bytes = await boundedRead(target.file, stat);
    const base = await targetCapsule.openHistorical(bytes, scope);
    await recheck(target);
    if (!sameFile(stat, await slotStat(target.file))) throw fail("CORRUPT");
    const historyPath = await paths(false, "server-certificates");
    let value = base;
    const entries = historyPath ? await boundedDirectoryNames(historyPath.folder, 257) : [];
    const certificateFiles = entries.filter(name => /^[0-9a-f]{64}\.json$/.test(name));
    if (certificateFiles.length > 256 || entries.some(name => !/^[0-9a-f]{64}\.json$/.test(name) && !TEMPORARY_ALIAS.test(name))) throw fail("CORRUPT");
    const visited = new Set();
    const loaded = [];
    let edges = 0;
    while (historyPath) {
      const predecessor = certificateHash(value.serverCertificatePem);
      if (visited.has(predecessor)) throw fail("CORRUPT");
      visited.add(predecessor);
      const name = `${predecessor}.json`;
      if (!certificateFiles.includes(name)) break;
      if (++edges > 256) throw fail("CORRUPT");
      const file = path.join(historyPath.folder, name);
      const childStat = await slotStat(file);
      const childRaw = await boundedRead(file, childStat);
      const next = await targetCapsule.openHistorical(childRaw, scope);
      if (JSON.stringify(next.context) !== JSON.stringify(base.context) || next.origin !== base.origin) throw fail("CORRUPT");
      const transition = validateSpsNativeServerCertificateTransition({ hostId: base.context.hostId,
        predecessorCertificatePem: value.serverCertificatePem, certificatePem: next.serverCertificatePem });
      const nextSha = certificateHash(next.serverCertificatePem);
      if (nextSha === predecessor || !transition.raw.equals(new X509Certificate(next.serverCertificatePem).raw)) throw fail("CORRUPT");
      loaded.push({ file, stat: childStat, bytes: childRaw, predecessorValue: value, value: next });
      value = next;
      await recheck(historyPath);
      if (!sameFile(childStat, await slotStat(file)) || await boundedRead(file, childStat) !== childRaw) throw fail("CORRUPT");
    }
    if (loaded.length !== certificateFiles.length) throw fail("CORRUPT");
    const latest = validateSpsNativeMemberHostTarget(value, base.context);
    await recheck(target);
    if (historyPath) await recheck(historyPath);
    return { value: latest, target, stat, bytes, historyPath, historyNames: entries, loaded };
  }
  async function readScopeBoundContext(kind) {
    const target = await paths(false, kind);
    if (!target) return null;
    let stat;
    try { stat = await slotStat(target.file, false); }
    catch { throw fail("CORRUPT"); }
    if (!stat) { await recheck(target); return null; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw fail("CORRUPT");
    let raw;
    let linkedIdentity, linkedAlias;
    if (stat.nlink === 1) raw = await boundedRead(target.file, stat);
    else {
      if (stat.nlink !== 2) throw fail("CORRUPT");
      const bigintStat = await fs.lstat(target.file, { bigint: true });
      const alias = await findTemporaryAlias(target.folder, bigintStat);
      linkedIdentity = bigintStat;
      linkedAlias = alias.file;
      await recheck(target);
      raw = await boundedReadExact(target.file, bigintStat);
      const finalAgain = await fs.lstat(target.file, { bigint: true });
      const aliasAgain = await fs.lstat(alias.file, { bigint: true });
      if (finalAgain.nlink !== 2n || aliasAgain.nlink !== 2n || !sameNativeMemberFileIdentity(bigintStat, finalAgain)
        || !sameNativeMemberFileIdentity(bigintStat, aliasAgain)) throw fail("CORRUPT");
    }
    let retainedContext;
    try {
      if (kind === "target") {
        const value = await targetCapsule.openHistorical(raw, scope);
        retainedContext = validateSpsNativeMemberPendingContext(value.context);
      } else retainedContext = await capsule.openContext(raw, scope);
    } catch { throw fail("CORRUPT"); }
    await recheck(target);
    if (linkedIdentity) {
      const currentFinal = await fs.lstat(target.file, { bigint: true });
      const currentAlias = await fs.lstat(linkedAlias, { bigint: true });
      if (!sameNativeMemberFileIdentity(linkedIdentity, currentFinal) || !sameNativeMemberFileIdentity(linkedIdentity, currentAlias)
        || currentFinal.nlink !== 2n || currentAlias.nlink !== 2n
        || await boundedReadExact(target.file, currentFinal) !== raw) throw fail("CORRUPT");
    } else {
      const current = await slotStat(target.file);
      if (!current || !sameFile(stat, current) || current.nlink !== 1
        || await boundedRead(target.file, current) !== raw) throw fail("CORRUPT");
    }
    return retainedContext;
  }
  async function recheckTarget(expected) {
    await recheck(expected.target);
    const stat = await slotStat(expected.target.file);
    if (!stat || !sameFile(stat, expected.stat)
      || await boundedRead(expected.target.file, stat) !== expected.bytes) throw fail("CORRUPT");
    const currentHistory = await paths(false, "server-certificates");
    if (!!currentHistory !== !!expected.historyPath) throw fail("CORRUPT");
    if (expected.historyPath) {
      if (!sameDirectory(currentHistory.folderIdentity, expected.historyPath.folderIdentity)
        || currentHistory.folder !== expected.historyPath.folder) throw fail("CORRUPT");
      await recheck(expected.historyPath);
      const names = await boundedDirectoryNames(expected.historyPath.folder, 257);
      if (JSON.stringify(names) !== JSON.stringify(expected.historyNames)) throw fail("CORRUPT");
      for (const entry of expected.loaded) {
        const current = await slotStat(entry.file);
        if (!current || !sameFile(entry.stat, current) || await boundedRead(entry.file, current) !== entry.bytes) throw fail("CORRUPT");
      }
      await recheck(expected.historyPath);
    }
    await recheck(expected.target);
  }
  async function recoverPublication(kind, authorize) {
    if (!['pending', 'issued', 'target'].includes(kind) && !(typeof kind === "string" && (/^renewal:[0-9a-f]{64}$/.test(kind) || /^server-certificate:[0-9a-f]{64}$/.test(kind)))) throw fail("OPTIONS");
    const target = await paths(false, kind);
    if (!target) return false;
    let final;
    try { final = await fs.lstat(target.file, { bigint: true }); }
    catch (error) { if (error?.code === "ENOENT") return false; throw error; }
    if (!final.isFile() || final.isSymbolicLink() || final.size > BigInt(MAX_BYTES)) throw fail("CORRUPT");
    if (final.nlink === 1n) return false;
    if (final.nlink !== 2n) throw fail("CORRUPT");

    // The link count proves there is exactly one other directory entry for this inode.
    const alias = await findTemporaryAlias(target.folder, final,
      kind.startsWith("renewal:") || kind.startsWith("server-certificate:") ? 257 : null);
    await recheck(target);
    let raw = await boundedReadExact(target.file, final);

    let pending;
    if (kind !== "pending") {
      pending = await readPending();
      if (!pending) throw fail("CORRUPT");
    }
    try {
      if (kind === "pending") await capsule.open(raw, context);
      else if (kind === "issued") {
        requireCurrentIssued(await issuedCapsule.open(raw, context, pending.key));
        await recheckPending(pending);
      } else if (kind === "target") {
        const opened = await targetCapsule.open(raw, scope);
        validateSpsNativeMemberHostTarget(opened, context);
        await recheckPending(pending);
      } else {
        if (kind.startsWith("renewal:")) {
          const opened = await renewalCapsule.openHistorical(raw, context, pending.key);
          if (opened.response.predecessorCertificateSha256 !== kind.slice(8)) throw fail("CORRUPT");
        } else {
          const predecessorSha = kind.slice("server-certificate:".length);
          const basePath = await paths(false, "target"), baseStat = basePath && await slotStat(basePath.file);
          if (!basePath || !baseStat) throw fail("CORRUPT");
          const baseRaw = await boundedRead(basePath.file, baseStat);
          const base = await targetCapsule.openHistorical(baseRaw, scope);
          const history = await paths(false, "server-certificates");
          if (!history || history.folder !== target.folder) throw fail("CORRUPT");
          const names = await boundedDirectoryNames(history.folder, 257);
          const files = names.filter(name => /^[0-9a-f]{64}\.json$/.test(name));
          if (files.length > 256 || names.some(name => !/^[0-9a-f]{64}\.json$/.test(name) && !TEMPORARY_ALIAS.test(name))) throw fail("CORRUPT");
          const visited = new Set(), linked = new Set();
          let predecessorTarget = base;
          for (let count = 0; count < 256; count++) {
            const predecessorHash = certificateHash(predecessorTarget.serverCertificatePem);
            if (predecessorHash === predecessorSha) break;
            if (visited.has(predecessorHash)) throw fail("CORRUPT");
            visited.add(predecessorHash);
            const name = `${predecessorHash}.json`;
            if (!files.includes(name) || name === path.basename(target.file)) throw fail("CORRUPT");
            const childFile = path.join(history.folder, name), childStat = await slotStat(childFile);
            const childRaw = await boundedRead(childFile, childStat);
            const child = await targetCapsule.openHistorical(childRaw, scope);
            const transition = validateSpsNativeServerCertificateTransition({ hostId: context.hostId,
              predecessorCertificatePem: predecessorTarget.serverCertificatePem, certificatePem: child.serverCertificatePem });
            if (!transition.raw.equals(new X509Certificate(child.serverCertificatePem).raw)
              || child.origin !== base.origin || JSON.stringify(child.context) !== JSON.stringify(base.context)) throw fail("CORRUPT");
            linked.add(name); predecessorTarget = child;
          }
          if (certificateHash(predecessorTarget.serverCertificatePem) !== predecessorSha
            || files.some(name => name !== path.basename(target.file) && !linked.has(name))) throw fail("CORRUPT");
          const opened = await targetCapsule.openHistorical(raw, scope);
          const transition = validateSpsNativeServerCertificateTransition({ hostId: context.hostId,
            predecessorCertificatePem: predecessorTarget.serverCertificatePem, certificatePem: opened.serverCertificatePem });
          if (!transition.raw.equals(new X509Certificate(opened.serverCertificatePem).raw)) throw fail("CORRUPT");
          const checked = validateSpsNativeMemberServerCertificateResponse({ hostId: context.hostId,
            predecessorCertificateSha256: predecessorSha,
            serverCertificate: new X509Certificate(opened.serverCertificatePem).raw.toString("base64url"),
            issuerSpkiSha256: context.issuerSpkiSha256 }, predecessorTarget);
          if (checked.target.serverCertificatePem !== opened.serverCertificatePem) throw fail("CORRUPT");
          await recheck(basePath); await recheck(history);
        }
        await recheckPending(pending);
      }
    } catch { throw fail("CORRUPT"); }

    // Revalidate the exact two paths and payload immediately before unlinking the alias.
    await recheck(target);
    const currentFinal = await fs.lstat(target.file, { bigint: true });
    const currentAlias = await fs.lstat(alias.file, { bigint: true });
    if (!currentFinal.isFile() || currentFinal.isSymbolicLink() || currentFinal.nlink !== 2n
      || !sameNativeMemberFileIdentity(final, currentFinal) || !currentAlias.isFile() || currentAlias.isSymbolicLink()
      || currentAlias.nlink !== 2n || !sameNativeMemberFileIdentity(final, currentAlias)
      || await boundedReadExact(target.file, currentFinal) !== raw) throw fail("CORRUPT");
    if (pending) await recheckPending(pending);
    authorize();
    await fs.unlink(alias.file);

    await recheck(target);
    const complete = await fs.lstat(target.file, { bigint: true });
    const completeStat = await slotStat(target.file);
    if (!complete.isFile() || complete.isSymbolicLink() || complete.nlink !== 1n
      || !sameNativeMemberFileIdentity(final, complete) || !completeStat || completeStat.nlink !== 1
      || await boundedReadExact(target.file, complete, 1n) !== raw) throw fail("CORRUPT");
    await syncDirectory(target.folder);
    await recheck(target);
    return true;
  }
  async function createOnly(kind, prepare, authorize) {
    let temporary, owned, target;
    try {
      const { encrypted, validated, pending } = await prepare();
      target = await paths(true, kind);
      if (await slotStat(target.file, false)) throw fail("ALREADY_EXISTS");
      temporary = path.join(target.folder, `.pending-${randomUUID()}.tmp`);
      await recheck(target);
      const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try { owned = await handle.stat(); await handle.writeFile(encrypted, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      authorize();
      await recheck(target);
      if (kind.startsWith("renewal:")) {
        const current = await readIssuedChain();
        if (!current || certificateHash(current.credential.certificatePem) !== kind.slice(8)) throw fail("CORRUPT");
      }
      if (kind.startsWith("server-certificate:")) {
        const current = await readTargetMetadata();
        if (!current || certificateHash(current.value.serverCertificatePem) !== kind.slice("server-certificate:".length)) throw fail("CORRUPT");
      }
      if (kind === "target") {
        const history = await paths(false, "server-certificates");
        if (history) throw fail("ALREADY_EXISTS");
      }
      const stat = await fs.lstat(temporary);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !sameFile(stat, owned)) throw fail("FAILED");
      if (await slotStat(target.file, false)) throw fail("ALREADY_EXISTS");
      if (pending) await recheckPending(pending);
      if (kind === "target") validateSpsNativeMemberHostTarget(validated, context);
      if (kind.startsWith("server-certificate:")) {
        const current = await readTargetMetadata();
        if (!current || certificateHash(current.value.serverCertificatePem) !== kind.slice("server-certificate:".length)) throw fail("CORRUPT");
      }
      authorize();
      try { await fs.link(temporary, target.file); } catch (error) {
        if (error?.code === "EEXIST") throw fail("ALREADY_EXISTS");
        throw error;
      }
      await recheck(target);
      const linked = await fs.lstat(target.file), temporaryLinked = await fs.lstat(temporary);
      if (!linked.isFile() || linked.isSymbolicLink() || linked.nlink !== 2 || !sameFile(linked, owned)
        || !temporaryLinked.isFile() || temporaryLinked.isSymbolicLink() || temporaryLinked.nlink !== 2
        || !sameFile(temporaryLinked, owned)) throw fail("FAILED");
      await fs.unlink(temporary); owned = null;
      await syncDirectory(target.folder);
      await recheck(target);
      if (pending) await recheckPending(pending);
      if (!sameFile(linked, await slotStat(target.file))) throw fail("FAILED");
      if (kind === "issued") requireCurrentIssued(validated);
      if (kind === "target") validateSpsNativeMemberHostTarget(validated, context);
      authorize();
      return validated;
    } catch (error) { throw fail(internalFailures.get(error) ?? "FAILED"); }
    finally { if (temporary && target) await cleanupTemporary(temporary, owned, target); }
  }
  if (targetReader && mode !== "publication-recovery") return Object.freeze({
    read() {
      return serialize(async () => {
        try { return (await readTargetMetadata())?.value ?? null; }
        catch { throw fail("CORRUPT"); }
      });
    },
  });
  if (mode === "publication-recovery") return Object.freeze({
    recoverInterruptedPublications(input) {
      const authorize = commitGuard(input);
      try {
        const descriptors = Object.getOwnPropertyDescriptors(input ?? {});
        if (Reflect.ownKeys(descriptors).length !== 1 || !Object.hasOwn(descriptors, "beforeCommit")
          || typeof descriptors.beforeCommit.value !== "function") throw fail("OPTIONS");
      } catch { throw fail("OPTIONS"); }
      return serialize(async () => {
        try {
          let retainedContext = await readScopeBoundContext("target");
          if (!retainedContext) retainedContext = await readScopeBoundContext("pending");
          if (!retainedContext) throw fail("CORRUPT");
          const fullStore = createSpsNativeMemberPendingKeyStore({
            userDataDirectory: config.userDataDirectory,
            vaultDirectory: config.vaultDirectory,
            context: retainedContext,
            safeStorage: config.safeStorage,
            platform: config.platform,
          });
          const recovered = [];
          for (const kind of ["pending", "issued", "target"]) {
            if (await fullStore.recoverInterruptedPublication(kind, { beforeCommit: authorize })) recovered.push(kind);
          }
          const renewalPath = await paths(false, "renewals");
          let recoveredRenewal = false;
          if (renewalPath) {
            const names = await boundedDirectoryNames(renewalPath.folder, 257);
            const renewalNames = names.filter(name => /^[0-9a-f]{64}\.json$/.test(name));
            if (renewalNames.length > 256 || names.some(name => !/^[0-9a-f]{64}\.json$/.test(name) && !TEMPORARY_ALIAS.test(name))) throw fail("CORRUPT");
            for (const name of renewalNames) {
              const hash = name.slice(0, 64), file = path.join(renewalPath.folder, name);
              const stat = await slotStat(file, false);
              if (stat?.nlink === 2 && await fullStore.recoverInterruptedPublication(`renewal:${hash}`, { beforeCommit: authorize })) {
                recoveredRenewal = true;
              }
            }
            await recheck(renewalPath);
          }
          if (recoveredRenewal) recovered.push("renewal");
          const serverCertificatePath = await paths(false, "server-certificates");
          let recoveredServerCertificate = false;
          if (serverCertificatePath) {
            const names = await boundedDirectoryNames(serverCertificatePath.folder, 257);
            const certificateNames = names.filter(name => /^[0-9a-f]{64}\.json$/.test(name));
            if (certificateNames.length > 256 || names.some(name => !/^[0-9a-f]{64}\.json$/.test(name) && !TEMPORARY_ALIAS.test(name))) throw fail("CORRUPT");
            for (const name of certificateNames) {
              const hash = name.slice(0, 64), file = path.join(serverCertificatePath.folder, name);
              const stat = await slotStat(file, false);
              if (stat?.nlink === 2 && await fullStore.recoverInterruptedPublication(`server-certificate:${hash}`, { beforeCommit: authorize })) {
                recoveredServerCertificate = true;
              }
            }
            await recheck(serverCertificatePath);
          }
          if (recoveredServerCertificate) recovered.push("server-certificate");
          return Object.freeze({ recovered: Object.freeze(recovered) });
        } catch (error) { throw fail(internalFailures.get(error) ?? "FAILED"); }
      });
    },
  });
  return Object.freeze({
    recoverInterruptedPublication(kind, input) {
      const authorize = commitGuard(input);
      try {
        const descriptors = Object.getOwnPropertyDescriptors(input ?? {});
        if (Reflect.ownKeys(descriptors).length !== 1 || !Object.hasOwn(descriptors, "beforeCommit")
          || typeof descriptors.beforeCommit.value !== "function") throw fail("OPTIONS");
      } catch { throw fail("OPTIONS"); }
      return serialize(async () => {
        try { return await recoverPublication(kind, authorize); }
        catch (error) { throw fail(internalFailures.get(error) ?? "FAILED"); }
      });
    },
    inspectPresence() {
      return serialize(async () => {
        try {
          const target = await paths();
          const history = await paths(false, "server-certificates");
          return Object.freeze({ state: target && await slotStat(target.file, false) || history ? "present" : "absent" });
        } catch { throw fail("FAILED"); }
      });
    },
    read() {
      return serialize(async () => {
        try {
          return (await readPending())?.key ?? null;
        } catch { throw fail("CORRUPT"); }
      });
    },
    create(keyRequest, input = {}) {
      const authorize = commitGuard(input);
      return serialize(() => createOnly("pending", async () => {
        const encrypted = await capsule.seal({ context, keyRequest });
        return { encrypted, validated: await capsule.open(encrypted, context) };
      }, authorize));
    },
    readIssued() {
      return serialize(async () => {
        try {
          const value = await readIssuedChain();
          return value && Object.freeze({ issuance: value.issuance, credential: value.credential });
        }
        catch { throw fail("CORRUPT"); }
      });
    },
    inspectIssued() {
      return serialize(async () => {
        try {
          const value = await readIssuedChain({ allowExpired: true });
          if (!value) return null;
          const leaf = new X509Certificate(value.credential.certificatePem);
          const issuer = new X509Certificate(value.credential.issuerCertificatePem);
          const now = Date.now();
          const current = Date.parse(leaf.validFrom) <= now && Date.parse(leaf.validTo) > now
            && Date.parse(issuer.validFrom) <= now && Date.parse(issuer.validTo) > now;
          return Object.freeze({ state: current ? "current" : "expired",
            certificateNotBefore: new Date(leaf.validFrom).toISOString(), certificateNotAfter: new Date(leaf.validTo).toISOString() });
        } catch { throw fail("CORRUPT"); }
      });
    },
    createIssued(issuance, input = {}) {
      const authorize = commitGuard(input);
      return serialize(() => createOnly("issued", async () => {
        const pending = await readPending();
        if (!pending) throw fail("CORRUPT");
        const encrypted = await issuedCapsule.seal({ context, keyRequest: pending.key, issuance });
        const validated = await issuedCapsule.open(encrypted, context, pending.key);
        return { encrypted, validated, pending };
      }, authorize));
    },
    publishRenewal(response, input = {}) {
      let checkedResponse;
      try { checkedResponse = validateSpsNativeMemberRenewalResponse(response); }
      catch { throw fail("CORRUPT"); }
      const authorize = commitGuard(input);
      return serialize(async () => {
        try {
          const current = await readIssuedChain();
          if (!current) throw fail("CORRUPT");
          const predecessor = certificateHash(current.credential.certificatePem);
          if (current.deviceId !== null && checkedResponse.deviceId !== current.deviceId) throw fail("CORRUPT");
          if (checkedResponse.predecessorCertificateSha256 !== predecessor) {
            const existingKind = `renewal:${checkedResponse.predecessorCertificateSha256}`;
            if (existingKind) {
              const existingPath = await paths(false, existingKind), existingStat = existingPath && await slotStat(existingPath.file);
              const pending = await readPending();
              if (existingStat && pending) {
                const saved = await readRenewal(existingPath, pending);
                if (saved && sameRenewalResponse(saved.value.response, checkedResponse)) {
                  authorize();
                  await recheck(existingPath); await recheckPending(pending);
                  if (!sameFile(saved.stat, await slotStat(existingPath.file)) || await boundedRead(existingPath.file, saved.stat) !== saved.raw) throw fail("CORRUPT");
                  const value = await readIssuedChain();
                  return Object.freeze({ issuance: value.issuance, credential: value.credential });
                }
              }
            }
            throw fail("CORRUPT");
          }
          const kind = `renewal:${predecessor}`;
          const target = await paths(false, kind);
          const existing = target && await slotStat(target.file);
          if (existing) {
            const pending = await readPending();
            if (!pending) throw fail("CORRUPT");
            const saved = await readRenewal(target, pending);
            if (!saved || !sameRenewalResponse(saved.value.response, checkedResponse)) throw fail("ALREADY_EXISTS");
            authorize();
            await recheck(target);
            await recheckPending(pending);
            if (!sameFile(saved.stat, await slotStat(target.file)) || await boundedRead(target.file, saved.stat) !== saved.raw) throw fail("CORRUPT");
            const value = await readIssuedChain();
            return Object.freeze({ issuance: value.issuance, credential: value.credential });
          }
          try {
            await createOnly(kind, async () => {
              const pending = await readPending();
              if (!pending) throw fail("CORRUPT");
              const latest = await readIssuedChain();
              if (!latest || certificateHash(latest.credential.certificatePem) !== predecessor) throw fail("CORRUPT");
              const encrypted = await renewalCapsule.seal({ context, keyRequest: pending.key, baseIssuance: latest.issuance, response: checkedResponse });
              const validated = await renewalCapsule.open(encrypted, context, pending.key);
              if (Date.parse(new X509Certificate(validated.credential.certificatePem).validTo)
                <= Date.parse(new X509Certificate(latest.credential.certificatePem).validTo)
                || validated.credential.issuerCertificatePem !== latest.credential.issuerCertificatePem) throw fail("CORRUPT");
              return { encrypted, validated, pending };
            }, authorize);
          } catch (error) {
            if (internalFailures.get(error) !== "ALREADY_EXISTS") throw error;
            const committedPath = await paths(false, kind);
            const pending = await readPending();
            const saved = await readRenewal(committedPath, pending);
            if (!saved || !sameRenewalResponse(saved.value.response, checkedResponse)) throw error;
            authorize(); await recheck(committedPath); await recheckPending(pending);
            if (!sameFile(saved.stat, await slotStat(committedPath.file)) || await boundedRead(committedPath.file, saved.stat) !== saved.raw) throw fail("CORRUPT");
          }
          const value = await readIssuedChain();
          return Object.freeze({ issuance: value.issuance, credential: value.credential });
        } catch (error) {
          if (internalFailures.has(error)) throw fail(internalFailures.get(error));
          throw fail("CORRUPT");
        }
      });
    },
    readTarget() {
      return serialize(async () => {
        try {
          const result = await readTargetMetadata();
          if (!result) return null;
          const pending = await readPending();
          if (!pending) throw fail("CORRUPT");
          await recheckPending(pending);
          await recheckTarget(result);
          return validateSpsNativeMemberHostTarget(result.value, context);
        } catch { throw fail("CORRUPT"); }
      });
    },
    publishServerCertificate(response, input = {}) {
      const authorize = commitGuard(input);
      return serialize(async () => {
        try {
          const exactResponse = record(response, ["hostId", "predecessorCertificateSha256", "serverCertificate", "issuerSpkiSha256"]);
          const current = await readTargetMetadata();
          const pending = await readPending();
          if (!current || !pending) throw fail("CORRUPT");
          const suppliedHash = exactResponse.predecessorCertificateSha256;
          const predecessorEntry = current.loaded.find(entry => certificateHash(entry.predecessorValue.serverCertificatePem) === suppliedHash);
          const predecessorTarget = predecessorEntry?.predecessorValue
            ?? (certificateHash(current.value.serverCertificatePem) === suppliedHash ? current.value : null);
          if (predecessorTarget) {
            if (predecessorEntry) {
              if (exactResponse.hostId !== context.hostId || exactResponse.issuerSpkiSha256 !== context.issuerSpkiSha256
                || exactResponse.predecessorCertificateSha256 !== suppliedHash
                || typeof exactResponse.serverCertificate !== "string" || exactResponse.serverCertificate.length < 1
                || exactResponse.serverCertificate.length > 5462 || !/^[A-Za-z0-9_-]+$/.test(exactResponse.serverCertificate)) throw fail("CORRUPT");
              const replayDer = Buffer.from(exactResponse.serverCertificate, "base64url");
              const storedDer = new X509Certificate(predecessorEntry.value.serverCertificatePem).raw;
              if (!replayDer.length || replayDer.length > 4096 || replayDer.toString("base64url") !== exactResponse.serverCertificate
                || !replayDer.equals(storedDer)) throw fail("CORRUPT");
              authorize(); await recheckPending(pending); await recheckTarget(current);
              return current.value;
            }
            const checked = validateSpsNativeMemberServerCertificateResponse(exactResponse, predecessorTarget);
            const successorHash = certificateHash(checked.target.serverCertificatePem);
            if (successorHash === suppliedHash) {
              authorize(); await recheckPending(pending); await recheckTarget(current);
              return current.value;
            }
            if (certificateHash(current.value.serverCertificatePem) !== suppliedHash) throw fail("CORRUPT");
            const kind = `server-certificate:${suppliedHash}`;
            try {
              await createOnly(kind, async () => {
                const latest = await readTargetMetadata();
                if (!latest || certificateHash(latest.value.serverCertificatePem) !== suppliedHash) throw fail("CORRUPT");
                const encrypted = await targetCapsule.seal({ context, target: checked.target });
                const validated = await targetCapsule.open(encrypted, scope);
                return { encrypted, validated, pending };
              }, authorize);
            } catch (error) {
              if (internalFailures.get(error) !== "ALREADY_EXISTS") throw error;
              const latest = await readTargetMetadata();
              const edge = latest?.loaded.find(entry => certificateHash(entry.predecessorValue.serverCertificatePem) === suppliedHash);
              if (!edge || edge.value.serverCertificatePem !== checked.target.serverCertificatePem) throw error;
              authorize(); await recheckPending(pending); await recheckTarget(latest);
            }
            const latest = await readTargetMetadata();
            if (!latest) throw fail("CORRUPT");
            await recheckPending(pending); await recheckTarget(latest);
            return latest.value;
          }
          throw fail("CORRUPT");
        } catch (error) {
          if (internalFailures.has(error)) throw fail(internalFailures.get(error));
          throw fail("CORRUPT");
        }
      });
    },
    createTarget(target, input = {}) {
      const authorize = commitGuard(input);
      return serialize(() => createOnly("target", async () => {
        const pending = await readPending();
        if (!pending) throw fail("CORRUPT");
        const encrypted = await targetCapsule.seal({ context, target });
        const validated = await targetCapsule.open(encrypted, scope);
        return { encrypted, validated, pending };
      }, authorize));
    },
  });
}
