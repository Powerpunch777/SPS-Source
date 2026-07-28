import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { extractPluginArchive } from "@sonparkserver/plugin-sdk/registry/package-extractor-v1.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertRegistrySource(source) {
  if (!isPlainObject(source)) throw new Error("Registry source is required.");
  if (typeof source.registryId !== "string" || source.registryId.trim().length === 0) {
    throw new Error("Registry source registryId is required.");
  }
  if (!new Set(["local", "git", "official"]).has(source.kind)) {
    throw new Error("Registry source kind is invalid.");
  }
  if (typeof source.releaseLocator !== "string" || source.releaseLocator.trim().length === 0) {
    throw new Error("Registry source releaseLocator is required.");
  }
}

function equalCapabilities(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((capability, index) => capability === sortedRight[index]);
}

function assertExpectedRelease(extraction, expectedRelease) {
  if (!expectedRelease) return;
  const staticManifest = extraction.inspection?.package?.staticManifest;
  if (!staticManifest) throw new Error("Registry package has no inspected static manifest.");
  if (expectedRelease.pluginId !== staticManifest.plugin.id || expectedRelease.version !== staticManifest.plugin.version) {
    throw new Error("Registry package identity does not match the signed release record.");
  }
  if (expectedRelease.permissionsDigest !== staticManifest.permissionsDigest) {
    throw new Error("Registry package permissions digest does not match the signed release record.");
  }
  if (expectedRelease.capabilities !== undefined && !equalCapabilities(expectedRelease.capabilities, staticManifest.capabilities)) {
    throw new Error("Registry package capabilities do not match the signed release record.");
  }
}

export function ownerVaultRegistryLayout(vaultRoot) {
  const root = path.resolve(vaultRoot);
  return {
    root: path.join(root, "registry-staging"),
    packagesRoot: path.join(root, "registry-staging", "packages"),
  };
}

/** Calculates the immutable artifact tuple required by the safe extractor. */
export async function describeSpsPluginArchive(archivePath, { fsApi = fs, createReadStreamImpl = createReadStream } = {}) {
  const absolutePath = path.resolve(archivePath);
  const stats = await fsApi.lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("SPS plugin archive must be a regular file.");
  }
  if (stats.size <= 0) throw new Error("SPS plugin archive cannot be empty.");

  const hash = createHash("sha256");
  for await (const chunk of createReadStreamImpl(absolutePath, { flags: "r" })) hash.update(chunk);
  return {
    archivePath: absolutePath,
    artifact: {
      sha256: hash.digest("hex"),
      sizeBytes: stats.size,
    },
  };
}

/**
 * Handles the Desktop-owned half of Registry disabled installation. The
 * extractor is code-free; Core receives a package path only after extraction
 * succeeds inside the Owner Vault's managed staging root.
 */
export async function stageSpsPluginArchive({
  vaultRoot,
  archivePath,
  source,
  expectedArtifact = null,
  expectedRelease = null,
  registerStage,
  fsApi = fs,
  randomId = randomUUID,
  describeArchive = describeSpsPluginArchive,
  extractArchive = extractPluginArchive,
} = {}) {
  if (!vaultRoot) throw new Error("Owner Vault root is required.");
  if (typeof archivePath !== "string" || archivePath.trim().length === 0) {
    throw new Error("SPS plugin archive path is required.");
  }
  if (typeof registerStage !== "function") throw new Error("Registry stage registration callback is required.");
  assertRegistrySource(source);

  const layout = ownerVaultRegistryLayout(vaultRoot);
  await fsApi.mkdir(layout.packagesRoot, { recursive: true, mode: 0o700 });
  const described = await describeArchive(archivePath, { fsApi });
  if (expectedArtifact && (
    expectedArtifact.sha256 !== described.artifact.sha256
    || expectedArtifact.sizeBytes !== described.artifact.sizeBytes
  )) {
    throw new Error("Registry artifact no longer matches its signed release record.");
  }
  const destinationRoot = path.join(layout.packagesRoot, `${described.artifact.sha256.slice(0, 16)}-${randomId()}`);
  const extraction = await extractArchive({
    archivePath: described.archivePath,
    destinationRoot,
    expectedArtifact: described.artifact,
  });
  if (!extraction.extracted || !extraction.destinationRoot) {
    return {
      staged: false,
      artifact: described.artifact,
      inspection: extraction.inspection ?? null,
      errors: extraction.errors ?? ["SPS plugin archive could not be extracted."],
    };
  }

  try {
    assertExpectedRelease(extraction, expectedRelease);
    const stage = await registerStage({
      packageRoot: extraction.destinationRoot,
      artifactSha256: described.artifact.sha256,
      source,
    });
    return {
      staged: true,
      artifact: described.artifact,
      inspection: extraction.inspection,
      stage,
    };
  } catch (error) {
    await fsApi.rm(extraction.destinationRoot, { recursive: true, force: true });
    throw error;
  }
}
