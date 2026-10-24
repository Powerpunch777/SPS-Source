import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const ARTIFACT_PREFIX = "live-builder-failure-";
const ALLOWED_FILES = [
  "dist/manifest.js",
  "dist/ui/index.js",
  "package.json",
  "sps-plugin.json",
];

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function assertSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0
    || relativePath.startsWith("/") || relativePath.startsWith("\\")
    || /^[a-z]:/i.test(relativePath) || relativePath.includes("\\") || relativePath.includes("\0")) {
    throw new Error("Failure artifact contains an unsafe relative path.");
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Failure artifact contains an unsafe relative path.");
  }
  return segments;
}

function sameFileIdentity(left, right) {
  return left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
    && (left.dev === undefined || right.dev === undefined || left.dev === right.dev)
    && (left.ino === undefined || right.ino === undefined || left.ino === right.ino)
    && (left.nlink === undefined || right.nlink === undefined || left.nlink === right.nlink);
}

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readFixtureFile(fixtureRoot, fixtureRealPath, relativePath) {
  const segments = assertSafeRelativePath(relativePath);
  let current = fixtureRoot;
  let expectedStat;

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    expectedStat = await lstatOrNull(current);
    if (!expectedStat) return null;
    if (expectedStat.isSymbolicLink()) throw new Error("Failure fixture contains a linked entry.");
    if (index < segments.length - 1) {
      if (!expectedStat.isDirectory()) throw new Error("Failure fixture path has a non-directory parent.");
    } else {
      if (!expectedStat.isFile() || (expectedStat.nlink !== undefined && expectedStat.nlink !== 1)) {
        throw new Error("Failure fixture entries must be unlinked regular files.");
      }
      if (expectedStat.size > MAX_FILE_BYTES) throw new Error("Failure fixture file exceeds the 256 KiB limit.");
    }
    const resolved = await realpath(current);
    if (!inside(fixtureRealPath, resolved)) throw new Error("Failure fixture entry resolves outside the fixture root.");
  }

  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(current, flags);
  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile() || (openedStat.nlink !== undefined && openedStat.nlink !== 1)
      || !sameFileIdentity(expectedStat, openedStat)) {
      throw new Error("Failure fixture file changed during capture.");
    }
    const resolved = await realpath(current);
    if (!inside(fixtureRealPath, resolved)) throw new Error("Failure fixture entry resolves outside the fixture root.");

    const chunks = [];
    let sizeBytes = 0;
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) {
      sizeBytes += chunk.length;
      if (sizeBytes > MAX_FILE_BYTES) throw new Error("Failure fixture file exceeds the 256 KiB limit.");
      chunks.push(chunk);
    }
    const finalStat = await handle.stat();
    if (!sameFileIdentity(openedStat, finalStat) || sizeBytes !== finalStat.size) {
      throw new Error("Failure fixture file changed during capture.");
    }
    return { relativePath, contents: Buffer.concat(chunks, sizeBytes), sizeBytes };
  } finally {
    await handle.close();
  }
}

async function validateDesktopDist(desktopRoot) {
  if (typeof desktopRoot !== "string" || desktopRoot.length === 0) {
    throw new TypeError("Desktop root must be a non-empty path.");
  }
  const desktopPath = path.resolve(desktopRoot);
  const desktopStat = await lstat(desktopPath);
  if (!desktopStat.isDirectory() || desktopStat.isSymbolicLink()) {
    throw new Error("Desktop root must be a real directory.");
  }
  const desktopRealPath = await realpath(desktopPath);
  const distPath = path.join(desktopPath, "dist");
  await mkdir(distPath, { recursive: true, mode: 0o700 });
  const distStat = await lstat(distPath);
  if (!distStat.isDirectory() || distStat.isSymbolicLink()) {
    throw new Error("Desktop dist must be a real directory.");
  }
  const distRealPath = await realpath(distPath);
  if (path.dirname(distRealPath) !== desktopRealPath || !inside(desktopRealPath, distRealPath)) {
    throw new Error("Desktop dist must resolve directly inside the desktop root.");
  }
  return distRealPath;
}

async function removeFreshArtifact(target, distRoot) {
  if (path.dirname(path.resolve(target)) !== distRoot || !path.basename(target).startsWith(ARTIFACT_PREFIX)) {
    throw new Error("Refusing to remove an artifact outside the dedicated failure-artifact directory.");
  }
  const targetStat = await lstatOrNull(target);
  if (!targetStat) return;
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error("Refusing to remove a non-directory failure artifact.");
  }
  const targetRealPath = await realpath(target);
  if (path.dirname(targetRealPath) !== distRoot || !inside(distRoot, targetRealPath)) {
    throw new Error("Refusing to remove a failure artifact outside desktop dist.");
  }
  await rm(target, { recursive: true, force: false });
}

async function validateFreshArtifact(target, distRoot) {
  if (path.dirname(path.resolve(target)) !== distRoot || !path.basename(target).startsWith(ARTIFACT_PREFIX)) {
    throw new Error("Failure artifact must be a direct child of desktop dist.");
  }
  const targetStat = await lstat(target);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error("Failure artifact must be a real directory.");
  }
  const targetRealPath = await realpath(target);
  if (path.dirname(targetRealPath) !== distRoot || !inside(distRoot, targetRealPath)) {
    throw new Error("Failure artifact must resolve directly inside desktop dist.");
  }
}

export async function captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot } = {}) {
  if (typeof fixtureRoot !== "string" || fixtureRoot.length === 0) {
    throw new TypeError("Failure fixture root must be a non-empty path.");
  }
  const fixturePath = path.resolve(fixtureRoot);
  const fixtureStat = await lstat(fixturePath);
  if (!fixtureStat.isDirectory() || fixtureStat.isSymbolicLink()) {
    throw new Error("Failure fixture root must be a real directory.");
  }
  const fixtureRealPath = await realpath(fixturePath);
  const files = [];
  let totalBytes = 0;
  for (const relativePath of ALLOWED_FILES) {
    const file = await readFixtureFile(fixturePath, fixtureRealPath, relativePath);
    if (!file) continue;
    totalBytes += file.sizeBytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Failure fixture exceeds the 1 MiB total limit.");
    file.sha256 = createHash("sha256").update(file.contents).digest("hex");
    files.push(file);
  }

  const distRoot = await validateDesktopDist(desktopRoot);
  const artifactPath = await mkdtemp(path.join(distRoot, ARTIFACT_PREFIX));
  try {
    await validateFreshArtifact(artifactPath, distRoot);
    for (const file of files) {
      const destination = path.join(artifactPath, ...assertSafeRelativePath(file.relativePath));
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, file.contents, { flag: "wx", mode: 0o600 });
    }
    const metadata = {
      schemaVersion: 1,
      artifactKind: "live-builder-failure",
      visibility: "private",
      result: "development-failure",
      previewVerified: false,
      success: false,
      capturedAt: new Date().toISOString(),
      files: files.map(({ relativePath, sizeBytes, sha256 }) => ({ path: relativePath, sizeBytes, sha256 })),
    };
    await writeFile(path.join(artifactPath, "artifact.json"), `${JSON.stringify(metadata, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return { artifactPath, metadata };
  } catch (error) {
    await removeFreshArtifact(artifactPath, distRoot);
    throw error;
  }
}
