import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID, X509Certificate } from "node:crypto";
import { inspectSpsNativeHostIdentity, validateSpsNativeHostIdentity,
  validateSpsNativeServerCertificateTransition } from "./native-identity-certificates.mjs";

const STORE_KIND = "sps.native.host-identity-store";
const STORE_VERSION = 2;
const MAX_PLAINTEXT_BYTES = 256 * 1024;
const MAX_CIPHERTEXT_BYTES = 512 * 1024;
const MAX_FILE_BYTES = 700 * 1024;
const RENEWAL_KIND = "sps.native.host-server-renewal";
const RENEWAL_OUTER_KEYS = ["v", "kind", "ciphertext"];
const RENEWAL_INNER_KEYS = ["v", "kind", "context", "predecessorCertificateSha256", "certificatePem"];
const MAX_RENEWAL_GENERATIONS = 256;
const RENEWAL_TEMPORARY_ALIAS = /^\.host-renewal-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/;
const ERROR_CODES = Object.freeze({
  options: "ERR_SPS_NATIVE_IDENTITY_STORE_OPTIONS",
  platform: "ERR_SPS_NATIVE_IDENTITY_STORE_UNSUPPORTED_PLATFORM",
  encryption: "ERR_SPS_NATIVE_IDENTITY_STORE_ENCRYPTION_UNAVAILABLE",
  invalidIdentity: "ERR_SPS_NATIVE_IDENTITY_INVALID",
  exists: "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS",
  corrupt: "ERR_SPS_NATIVE_IDENTITY_STORE_CORRUPT",
  storage: "ERR_SPS_NATIVE_IDENTITY_STORE_FAILED",
});
const ERROR_MESSAGES = Object.freeze({
  [ERROR_CODES.options]: "Native host identity storage options are invalid.",
  [ERROR_CODES.platform]: "Native host identity storage is supported only on Windows.",
  [ERROR_CODES.encryption]: "Windows native host identity encryption is unavailable.",
  [ERROR_CODES.invalidIdentity]: "The native host identity is invalid.",
  [ERROR_CODES.exists]: "A native host identity already exists for this vault.",
  [ERROR_CODES.corrupt]: "The native host identity store is invalid or cannot be decrypted.",
  [ERROR_CODES.storage]: "The native host identity store could not be accessed.",
});

function storeError(code) {
  return Object.assign(new Error(ERROR_MESSAGES[code]), { code });
}

function isStoreError(error) {
  return Object.values(ERROR_CODES).includes(error?.code);
}

function requireAbsoluteDirectory(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw storeError(ERROR_CODES.options);
  return path.resolve(value);
}

function vaultIncarnation(stat) {
  if (!stat?.isDirectory?.() || stat.isSymbolicLink?.()) throw storeError(ERROR_CODES.storage);
  const values = [stat.dev, stat.ino, stat.birthtimeNs];
  if (values.some(value => typeof value !== "bigint" || value <= 0n)) {
    throw storeError(ERROR_CODES.storage);
  }
  return Object.freeze({
    dev: stat.dev.toString(10),
    ino: stat.ino.toString(10),
    birthtimeNs: stat.birthtimeNs.toString(10),
  });
}

async function readVaultIncarnation(directory) {
  try {
    return vaultIncarnation(await fs.lstat(directory, { bigint: true }));
  } catch (error) {
    if (isStoreError(error)) throw error;
    throw storeError(ERROR_CODES.storage);
  }
}

function sameStorePaths(left, right) {
  return left.userDataDirectory === right.userDataDirectory
    && left.vaultDirectory === right.vaultDirectory
    && left.credentialsDirectory === right.credentialsDirectory
    && left.file === right.file
    && left.renewalDirectory === right.renewalDirectory;
}

function sameVaultIncarnation(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs;
}

async function canonicalDirectory(input) {
  const resolved = requireAbsoluteDirectory(input);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const segment of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw storeError(ERROR_CODES.storage);
  }
  const canonical = await fs.realpath(resolved);
  const stat = await fs.lstat(canonical);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw storeError(ERROR_CODES.storage);
  return canonical;
}

async function canonicalDirectoryAllowMissing(input) {
  const resolved = requireAbsoluteDirectory(input);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const rootStat = await fs.lstat(current);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw storeError(ERROR_CODES.storage);
  let canonical = await fs.realpath(current);
  const segments = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return path.resolve(canonical, ...segments.slice(index));
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw storeError(ERROR_CODES.storage);
    canonical = await fs.realpath(current);
  }
  return canonical;
}

function assertContained(root, child) {
  const relative = path.relative(root, child);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw storeError(ERROR_CODES.storage);
  }
}

async function directoryAt(parent, name, { create = false } = {}) {
  const target = path.join(parent, name);
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw storeError(ERROR_CODES.storage);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!create) return null;
    const parentStat = await fs.lstat(parent);
    if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) throw storeError(ERROR_CODES.storage);
    try {
      await fs.mkdir(target, { mode: 0o700 });
    } catch (mkdirError) {
      if (mkdirError?.code !== "EEXIST") throw mkdirError;
    }
    const createdStat = await fs.lstat(target);
    if (createdStat.isSymbolicLink() || !createdStat.isDirectory()) throw storeError(ERROR_CODES.storage);
  }
  const canonical = await fs.realpath(target);
  if (path.resolve(canonical) !== path.resolve(target)) throw storeError(ERROR_CODES.storage);
  return canonical;
}

async function resolveStorePaths(userDataInput, vaultInput, createDirectories, { allowMissingVault = false } = {}) {
  const userDataDirectory = await canonicalDirectory(userDataInput);
  const vaultDirectory = allowMissingVault
    ? await canonicalDirectoryAllowMissing(vaultInput)
    : await canonicalDirectory(vaultInput);
  const nativeRoot = path.join(userDataDirectory, "native-connectivity");
  const overlaps = (root, child) => {
    const relative = path.relative(root, child);
    return !relative || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  if (overlaps(vaultDirectory, nativeRoot) || overlaps(nativeRoot, vaultDirectory)) {
    throw storeError(ERROR_CODES.options);
  }
  let nativeConnectivityDirectory = await directoryAt(userDataDirectory, "native-connectivity", { create: createDirectories });
  if (!nativeConnectivityDirectory) return null;
  assertContained(userDataDirectory, nativeConnectivityDirectory);
  let credentialsDirectory = await directoryAt(nativeConnectivityDirectory, "credentials", { create: createDirectories });
  if (!credentialsDirectory) return null;
  assertContained(userDataDirectory, credentialsDirectory);
  const slot = createHash("sha256").update(vaultDirectory.toLowerCase(), "utf8").digest("hex");
  return {
    userDataDirectory,
    vaultDirectory,
    credentialsDirectory,
    file: path.join(credentialsDirectory, `host-identity-${slot}.json`),
    renewalDirectory: path.join(credentialsDirectory, `host-identity-${slot}.renewals`),
  };
}

async function existingFile(file, { rejectInvalid = true } = {}) {
  let stat;
  try {
    stat = await fs.lstat(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (rejectInvalid && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES)) {
    throw storeError(ERROR_CODES.corrupt);
  }
  return stat;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readBoundedFile(file, expectedStat) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let handle;
  try {
    handle = await fs.open(file, constants.O_RDONLY | noFollow);
    const bigint = typeof expectedStat.dev === "bigint";
    const before = await handle.stat({ bigint });
    const openedPath = await fs.lstat(file, { bigint });
    const linkCount = bigint ? 1n : 1;
    if (!before.isFile() || before.nlink !== linkCount || before.size > (bigint ? BigInt(MAX_FILE_BYTES) : MAX_FILE_BYTES)
      || !sameFileIdentity(expectedStat, before) || !openedPath.isFile() || openedPath.isSymbolicLink()
      || openedPath.nlink !== linkCount || !sameFileIdentity(before, openedPath)) throw storeError(ERROR_CODES.corrupt);
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const result = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    const after = await handle.stat({ bigint });
    const finalPath = await fs.lstat(file, { bigint });
    if (bytesRead > MAX_FILE_BYTES || after.size !== before.size || after.nlink !== linkCount
      || !sameFileIdentity(before, after) || !finalPath.isFile() || finalPath.isSymbolicLink()
      || finalPath.nlink !== linkCount || !sameFileIdentity(after, finalPath)) throw storeError(ERROR_CODES.corrupt);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead));
    } catch {
      throw storeError(ERROR_CODES.corrupt);
    }
  } finally {
    await handle?.close();
  }
}

async function readBoundedLinkedFile(file, expectedStat) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let handle;
  try {
    handle = await fs.open(file, constants.O_RDONLY | noFollow);
    const before = await handle.stat({ bigint: true });
    const openedPath = await fs.lstat(file, { bigint: true });
    if (!before.isFile() || before.nlink !== 2n || before.size > BigInt(MAX_FILE_BYTES)
      || !sameFileIdentity(expectedStat, before) || !openedPath.isFile() || openedPath.isSymbolicLink()
      || openedPath.nlink !== 2n || !sameFileIdentity(before, openedPath)) throw storeError(ERROR_CODES.corrupt);
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const result = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const finalPath = await fs.lstat(file, { bigint: true });
    if (bytesRead > MAX_FILE_BYTES || after.size !== before.size || after.nlink !== 2n
      || !sameFileIdentity(before, after) || !finalPath.isFile() || finalPath.isSymbolicLink()
      || finalPath.nlink !== 2n || !sameFileIdentity(after, finalPath)) throw storeError(ERROR_CODES.corrupt);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead)); }
    catch { throw storeError(ERROR_CODES.corrupt); }
  } finally { await handle?.close(); }
}

async function boundedNames(directory, maximum) {
  const names = [], handle = await fs.opendir(directory);
  for await (const entry of handle) {
    names.push(entry.name);
    if (names.length > maximum) throw storeError(ERROR_CODES.corrupt);
  }
  return names;
}

async function directoryIdentity(directory) {
  try { return vaultIncarnation(await fs.lstat(directory, { bigint: true })); }
  catch (error) { if (isStoreError(error)) throw error; throw storeError(ERROR_CODES.storage); }
}

function sameDirectoryIdentity(left, right) {
  return Boolean(left && right && sameVaultIncarnation(left, right));
}

function parseCanonicalJson(raw, expectedKeys, maximumBytes = MAX_PLAINTEXT_BYTES) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > maximumBytes) {
    throw storeError(ERROR_CODES.corrupt);
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw storeError(ERROR_CODES.corrupt);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).join(",") !== expectedKeys.join(",")
    || JSON.stringify(value) !== raw) throw storeError(ERROR_CODES.corrupt);
  return value;
}

function validatedIdentity(validateIdentity, identity, errorCode) {
  try {
    const result = validateIdentity(identity);
    if (!result || typeof result !== "object" || typeof result.then === "function") {
      throw new TypeError("Invalid identity validator result.");
    }
    return result;
  } catch {
    throw storeError(errorCode);
  }
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fs.open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EACCES"].includes(error?.code)) throw error;
  } finally {
    await handle?.close();
  }
}

async function cleanupOwnedTemporary(file, identity, userDataDirectory, credentialsDirectory, finalFile) {
  if (!identity) return;
  try {
    const currentUserData = await canonicalDirectory(userDataDirectory);
    if (currentUserData !== userDataDirectory) return;
    const currentCredentials = await directoryAt(path.join(userDataDirectory, "native-connectivity"), "credentials");
    if (currentCredentials !== credentialsDirectory) return;
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || ![1, 2].includes(stat.nlink) || !sameFileIdentity(stat, identity)) return;
    if (stat.nlink === 2) {
      const finalStat = await fs.lstat(finalFile);
      if (!finalStat.isFile() || finalStat.isSymbolicLink() || finalStat.nlink !== 2
        || !sameFileIdentity(stat, finalStat)) return;
    }
    await fs.unlink(file);
  } catch {
    // Cleanup is best-effort and never follows a changed or linked path.
  }
}

export function createSpsNativeHostIdentityStore({
  userDataDirectory,
  vaultDirectory,
  safeStorage,
  platform = process.platform,
  validateIdentity = validateSpsNativeHostIdentity,
} = {}) {
  if (platform !== "win32") throw storeError(ERROR_CODES.platform);
  let encryptionAvailable = false;
  try {
    encryptionAvailable = safeStorage?.isEncryptionAvailable?.() === true
      && typeof safeStorage.encryptString === "function"
      && typeof safeStorage.decryptString === "function";
  } catch {
    encryptionAvailable = false;
  }
  if (!encryptionAvailable) throw storeError(ERROR_CODES.encryption);
  if (typeof validateIdentity !== "function") throw storeError(ERROR_CODES.options);
  const userDataInput = requireAbsoluteDirectory(userDataDirectory);
  const vaultInput = requireAbsoluteDirectory(vaultDirectory);
  let queue = Promise.resolve();

  function serialize(operation) {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  }

  async function safePaths(createDirectories) {
    try {
      return await resolveStorePaths(userDataInput, vaultInput, createDirectories);
    } catch (error) {
      if (isStoreError(error)) throw error;
      throw storeError(ERROR_CODES.storage);
    }
  }

  async function safePresencePaths() {
    try {
      return await resolveStorePaths(userDataInput, vaultInput, false, { allowMissingVault: true });
    } catch (error) {
      if (isStoreError(error)) throw error;
      throw storeError(ERROR_CODES.storage);
    }
  }

  async function safeBinding(createDirectories) {
    const paths = await safePaths(createDirectories);
    if (!paths) return null;
    return { paths, incarnation: await readVaultIncarnation(paths.vaultDirectory) };
  }

  async function assertCurrentBinding(paths, incarnation, createDirectories = false) {
    const current = await safeBinding(createDirectories);
    if (!current || !sameStorePaths(paths, current.paths)
      || !sameVaultIncarnation(incarnation, current.incarnation)) throw storeError(ERROR_CODES.storage);
    return current.paths;
  }

  async function ensureRenewalDirectory(paths, create) {
    let directory;
    try {
      const existing = await directoryAt(paths.credentialsDirectory, path.basename(paths.renewalDirectory), { create: false });
      directory = await directoryAt(paths.credentialsDirectory, path.basename(paths.renewalDirectory), { create });
      if (directory && directory !== paths.renewalDirectory) throw storeError(ERROR_CODES.storage);
      if (!existing && directory && create) await syncDirectory(paths.credentialsDirectory);
      return directory;
    } catch (error) {
      if (isStoreError(error)) throw error;
      throw storeError(ERROR_CODES.storage);
    }
  }

  async function assertRenewalBinding(paths, incarnation, directories) {
    await assertCurrentBinding(paths, incarnation);
    if (!sameDirectoryIdentity(directories.parent, await directoryIdentity(paths.credentialsDirectory))) throw storeError(ERROR_CODES.storage);
    const currentDirectory = await ensureRenewalDirectory(paths, false);
    if (currentDirectory !== directories.directory
      || !sameDirectoryIdentity(directories.child, await directoryIdentity(currentDirectory))) throw storeError(ERROR_CODES.storage);
  }

  async function assertNoRenewalSlot(paths) {
    try {
      await fs.lstat(paths.renewalDirectory);
      throw storeError(ERROR_CODES.exists);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      if (error?.code === ERROR_CODES.exists) throw error;
      throw storeError(ERROR_CODES.storage);
    }
  }

  function storeContext(paths, incarnation) {
    return Object.freeze({ userDataDirectory: paths.userDataDirectory, vaultDirectory: paths.vaultDirectory,
      vaultIncarnation: incarnation });
  }

  function encodeRenewalCapsule(context, predecessorCertificateSha256, certificatePem) {
    try {
      const plaintext = JSON.stringify({ v: 1, kind: RENEWAL_KIND, context, predecessorCertificateSha256, certificatePem });
      if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) throw new Error("size");
      const ciphertext = safeStorage.encryptString(plaintext);
      if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0 || ciphertext.length > MAX_CIPHERTEXT_BYTES) throw new Error("ciphertext");
      const serialized = JSON.stringify({ v: 1, kind: RENEWAL_KIND, ciphertext: ciphertext.toString("base64") });
      if (Buffer.byteLength(serialized, "utf8") > MAX_FILE_BYTES) throw new Error("size");
      return serialized;
    } catch { throw storeError(ERROR_CODES.storage); }
  }

  function decodeRenewalCapsule(raw, expectedContext, expectedPredecessor) {
    try {
      const outer = parseCanonicalJson(raw, RENEWAL_OUTER_KEYS, MAX_FILE_BYTES);
      if (outer.v !== 1 || outer.kind !== RENEWAL_KIND || typeof outer.ciphertext !== "string"
        || outer.ciphertext.length === 0 || outer.ciphertext.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(outer.ciphertext)) throw new Error("outer");
      const encrypted = Buffer.from(outer.ciphertext, "base64");
      if (!encrypted.length || encrypted.length > MAX_CIPHERTEXT_BYTES || encrypted.toString("base64") !== outer.ciphertext) throw new Error("ciphertext");
      const plaintext = safeStorage.decryptString(encrypted);
      const envelope = parseCanonicalJson(plaintext, RENEWAL_INNER_KEYS);
      if (envelope.v !== 1 || envelope.kind !== RENEWAL_KIND
        || JSON.stringify(envelope.context) !== JSON.stringify(expectedContext)
        || envelope.predecessorCertificateSha256 !== expectedPredecessor
        || typeof envelope.certificatePem !== "string" || Buffer.byteLength(envelope.certificatePem, "utf8") > 8192) throw new Error("context");
      return envelope.certificatePem;
    } catch { throw storeError(ERROR_CODES.corrupt); }
  }

  async function readBase() {
    const binding = await safeBinding(false);
    if (!binding) return null;
    const { paths, incarnation } = binding;
    let stat;
    try { stat = await existingFile(paths.file); }
    catch (error) { if (isStoreError(error)) throw error; throw storeError(ERROR_CODES.storage); }
    if (!stat) {
      await assertCurrentBinding(paths, incarnation);
      if (await ensureRenewalDirectory(paths, false)) throw storeError(ERROR_CODES.corrupt);
      return null;
    }
    let raw;
    try {
      await assertCurrentBinding(paths, incarnation);
      raw = await readBoundedFile(paths.file, stat);
    } catch (error) {
      if (error?.code === ERROR_CODES.corrupt) throw error;
      throw storeError(ERROR_CODES.storage);
    }
    let identity;
    try {
      const outer = parseCanonicalJson(raw, ["v", "kind", "ciphertext"], MAX_FILE_BYTES);
      if (outer.v !== STORE_VERSION || outer.kind !== STORE_KIND || typeof outer.ciphertext !== "string"
        || outer.ciphertext.length === 0 || outer.ciphertext.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(outer.ciphertext)) throw storeError(ERROR_CODES.corrupt);
      const encrypted = Buffer.from(outer.ciphertext, "base64");
      if (!encrypted.length || encrypted.length > MAX_CIPHERTEXT_BYTES || encrypted.toString("base64") !== outer.ciphertext) throw storeError(ERROR_CODES.corrupt);
      const plaintext = safeStorage.decryptString(encrypted);
      const envelope = parseCanonicalJson(plaintext, ["v", "kind", "context", "identity"]);
      const context = envelope.context, contextIncarnation = context?.vaultIncarnation;
      if (envelope.v !== STORE_VERSION || envelope.kind !== STORE_KIND
        || !context || typeof context !== "object" || Array.isArray(context)
        || Object.keys(context).join(",") !== "userDataDirectory,vaultDirectory,vaultIncarnation"
        || context.userDataDirectory !== paths.userDataDirectory || context.vaultDirectory !== paths.vaultDirectory
        || !contextIncarnation || typeof contextIncarnation !== "object" || Array.isArray(contextIncarnation)
        || Object.keys(contextIncarnation).join(",") !== "dev,ino,birthtimeNs"
        || contextIncarnation.dev !== incarnation.dev || contextIncarnation.ino !== incarnation.ino
        || contextIncarnation.birthtimeNs !== incarnation.birthtimeNs) throw storeError(ERROR_CODES.corrupt);
      identity = validatedIdentity(validateIdentity, envelope.identity, ERROR_CODES.corrupt);
    } catch (error) { if (error?.code === ERROR_CODES.corrupt) throw error; throw storeError(ERROR_CODES.corrupt); }
    await assertCurrentBinding(paths, incarnation);
    if (!sameFileIdentity(stat, await existingFile(paths.file)) || await readBoundedFile(paths.file, stat) !== raw) throw storeError(ERROR_CODES.corrupt);
    return { paths, incarnation, context: storeContext(paths, incarnation), stat, raw, identity };
  }

  async function readHistory({ allowLinked = false, ownedTemporary = null } = {}) {
    const base = await readBase();
    if (!base) return Object.freeze({ identity: null, certificates: Object.freeze([]), edges: Object.freeze([]) });
    const directory = await ensureRenewalDirectory(base.paths, false);
    if (!directory) return Object.freeze({ identity: base.identity, certificates: Object.freeze([base.identity.server.certificatePem]), edges: Object.freeze([]), base });
    const directories = { directory, parent: await directoryIdentity(base.paths.credentialsDirectory), child: await directoryIdentity(directory) };
    const names = await boundedNames(directory, MAX_RENEWAL_GENERATIONS + 1);
    const files = names.filter(name => /^[0-9a-f]{64}\.json$/.test(name));
    const temporaryNames = names.filter(name => RENEWAL_TEMPORARY_ALIAS.test(name));
    if (files.length > MAX_RENEWAL_GENERATIONS
      || names.some(name => !/^[0-9a-f]{64}\.json$/.test(name) && !RENEWAL_TEMPORARY_ALIAS.test(name))) throw storeError(ERROR_CODES.corrupt);
    if (temporaryNames.some(name => name !== ownedTemporary?.name) && !allowLinked) throw storeError(ERROR_CODES.corrupt);
    if (ownedTemporary) {
      if (!temporaryNames.includes(ownedTemporary.name)) throw storeError(ERROR_CODES.corrupt);
      const ownedPath = path.join(directory, ownedTemporary.name);
      const ownedStat = await fs.lstat(ownedPath, { bigint: true });
      if (!ownedStat.isFile() || ownedStat.isSymbolicLink() || ownedStat.nlink !== 1n
        || !sameFileIdentity(ownedStat, ownedTemporary.identity)) throw storeError(ERROR_CODES.corrupt);
    }
    const used = new Set(), certificates = [base.identity.server.certificatePem], edges = [];
    let identity = base.identity;
    const visited = new Set();
    for (let generation = 0; generation < MAX_RENEWAL_GENERATIONS; generation++) {
      const predecessorPem = identity.server.certificatePem;
      const predecessor = createHash("sha256").update(new X509Certificate(predecessorPem).raw).digest("hex");
      if (visited.has(predecessor)) throw storeError(ERROR_CODES.corrupt);
      visited.add(predecessor);
      const name = `${predecessor}.json`;
      if (!files.includes(name)) break;
      const file = path.join(directory, name);
      const stat = await fs.lstat(file, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > BigInt(MAX_FILE_BYTES)
        || ![1n, 2n].includes(stat.nlink) || stat.nlink === 2n && !allowLinked) throw storeError(ERROR_CODES.corrupt);
      const raw = stat.nlink === 2n ? await readBoundedLinkedFile(file, stat) : await readBoundedFile(file, stat);
      const certificatePem = decodeRenewalCapsule(raw, base.context, predecessor);
      const certificate = validateSpsNativeServerCertificateTransition({ hostId: base.identity.hostId,
        predecessorCertificatePem: predecessorPem, certificatePem });
      const candidate = validatedIdentity(validateIdentity, { ...base.identity,
        server: { ...base.identity.server, certificatePem: certificatePem }, memberIssuer: base.identity.memberIssuer }, ERROR_CODES.corrupt);
      if (!certificate.raw.equals(new X509Certificate(candidate.server.certificatePem).raw)
        || candidate.server.privateKeyPem !== base.identity.server.privateKeyPem
        || candidate.memberIssuer.certificatePem !== base.identity.memberIssuer.certificatePem
        || candidate.memberIssuer.privateKeyPem !== base.identity.memberIssuer.privateKeyPem) throw storeError(ERROR_CODES.corrupt);
      await assertRenewalBinding(base.paths, base.incarnation, directories);
      const currentStat = await fs.lstat(file, { bigint: true });
      const currentRaw = stat.nlink === 2n ? await readBoundedLinkedFile(file, stat) : await readBoundedFile(file, stat);
      if (!sameFileIdentity(stat, currentStat) || currentStat.nlink !== stat.nlink || currentRaw !== raw) throw storeError(ERROR_CODES.corrupt);
      used.add(name); edges.push(Object.freeze({ file, name, stat, raw, linked: stat.nlink === 2n }));
      certificates.push(candidate.server.certificatePem);
      identity = candidate;
    }
    if (files.some(name => !used.has(name))) throw storeError(ERROR_CODES.corrupt);
    const linkedCount = edges.filter(edge => edge.linked).length;
    const ownedCount = ownedTemporary ? 1 : 0;
    if (temporaryNames.length !== linkedCount + ownedCount || temporaryNames.length > 1 + ownedCount
      || !allowLinked && linkedCount > 0) throw storeError(ERROR_CODES.corrupt);
    await assertCurrentBinding(base.paths, base.incarnation);
    if (!sameFileIdentity(base.stat, await existingFile(base.paths.file)) || await readBoundedFile(base.paths.file, base.stat) !== base.raw) throw storeError(ERROR_CODES.corrupt);
    await assertRenewalBinding(base.paths, base.incarnation, directories);
    return Object.freeze({ identity, certificates: Object.freeze(certificates), edges: Object.freeze(edges), base, directories });
  }

  async function publishRenewal(identityInput, authorize) {
    const history = await readHistory();
    if (!history.identity || !history.base) throw storeError(ERROR_CODES.corrupt);
    let candidate;
    try { candidate = validatedIdentity(validateIdentity, identityInput, ERROR_CODES.invalidIdentity); }
    catch (error) { if (isStoreError(error)) throw error; throw storeError(ERROR_CODES.invalidIdentity); }
    const previous = history.identity;
    if (history.edges.length >= MAX_RENEWAL_GENERATIONS) throw storeError(ERROR_CODES.exists);
    if (JSON.stringify(candidate) === JSON.stringify(previous)) {
      authorize();
      const latest = await readHistory();
      if (!latest.base || !sameFileIdentity(history.base.stat, latest.base.stat)
        || latest.base.raw !== history.base.raw || JSON.stringify(latest.identity) !== JSON.stringify(previous)) throw storeError(ERROR_CODES.corrupt);
      authorize();
      return latest.identity;
    }
    const now = Date.now();
    try {
      const previousDetails = inspectSpsNativeHostIdentity(previous, now);
      const candidateDetails = inspectSpsNativeHostIdentity(candidate, now);
      const previousCertificate = new X509Certificate(previous.server.certificatePem);
      const candidateCertificate = validateSpsNativeServerCertificateTransition({ hostId: previous.hostId,
        predecessorCertificatePem: previous.server.certificatePem, certificatePem: candidate.server.certificatePem });
      const lifetime = Date.parse(previousCertificate.validTo) - Date.parse(previousCertificate.validFrom);
      const window = Math.min(30 * 86_400_000, Math.floor(lifetime / 3));
      if (previousDetails.state !== "identity_prepared" || candidateDetails.state !== "identity_prepared"
        || candidate.hostId !== previous.hostId
        || candidate.server.privateKeyPem !== history.base.identity.server.privateKeyPem
        || candidate.memberIssuer.certificatePem !== history.base.identity.memberIssuer.certificatePem
        || candidate.memberIssuer.privateKeyPem !== history.base.identity.memberIssuer.privateKeyPem
        || Date.parse(previousCertificate.validTo) - now > window
        || !candidateCertificate.raw.equals(new X509Certificate(candidate.server.certificatePem).raw)) throw new Error("identity");
    } catch { throw storeError(ERROR_CODES.invalidIdentity); }
    const predecessor = createHash("sha256").update(new X509Certificate(previous.server.certificatePem).raw).digest("hex");
    const existingEdge = history.edges.find(edge => edge.name === `${predecessor}.json`);
    if (existingEdge) {
      if (candidate.server.certificatePem === previous.server.certificatePem
        && candidate.server.privateKeyPem === previous.server.privateKeyPem) {
        authorize();
        return history.identity;
      }
      throw storeError(ERROR_CODES.exists);
    }
    const paths = history.base.paths, incarnation = history.base.incarnation;
    authorize();
    await assertCurrentBinding(paths, incarnation);
    const parentBeforeCreate = await directoryIdentity(paths.credentialsDirectory);
    const directory = await ensureRenewalDirectory(paths, true);
    const directories = { directory, parent: await directoryIdentity(paths.credentialsDirectory), child: await directoryIdentity(directory) };
    if (!sameDirectoryIdentity(parentBeforeCreate, directories.parent)) throw storeError(ERROR_CODES.storage);
    const filename = `${predecessor}.json`, file = path.join(directory, filename);
    try { await fs.lstat(file); throw storeError(ERROR_CODES.exists); }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    const serialized = encodeRenewalCapsule(history.base.context, predecessor, candidate.server.certificatePem);
    const temporary = path.join(directory, `.host-renewal-${randomUUID()}.tmp`);
    let temporaryIdentity;
    try {
      await assertRenewalBinding(paths, incarnation, directories);
      const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      try { temporaryIdentity = await handle.stat({ bigint: true }); await handle.writeFile(serialized, "utf8"); await handle.sync(); }
      finally { await handle.close(); }
      await assertRenewalBinding(paths, incarnation, directories);
      const currentHistory = await readHistory({ ownedTemporary: { name: path.basename(temporary), identity: temporaryIdentity } });
      if (currentHistory.identity.server.certificatePem !== previous.server.certificatePem
        || !sameFileIdentity(history.base.stat, currentHistory.base.stat) || currentHistory.base.raw !== history.base.raw) throw storeError(ERROR_CODES.corrupt);
      const temporaryStat = await fs.lstat(temporary, { bigint: true });
      if (!temporaryStat.isFile() || temporaryStat.isSymbolicLink() || temporaryStat.nlink !== 1n
        || !sameFileIdentity(temporaryStat, temporaryIdentity)) throw storeError(ERROR_CODES.storage);
      try { await fs.lstat(file); throw storeError(ERROR_CODES.exists); }
      catch (error) { if (error?.code !== "ENOENT") throw error; }
      authorize();
      await assertRenewalBinding(paths, incarnation, directories);
      authorize();
      try { await fs.link(temporary, file); }
      catch (error) { if (error?.code === "EEXIST") throw storeError(ERROR_CODES.exists); throw error; }
      const linkedFinal = await fs.lstat(file, { bigint: true });
      const linkedTemporary = await fs.lstat(temporary, { bigint: true });
      if (!linkedFinal.isFile() || linkedFinal.isSymbolicLink() || linkedFinal.nlink !== 2n
        || !sameFileIdentity(linkedFinal, temporaryIdentity) || !linkedTemporary.isFile()
        || linkedTemporary.isSymbolicLink() || linkedTemporary.nlink !== 2n
        || !sameFileIdentity(linkedTemporary, temporaryIdentity)) throw storeError(ERROR_CODES.storage);
      await assertRenewalBinding(paths, incarnation, directories);
      const linkedRaw = await readBoundedLinkedFile(file, linkedFinal);
      if (decodeRenewalCapsule(linkedRaw, history.base.context, predecessor) !== candidate.server.certificatePem) throw storeError(ERROR_CODES.corrupt);
      authorize();
      await assertRenewalBinding(paths, incarnation, directories);
      await fs.unlink(temporary);
      temporaryIdentity = null;
      await syncDirectory(directory);
      await assertRenewalBinding(paths, incarnation, directories);
      const committed = await readHistory();
      if (committed.identity.server.certificatePem !== candidate.server.certificatePem) throw storeError(ERROR_CODES.corrupt);
      authorize();
      return committed.identity;
    } catch (error) {
      if (isStoreError(error)) throw error;
      throw storeError(ERROR_CODES.storage);
    } finally {
      if (temporaryIdentity) {
        try {
          await assertRenewalBinding(paths, incarnation, directories);
          const stat = await fs.lstat(temporary, { bigint: true });
          if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n
            && sameFileIdentity(stat, temporaryIdentity)) await fs.unlink(temporary);
        } catch { /* Preserve any file whose owned identity is uncertain. */ }
      }
    }
  }

  async function findRenewalAlias(directory, finalStat) {
    const names = await boundedNames(directory, MAX_RENEWAL_GENERATIONS + 1);
    const aliases = [];
    for (const name of names) {
      if (!RENEWAL_TEMPORARY_ALIAS.test(name)) continue;
      let stat;
      try { stat = await fs.lstat(path.join(directory, name), { bigint: true }); }
      catch (error) { if (error?.code === "ENOENT") continue; throw storeError(ERROR_CODES.storage); }
      if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 2n && sameFileIdentity(stat, finalStat)) aliases.push({ name, stat });
    }
    if (aliases.length !== 1) throw storeError(ERROR_CODES.corrupt);
    return aliases[0];
  }

  async function recoverRenewal(authorize) {
    const history = await readHistory({ allowLinked: true });
    if (!history.base) return Object.freeze({ recovered: false });
    const linked = history.edges.filter(edge => edge.linked);
    if (linked.length === 0) return Object.freeze({ recovered: false });
    if (linked.length !== 1) throw storeError(ERROR_CODES.corrupt);
    const edge = linked[0], directories = history.directories;
    const alias = await findRenewalAlias(directories.directory, edge.stat);
    const finalPath = path.join(directories.directory, edge.name);
    const raw = await readBoundedLinkedFile(finalPath, edge.stat);
    const predecessor = edge.name.slice(0, 64);
    const certificatePem = decodeRenewalCapsule(raw, history.base.context, predecessor);
    validateSpsNativeServerCertificateTransition({ hostId: history.base.identity.hostId,
      predecessorCertificatePem: history.certificates.at(-2), certificatePem });
    authorize();
    await assertRenewalBinding(history.base.paths, history.base.incarnation, directories);
    const currentFinal = await fs.lstat(finalPath, { bigint: true });
    const aliasPath = path.join(directories.directory, alias.name);
    const currentAlias = await fs.lstat(aliasPath, { bigint: true });
    if (currentFinal.nlink !== 2n || currentAlias.nlink !== 2n
      || !sameFileIdentity(edge.stat, currentFinal) || !sameFileIdentity(edge.stat, currentAlias)
      || await readBoundedLinkedFile(finalPath, currentFinal) !== raw
      || await readBoundedLinkedFile(aliasPath, currentAlias) !== raw) throw storeError(ERROR_CODES.corrupt);
    authorize();
    await assertRenewalBinding(history.base.paths, history.base.incarnation, directories);
    await fs.unlink(aliasPath);
    await syncDirectory(directories.directory);
    await assertRenewalBinding(history.base.paths, history.base.incarnation, directories);
    const completed = await fs.lstat(finalPath, { bigint: true });
    const completedRaw = await readBoundedFile(finalPath, completed);
    if (!completed.isFile() || completed.isSymbolicLink() || completed.nlink !== 1n
      || !sameFileIdentity(edge.stat, completed) || completedRaw !== raw) throw storeError(ERROR_CODES.corrupt);
    const recovered = await readHistory();
    if (recovered.identity.server.certificatePem !== certificatePem) throw storeError(ERROR_CODES.corrupt);
    authorize();
    return Object.freeze({ recovered: true });
  }

  function commitGuard(options = {}) {
    if (!options || typeof options !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw storeError(ERROR_CODES.options);
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).some(key => key !== "beforeCommit" || !descriptors[key].enumerable
      || !Object.hasOwn(descriptors[key], "value"))) throw storeError(ERROR_CODES.options);
    const guard = descriptors.beforeCommit?.value;
    if (guard !== undefined && typeof guard !== "function") throw storeError(ERROR_CODES.options);
    return () => {
      const result = guard?.();
      if (result !== undefined) {
        if (result instanceof Promise) void result.catch(() => {});
        throw storeError(ERROR_CODES.options);
      }
    };
  }

  return Object.freeze({
    inspectPresence() {
      return serialize(async () => {
        const paths = await safePresencePaths();
        if (!paths) return Object.freeze({ state: "absent" });
        try {
          await fs.lstat(paths.file);
          return Object.freeze({ state: "present" });
        } catch (error) {
          if (error?.code === "ENOENT") {
            try {
              await fs.lstat(paths.renewalDirectory);
              return Object.freeze({ state: "present" });
            } catch (renewalError) {
              if (renewalError?.code === "ENOENT") return Object.freeze({ state: "absent" });
              throw storeError(ERROR_CODES.storage);
            }
          }
          throw storeError(ERROR_CODES.storage);
        }
      });
    },

    read() {
      return serialize(async () => (await readHistory()).identity);
    },

    readServerCertificates() {
      return serialize(async () => (await readHistory()).certificates);
    },

    publishServerRenewal(identity, options = {}) {
      const authorize = commitGuard(options);
      return serialize(async () => {
        try { return await publishRenewal(identity, authorize); }
        catch (error) { if (isStoreError(error)) throw error; throw storeError(ERROR_CODES.storage); }
      });
    },

    recoverInterruptedServerRenewal(options = {}) {
      const authorize = commitGuard(options);
      return serialize(async () => {
        try { return await recoverRenewal(authorize); }
        catch (error) { if (isStoreError(error)) throw error; throw storeError(ERROR_CODES.storage); }
      });
    },

    create(identity, options = {}) {
      if (!options || typeof options !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) {
        throw storeError(ERROR_CODES.options);
      }
      const descriptors = Object.getOwnPropertyDescriptors(options);
      if (Reflect.ownKeys(descriptors).some(key => key !== "beforeCommit" || !descriptors[key].enumerable
        || !Object.hasOwn(descriptors[key], "value"))) throw storeError(ERROR_CODES.options);
      const authorizeCommit = descriptors.beforeCommit?.value;
      if (authorizeCommit !== undefined && typeof authorizeCommit !== "function") throw storeError(ERROR_CODES.options);
      const requireCommitAuthority = () => {
        const authorized = authorizeCommit?.();
        if (authorized !== undefined) {
          if (authorized instanceof Promise) void authorized.catch(() => {});
          throw storeError(ERROR_CODES.options);
        }
      };
      return serialize(async () => {
        const validated = validatedIdentity(validateIdentity, identity, ERROR_CODES.invalidIdentity);
        let identityJson;
        try {
          identityJson = JSON.stringify(validated);
        } catch {
          throw storeError(ERROR_CODES.invalidIdentity);
        }
        if (typeof identityJson !== "string") throw storeError(ERROR_CODES.invalidIdentity);
        let canonicalIdentity;
        try {
          canonicalIdentity = JSON.parse(identityJson);
        } catch {
          throw storeError(ERROR_CODES.invalidIdentity);
        }
        const binding = await safeBinding(true);
        if (!binding) throw storeError(ERROR_CODES.storage);
        const { paths, incarnation } = binding;
        let current;
        try {
          current = await existingFile(paths.file, { rejectInvalid: false });
        } catch {
          throw storeError(ERROR_CODES.storage);
        }
        if (current) throw storeError(ERROR_CODES.exists);
        await assertNoRenewalSlot(paths);

        const plaintext = JSON.stringify({
          v: STORE_VERSION,
          kind: STORE_KIND,
          context: {
            userDataDirectory: paths.userDataDirectory,
            vaultDirectory: paths.vaultDirectory,
            vaultIncarnation: incarnation,
          },
          identity: canonicalIdentity,
        });
        if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) throw storeError(ERROR_CODES.invalidIdentity);

        let encrypted;
        try {
          encrypted = safeStorage.encryptString(plaintext);
        } catch {
          throw storeError(ERROR_CODES.storage);
        }
        if (!Buffer.isBuffer(encrypted) || encrypted.length === 0 || encrypted.length > MAX_CIPHERTEXT_BYTES) {
          throw storeError(ERROR_CODES.storage);
        }
        const serialized = JSON.stringify({ v: STORE_VERSION, kind: STORE_KIND, ciphertext: encrypted.toString("base64") });
        if (Buffer.byteLength(serialized, "utf8") > MAX_FILE_BYTES) throw storeError(ERROR_CODES.storage);

        const temporary = path.join(paths.credentialsDirectory, `.host-identity-${randomUUID()}.tmp`);
        let temporaryIdentity;
        try {
          await assertCurrentBinding(paths, incarnation, true);
          const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
          try {
            temporaryIdentity = await handle.stat();
            await handle.writeFile(serialized, "utf8");
            await handle.sync();
          } finally {
            await handle.close();
          }
          await assertCurrentBinding(paths, incarnation);
          const temporaryStat = await fs.lstat(temporary);
          if (!temporaryStat.isFile() || temporaryStat.isSymbolicLink() || temporaryStat.nlink !== 1
            || !sameFileIdentity(temporaryStat, temporaryIdentity)) throw storeError(ERROR_CODES.storage);
          const finalStat = await existingFile(paths.file, { rejectInvalid: false });
          if (finalStat) throw storeError(ERROR_CODES.exists);
          await assertNoRenewalSlot(paths);
          requireCommitAuthority();
          await assertCurrentBinding(paths, incarnation);
          // Check both the filesystem and authority again; neither check grants access.
          requireCommitAuthority();
          try {
            await fs.link(temporary, paths.file);
          } catch (error) {
            if (error?.code === "EEXIST") throw storeError(ERROR_CODES.exists);
            throw error;
          }
          // A crash between link and unlink leaves a two-link slot; reads reject it and never repair or overwrite it.
          const afterCommit = await assertCurrentBinding(paths, incarnation);
          const linkedStat = await fs.lstat(paths.file);
          const temporaryAfterLink = await fs.lstat(temporary);
          if (!afterCommit || afterCommit.file !== paths.file || !linkedStat.isFile() || linkedStat.isSymbolicLink()
            || linkedStat.nlink !== 2 || !sameFileIdentity(linkedStat, temporaryIdentity)
            || !temporaryAfterLink.isFile() || temporaryAfterLink.isSymbolicLink()
            || temporaryAfterLink.nlink !== 2 || !sameFileIdentity(temporaryAfterLink, temporaryIdentity)) {
            throw storeError(ERROR_CODES.storage);
          }
          await assertCurrentBinding(paths, incarnation);
          await fs.unlink(temporary);
          temporaryIdentity = null;
          await assertCurrentBinding(paths, incarnation);
          await syncDirectory(paths.credentialsDirectory);
          await assertCurrentBinding(paths, incarnation);
          return validated;
        } catch (error) {
          if (isStoreError(error)) throw error;
          throw storeError(ERROR_CODES.storage);
        } finally {
          await cleanupOwnedTemporary(temporary, temporaryIdentity, paths.userDataDirectory, paths.credentialsDirectory, paths.file);
        }
      });
    },
  });
}
