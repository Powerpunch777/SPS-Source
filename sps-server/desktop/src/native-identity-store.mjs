import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { validateSpsNativeHostIdentity } from "./native-identity-certificates.mjs";

const STORE_KIND = "sps.native.host-identity-store";
const STORE_VERSION = 2;
const MAX_PLAINTEXT_BYTES = 256 * 1024;
const MAX_CIPHERTEXT_BYTES = 512 * 1024;
const MAX_FILE_BYTES = 700 * 1024;
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
    && left.file === right.file;
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
    const before = await handle.stat();
    const openedPath = await fs.lstat(file);
    if (!before.isFile() || before.nlink !== 1 || before.size > MAX_FILE_BYTES
      || !sameFileIdentity(expectedStat, before) || !openedPath.isFile() || openedPath.isSymbolicLink()
      || openedPath.nlink !== 1 || !sameFileIdentity(before, openedPath)) throw storeError(ERROR_CODES.corrupt);
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const result = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    const after = await handle.stat();
    const finalPath = await fs.lstat(file);
    if (bytesRead > MAX_FILE_BYTES || after.size !== before.size || after.nlink !== 1
      || !sameFileIdentity(before, after) || !finalPath.isFile() || finalPath.isSymbolicLink()
      || finalPath.nlink !== 1 || !sameFileIdentity(after, finalPath)) throw storeError(ERROR_CODES.corrupt);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead));
    } catch {
      throw storeError(ERROR_CODES.corrupt);
    }
  } finally {
    await handle?.close();
  }
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

  return Object.freeze({
    inspectPresence() {
      return serialize(async () => {
        const paths = await safePresencePaths();
        if (!paths) return Object.freeze({ state: "absent" });
        try {
          await fs.lstat(paths.file);
          return Object.freeze({ state: "present" });
        } catch (error) {
          if (error?.code === "ENOENT") return Object.freeze({ state: "absent" });
          throw storeError(ERROR_CODES.storage);
        }
      });
    },

    read() {
      return serialize(async () => {
        const binding = await safeBinding(false);
        if (!binding) return null;
        const { paths, incarnation } = binding;
        let stat;
        try {
          stat = await existingFile(paths.file);
        } catch (error) {
          if (isStoreError(error)) throw error;
          throw storeError(ERROR_CODES.storage);
        }
        if (!stat) {
          await assertCurrentBinding(paths, incarnation);
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
            || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(outer.ciphertext)) {
            throw storeError(ERROR_CODES.corrupt);
          }
          const encrypted = Buffer.from(outer.ciphertext, "base64");
          if (encrypted.length === 0 || encrypted.length > MAX_CIPHERTEXT_BYTES
            || encrypted.toString("base64") !== outer.ciphertext) throw storeError(ERROR_CODES.corrupt);
          const plaintext = safeStorage.decryptString(encrypted);
          const envelope = parseCanonicalJson(plaintext, ["v", "kind", "context", "identity"]);
          const context = envelope.context;
          const contextIncarnation = context?.vaultIncarnation;
          if (envelope.v !== STORE_VERSION || envelope.kind !== STORE_KIND
            || !context || typeof context !== "object" || Array.isArray(context)
            || Object.keys(context).join(",") !== "userDataDirectory,vaultDirectory,vaultIncarnation"
            || context.userDataDirectory !== paths.userDataDirectory
            || context.vaultDirectory !== paths.vaultDirectory
            || !contextIncarnation || typeof contextIncarnation !== "object" || Array.isArray(contextIncarnation)
            || Object.keys(contextIncarnation).join(",") !== "dev,ino,birthtimeNs"
            || contextIncarnation.dev !== incarnation.dev || contextIncarnation.ino !== incarnation.ino
            || contextIncarnation.birthtimeNs !== incarnation.birthtimeNs) throw storeError(ERROR_CODES.corrupt);
          identity = validatedIdentity(validateIdentity, envelope.identity, ERROR_CODES.corrupt);
        } catch (error) {
          if (error?.code === ERROR_CODES.corrupt) throw error;
          throw storeError(ERROR_CODES.corrupt);
        }
        await assertCurrentBinding(paths, incarnation);
        return identity;
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
