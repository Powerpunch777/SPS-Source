import { createHash } from "node:crypto";

const fail = () => new Error("Legacy installer residue cannot be safely planned.");
const digest = /^[a-f0-9]{64}$/;
const runtime = "resources/sps-owner-host-runtime";
const installerSha256 = "d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56";
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function record(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length
    || !keys.every(key => Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], "value"))) throw fail();
  return value;
}

function relative(value, directory = false) {
  if (directory && value === ".") return value;
  if (typeof value !== "string" || value.length === 0 || value.length > 32760) throw fail();
  const parts = value.split("/");
  if (parts.length > 65 || parts.some(part => !part || part.length > 255 || part === "." || part === ".." || /[<>:"\\|?*\x00-\x1f]/.test(part)
    || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(part))) throw fail();
  return value;
}

function snapshot(input) {
  record(input, ["rootIdentity", "files", "directories", "bytes", "sha256"]);
  record(input.rootIdentity, ["dev", "ino", "birthtimeNs"]);
  if (!Object.values(input.rootIdentity).every(value => typeof value === "string" && /^\d{1,64}$/.test(value))
    || !Array.isArray(input.files) || !Array.isArray(input.directories)
    || input.files.length + input.directories.length > 100_000
    || !Number.isSafeInteger(input.bytes) || input.bytes < 0 || input.bytes > 4 * 1024 ** 3
    || typeof input.sha256 !== "string" || !digest.test(input.sha256)) throw fail();
  const names = new Set();
  let pathBytes = 0;
  const add = name => {
    pathBytes += Buffer.byteLength(name, "utf8");
    if (pathBytes > 8 * 1024 ** 2) throw fail();
    const folded = name.toLowerCase();
    if (names.has(folded)) throw fail();
    names.add(folded);
  };
  const directories = new Set();
  for (const item of input.directories) {
    record(item, ["path"]);
    const name = relative(item.path, true);
    add(name);
    directories.add(name);
  }
  if (!directories.has(".")) throw fail();
  let bytes = 0;
  const files = new Map();
  for (const item of input.files) {
    record(item, ["path", "size", "sha256"]);
    const name = relative(item.path);
    if (!Number.isSafeInteger(item.size) || item.size < 0 || typeof item.sha256 !== "string" || !digest.test(item.sha256)) throw fail();
    bytes += item.size;
    if (bytes > 4 * 1024 ** 3) throw fail();
    add(name);
    files.set(name, { path: name, size: item.size, sha256: item.sha256 });
  }
  for (const name of [...directories, ...files.keys()]) {
    if (name === ".") continue;
    const parent = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : ".";
    if (!directories.has(parent)) throw fail();
  }
  if (bytes !== input.bytes) throw fail();
  const entries = [
    ...[...files.values()].map(file => ({ path: file.path, type: "file", size: file.size, sha256: file.sha256 })),
    ...[...directories].map(name => ({ path: name, type: "directory", size: 0, sha256: "" })),
  ].sort((a, b) => ordinal(a.path, b.path) || ordinal(a.type, b.type));
  if (createHash("sha256").update(JSON.stringify(entries)).digest("hex") !== input.sha256) throw fail();
  return { rootIdentity: { ...input.rootIdentity }, files, directories, bytes, sha256: input.sha256 };
}

export function encodeLegacyProgramInventory(input) {
  try {
    const verified = snapshot(input);
    const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, sourceVersion: "0.4.86", installerSha256,
      contentSha256: verified.sha256, bytes: verified.bytes,
      files: [...verified.files.values()].sort((a, b) => ordinal(a.path, b.path)),
      directories: [...verified.directories].sort(ordinal) })}\n`, "utf8");
    if (bytes.length > 16 * 1024 ** 2) throw fail();
    return bytes;
  } catch { throw fail(); }
}

// This is a content allowlist, never authorization or a filesystem remover.
// Installer integration must independently bind its target, trusted package
// inventory, actual process/registry state and real user consent. A snapshot
// alone cannot establish that a file belongs to the original package.
export function planLegacyInstallerResidue(input) {
  try {
    record(input, ["version", "automaticReplacementFailed", "ordinaryUninstallExitCode", "registrationCount", "desktopProcessCount", "before", "remaining"]);
    if (input.version !== "0.4.86" || input.automaticReplacementFailed !== true
      || input.ordinaryUninstallExitCode !== 0 || input.registrationCount !== 0 || input.desktopProcessCount !== 0) throw fail();
    const before = snapshot(input.before);
    const remaining = snapshot(input.remaining);
    if (!["dev", "ino", "birthtimeNs"].every(key => before.rootIdentity[key] === remaining.rootIdentity[key])
      || remaining.files.size === 0) throw fail();
    for (const [name, file] of remaining.files) {
      const original = before.files.get(name);
      if (!name.startsWith(`${runtime}/`) || !original || original.size !== file.size || original.sha256 !== file.sha256) throw fail();
    }
    for (const name of remaining.directories) {
      if (!before.directories.has(name)
        || !(name === "." || name === "resources" || name === runtime || name.startsWith(`${runtime}/`))) throw fail();
    }
    const files = [...remaining.files.values()].sort((a, b) => ordinal(a.path, b.path)).map(file => Object.freeze(file));
    const depth = name => name === "." ? 0 : name.split("/").length;
    const directories = [...remaining.directories].sort((a, b) => depth(b) - depth(a) || ordinal(a, b));
    return Object.freeze({ schemaVersion: 1, sourceVersion: "0.4.86", beforeSha256: before.sha256,
      remainingSha256: remaining.sha256, rootIdentity: Object.freeze(remaining.rootIdentity),
      files: Object.freeze(files), directories: Object.freeze(directories), bytes: remaining.bytes,
      requiresUserConfirmation: true });
  } catch { throw fail(); }
}
