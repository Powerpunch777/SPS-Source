import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import path from "node:path";

const MAX_FILES = 256;
const MAX_DIRECTORIES = 512;
const MAX_DIRECTORY_DEPTH = 32;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const IGNORED_ROOT_ENTRIES = new Set(["node_modules", ".git"]);
const REQUIRED_CHANGED_PATHS = [
  "dist/manifest.js",
  "dist/ui/index.js",
  "package.json",
  "sps-plugin.json",
];
const SHA256 = /^[a-f0-9]{64}$/;

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function sameFileIdentity(left, right) {
  return left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && (left.dev === undefined || right.dev === undefined || left.dev === right.dev)
    && (left.ino === undefined || right.ino === undefined || left.ino === right.ino);
}

function safeSnapshotPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[a-z]:/i.test(value) || value.includes("\\") || value.includes("\0")) return false;
  const segments = value.split("/");
  return !IGNORED_ROOT_ENTRIES.has(segments[0])
    && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("Authoring snapshots must be plain path-to-SHA-256 maps.");
  }
  const prototype = Object.getPrototypeOf(snapshot);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Authoring snapshots must be plain path-to-SHA-256 maps.");
  }
  const keys = Reflect.ownKeys(snapshot);
  if (keys.length > MAX_FILES) throw new TypeError("Authoring snapshots exceed the entry-count limit.");
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(snapshot, key);
    if (typeof key !== "string" || !safeSnapshotPath(key) || !descriptor?.enumerable
      || !("value" in descriptor) || typeof descriptor.value !== "string" || !SHA256.test(descriptor.value)) {
      throw new TypeError("Authoring snapshots contain an unsafe path or hash.");
    }
  }
}

async function hashRegularFile(filePath, expectedStat, rootRealPath, relativePath) {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(filePath, flags);
  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile() || !sameFileIdentity(expectedStat, openedStat)) {
      throw new Error("Project file changed during snapshot collection.");
    }
    const resolvedFile = await realpath(filePath);
    if (!inside(rootRealPath, resolvedFile)) throw new Error("Project file resolves outside the snapshot root.");

    const hash = createHash("sha256");
    let bytes = 0;
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > MAX_FILE_BYTES) throw new Error("Project file exceeds the snapshot size limit.");
      hash.update(chunk);
    }
    const finalStat = await handle.stat();
    if (!sameFileIdentity(openedStat, finalStat) || bytes !== finalStat.size) {
      throw new Error("Project file changed during snapshot collection.");
    }
    return { sha256: hash.digest("hex"), sizeBytes: bytes, relativePath };
  } finally {
    await handle.close();
  }
}

export function buildLiveBuilderPrompt() {
  return [
    "You are authoring a small, real UI fixture in the external public SPS Plugin SDK starter already opened as your working directory. Create the UI yourself; do not ask the harness or another process to generate it.",
    "",
    "Build a page titled exactly \"Builder Preview Fixture\" with a real counter button. Use React createElement and useState (no JSX requirement). The button must have id=\"builder-fixture-count\", initially show \"Count: 0\", and after one click show \"Count: 1\".",
    "",
    "Declare the UI entrypoint as entrypoints.ui: \"./dist/ui\" in dist/manifest.js. Register one page slot for routePath \"builder-fixture\" with exportName \"BuilderFixture\". Declare exactly the needed capabilities plugin.state.read and ui.page.register in the runtime and static manifests.",
    "",
    "Keep the package metadata valid: package.json files must include dist/ui; sps-plugin.json must have the matching capabilities, permissionsDigest computed with the installed SDK export calculateStaticCapabilitiesDigest from @sonparkserver/plugin-sdk/registry/static-package-manifest-v1.mjs, and runtime.manifestSha256 equal to SHA-256 of the exact dist/manifest.js bytes (use Node's built-in crypto). Preserve the starter's other required metadata.",
    "This fixture needs no Core primitives. Preserve sps exactly as { contractVersion: \"2.0\", primitives: [] }; do not add object-valued or other primitive declarations. Static package validation does not replace the Core runtime schema check performed when Preview loads the plugin.",
    "",
    "Modify only these four existing/new project files: package.json, sps-plugin.json, dist/manifest.js, and dist/ui/index.js. Do not modify or create any other file, including worker files. Do not add dependencies or use the network; do not install, publish, change Source, access paths outside this project, or perform any production/Core operation.",
    "",
    "The harness compares bounded before/after file hashes after authoring. That comparison detects unexpected changes; it is not a sandbox or filesystem permission boundary. Stay within the allowed files regardless.",
  ].join("\n");
}

export async function collectAuthoringSnapshot(root) {
  if (typeof root !== "string" || root.length === 0) throw new TypeError("Snapshot root must be a non-empty path.");
  const rootPath = path.resolve(root);
  const rootStat = await lstat(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Snapshot root must be a real directory.");
  const rootRealPath = await realpath(rootPath);
  const entries = Object.create(null);
  let fileCount = 0;
  let directoryCount = 1;
  let totalBytes = 0;

  async function visit(directory, segments, depth) {
    for await (const child of await opendir(directory)) {
      if (segments.length === 0 && IGNORED_ROOT_ENTRIES.has(child.name)) continue;
      const childPath = path.join(directory, child.name);
      const childSegments = [...segments, child.name];
      const relativePath = childSegments.join("/");
      if (!safeSnapshotPath(relativePath)) throw new Error("Project contains an unsafe relative path.");
      const childStat = await lstat(childPath);
      if (childStat.isSymbolicLink()) throw new Error("Project contains a linked entry outside the ignored root directories.");
      if (childStat.isDirectory()) {
        if (depth + 1 > MAX_DIRECTORY_DEPTH) throw new Error("Project exceeds the snapshot directory-depth limit.");
        directoryCount += 1;
        if (directoryCount > MAX_DIRECTORIES) throw new Error("Project exceeds the snapshot directory-count limit.");
        const resolvedDirectory = await realpath(childPath);
        if (!inside(rootRealPath, resolvedDirectory)) throw new Error("Project directory resolves outside the snapshot root.");
        await visit(childPath, childSegments, depth + 1);
        continue;
      }
      if (!childStat.isFile()) throw new Error("Project contains a non-regular filesystem entry.");
      fileCount += 1;
      if (fileCount > MAX_FILES) throw new Error("Project exceeds the snapshot file-count limit.");
      if (childStat.size > MAX_FILE_BYTES) throw new Error("Project file exceeds the snapshot size limit.");
      if (totalBytes + childStat.size > MAX_TOTAL_BYTES) throw new Error("Project exceeds the total snapshot size limit.");

      const result = await hashRegularFile(childPath, childStat, rootRealPath, relativePath);
      totalBytes += result.sizeBytes;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Project exceeds the total snapshot size limit.");
      entries[relativePath] = result.sha256;
    }
  }

  await visit(rootPath, [], 0);
  return Object.fromEntries(Object.keys(entries).sort().map((key) => [key, entries[key]]));
}

export function verifyLiveBuilderChanges(before, after) {
  validateSnapshot(before);
  validateSnapshot(after);

  for (const filePath of Object.keys(before)) {
    if (!Object.hasOwn(after, filePath)) throw new Error("Live Builder authoring deleted a project file.");
  }

  const changedPaths = Object.keys(after)
    .filter((filePath) => !Object.hasOwn(before, filePath) || before[filePath] !== after[filePath])
    .sort();
  if (changedPaths.some((filePath) => !REQUIRED_CHANGED_PATHS.includes(filePath))) {
    throw new Error("Live Builder authoring changed a file outside the allowlist.");
  }
  if (changedPaths.length !== REQUIRED_CHANGED_PATHS.length
    || REQUIRED_CHANGED_PATHS.some((filePath) => !changedPaths.includes(filePath))) {
    throw new Error("Live Builder authoring must change all four required project files.");
  }
  return changedPaths;
}
