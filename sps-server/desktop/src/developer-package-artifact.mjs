import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

const MAX_ARTIFACT_SIZE_BYTES = 512 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isContainedPath(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function assertDirectoryStat(stat, label) {
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Developer package ${label} must be a real directory`);
  }
}

function assertRegularFileStat(stat) {
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("Developer package artifact must be a regular file");
  }
  if (stat.size < 1) throw new Error("Developer package artifact must not be empty");
  if (stat.size > MAX_ARTIFACT_SIZE_BYTES) throw new Error("Developer package artifact exceeds 512 MiB");
}

function sameFileVersion(expected, actual) {
  if (!actual.isFile()
    || expected.size !== actual.size
    || expected.mtimeMs !== actual.mtimeMs
    || expected.ctimeMs !== actual.ctimeMs
    || expected.birthtimeMs !== actual.birthtimeMs) return false;

  for (const key of ["dev", "ino"]) {
    const first = expected[key];
    const second = actual[key];
    if (Number.isFinite(first) && Number.isFinite(second) && first !== 0 && second !== 0 && first !== second) {
      return false;
    }
  }
  return true;
}

async function inspectArtifactPath(rootPath, expectedRelativePath, expectedRootRealPath) {
  const rootStat = await lstat(rootPath);
  assertDirectoryStat(rootStat, "vault root");
  const rootRealPath = await realpath(rootPath);
  if (expectedRootRealPath && rootRealPath !== expectedRootRealPath) {
    throw new Error("Developer package vault root changed during verification");
  }

  let directoryPath = rootPath;
  for (const component of ["developer-mode", "builds"]) {
    directoryPath = path.join(directoryPath, component);
    const directoryStat = await lstat(directoryPath);
    assertDirectoryStat(directoryStat, "artifact parent");
    const directoryRealPath = await realpath(directoryPath);
    if (!isContainedPath(rootRealPath, directoryRealPath)) {
      throw new Error("Developer package artifact parent escapes the vault root");
    }
  }

  const filePath = path.resolve(rootPath, ...expectedRelativePath.split("/"));
  const fileStat = await lstat(filePath);
  assertRegularFileStat(fileStat);
  const fileRealPath = await realpath(filePath);
  if (!isContainedPath(rootRealPath, fileRealPath)) {
    throw new Error("Developer package artifact escapes the vault root");
  }

  return { rootRealPath, filePath, fileRealPath, fileStat };
}

/** Resolves and verifies a persisted last-known-good developer package archive. */
export async function resolveDeveloperPackageArtifact({ vaultRoot, build } = {}) {
  if (typeof vaultRoot !== "string" || vaultRoot.length === 0 || !path.isAbsolute(vaultRoot)) {
    throw new Error("Developer package vault root must be an absolute path");
  }
  if (!build || typeof build !== "object" || Array.isArray(build)
    || typeof build.buildId !== "string" || !/^build-[0-9a-f-]+$/i.test(build.buildId)
    || !UUID_PATTERN.test(build.buildId.slice("build-".length))) {
    throw new Error("Developer package build ID is invalid");
  }
  const deployment = build.deployment;
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)
    || typeof deployment.artifactSha256 !== "string" || !SHA256_PATTERN.test(deployment.artifactSha256)) {
    throw new Error("Developer package artifact fingerprint is invalid");
  }

  const sha256 = deployment.artifactSha256;
  const expectedRelativePath = `developer-mode/builds/${sha256}.spsplugin`;
  if (deployment.archiveRelativePath !== expectedRelativePath) {
    throw new Error("Developer package archive path does not match its artifact fingerprint");
  }

  const rootPath = path.resolve(vaultRoot);
  const initial = await inspectArtifactPath(rootPath, expectedRelativePath);
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const fileHandle = await open(initial.filePath, constants.O_RDONLY | noFollow);
  let stream;

  try {
    const openedStat = await fileHandle.stat();
    if (!sameFileVersion(initial.fileStat, openedStat)) {
      throw new Error("Developer package artifact changed before verification");
    }

    const hash = createHash("sha256");
    let sizeBytes = 0;
    stream = fileHandle.createReadStream({ autoClose: false, highWaterMark: 64 * 1024 });
    for await (const chunk of stream) {
      sizeBytes += chunk.length;
      if (sizeBytes > MAX_ARTIFACT_SIZE_BYTES) {
        throw new Error("Developer package artifact exceeds 512 MiB");
      }
      hash.update(chunk);
    }

    const digest = hash.digest("hex");
    const finalHandleStat = await fileHandle.stat();
    const finalPath = await inspectArtifactPath(rootPath, expectedRelativePath, initial.rootRealPath);
    if (!sameFileVersion(openedStat, finalHandleStat)
      || !sameFileVersion(initial.fileStat, finalPath.fileStat)
      || !sameFileVersion(finalHandleStat, finalPath.fileStat)
      || finalPath.fileRealPath !== initial.fileRealPath
      || sizeBytes !== initial.fileStat.size) {
      throw new Error("Developer package artifact changed during verification");
    }
    if (digest !== sha256) throw new Error("Developer package artifact fingerprint does not match");

    return {
      archivePath: finalPath.fileRealPath,
      fileName: path.basename(finalPath.filePath),
      sha256: digest,
      sizeBytes,
      buildId: build.buildId,
    };
  } finally {
    stream?.destroy();
    await fileHandle.close();
  }
}
