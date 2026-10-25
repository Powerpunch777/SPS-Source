import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID, X509Certificate } from "node:crypto";
import { nativeCertificateRecord as record } from "./native-certificate-primitives.mjs";
import { createSpsNativeMemberPendingCapsule, validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";
import { createSpsNativeMemberIssuedCapsule } from "./native-member-issued-capsule.mjs";

const MAX_BYTES = 96 * 1024;
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
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
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

// Main-private create-only pending-key storage. This does not authenticate a user,
// trust a new pin, approve a device, rotate credentials or grant Node/Source access.
export function createSpsNativeMemberPendingKeyStore(options) {
  let config, context;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(options ?? {});
    const hasPlatform = Object.hasOwn(descriptors, "platform");
    config = record(options, ["userDataDirectory", "vaultDirectory", "context", "safeStorage", ...(hasPlatform ? ["platform"] : [])]);
    for (const field of ["userDataDirectory", "vaultDirectory"]) {
      if (typeof config[field] !== "string" || !path.isAbsolute(config[field])) throw fail("OPTIONS");
      config[field] = path.resolve(config[field]);
    }
    context = validateSpsNativeMemberPendingContext(config.context);
  } catch { throw fail("OPTIONS"); }
  const capsule = createSpsNativeMemberPendingCapsule({ safeStorage: config.safeStorage, platform: config.platform ?? process.platform });
  const issuedCapsule = createSpsNativeMemberIssuedCapsule({ safeStorage: config.safeStorage, platform: config.platform ?? process.platform });
  const slot = createHash("sha256").update(JSON.stringify({ identityIssuer: context.identityIssuer, subject: context.subject,
    hostId: context.hostId, deviceKeyId: context.deviceKeyId })).digest("hex");
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
    const folder = nativeRoot && await childDirectory(nativeRoot, "member-pending", create);
    return folder ? { root, folder, kind, file: path.join(folder, kind === "issued" ? `${slot}.issued.json` : `${slot}.json`),
      rootIdentity: await directoryIdentity(root), folderIdentity: await directoryIdentity(folder) } : null;
  }
  async function recheck(expected) {
    const current = await paths(false, expected.kind);
    if (!current || current.root !== expected.root || current.folder !== expected.folder || current.file !== expected.file
      || !sameDirectory(current.rootIdentity, expected.rootIdentity)
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
      const stat = await fs.lstat(temporary);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !sameFile(stat, owned)) throw fail("FAILED");
      if (await slotStat(target.file, false)) throw fail("ALREADY_EXISTS");
      if (pending) await recheckPending(pending);
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
      authorize();
      return validated;
    } catch (error) { throw fail(internalFailures.get(error) ?? "FAILED"); }
    finally { if (temporary && target) await cleanupTemporary(temporary, owned, target); }
  }
  return Object.freeze({
    inspectPresence() {
      return serialize(async () => {
        try {
          const target = await paths();
          return Object.freeze({ state: target && await slotStat(target.file, false) ? "present" : "absent" });
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
          const target = await paths(false, "issued");
          if (!target) return null;
          const stat = await slotStat(target.file);
          if (!stat) { await recheck(target); return null; }
          const pending = await readPending();
          if (!pending) throw fail("CORRUPT");
          const result = await issuedCapsule.open(await boundedRead(target.file, stat), context, pending.key);
          await recheck(target);
          await recheckPending(pending);
          if (!sameFile(stat, await slotStat(target.file))) throw fail("CORRUPT");
          return requireCurrentIssued(result);
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
  });
}
