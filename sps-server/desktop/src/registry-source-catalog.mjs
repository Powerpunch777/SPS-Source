import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import {
  inspectLocalRegistry,
} from "@sps/plugin-platform/registry/local-registry-v1.mjs";
import {
  isSafeRegistryRelativePath,
  validateReleaseRecord,
  verifyReleaseRecordSignature,
} from "@sps/plugin-platform/registry/release-record-v1.mjs";
import {
  validateRegistrySource,
  verifyRegistryIndexForSource,
} from "@sps/plugin-platform/registry/source-trust-v1.mjs";

const REGISTRY_SOURCES_SCHEMA_VERSION = 1;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function publicSource(source) {
  const { localPath: _localPath, ...safe } = source;
  return safe;
}

function publicRelease(release) {
  const { artifactPath: _artifactPath, releaseLocator: _releaseLocator, ...safe } = release;
  return safe;
}

function assertSourceList(value) {
  if (!isPlainObject(value) || value.schemaVersion !== REGISTRY_SOURCES_SCHEMA_VERSION || !Array.isArray(value.sources)) {
    throw new Error("Registry source configuration is invalid.");
  }
  const ids = new Set();
  for (const source of value.sources) {
    const result = validateRegistrySource(source);
    if (!result.valid) throw new Error(result.errors.join(" "));
    if (ids.has(source.id)) throw new Error(`Duplicate Registry source id: ${source.id}.`);
    ids.add(source.id);
  }
}

function sourceDirectory(vaultRoot) {
  return path.join(path.resolve(vaultRoot), "registry-sources");
}

export function ownerVaultRegistrySourcesPath(vaultRoot) {
  return path.join(sourceDirectory(vaultRoot), "sources.json");
}

export async function loadRegistrySources({ vaultRoot, fsApi = fs } = {}) {
  if (!vaultRoot) throw new Error("Owner Vault root is required.");
  const filePath = ownerVaultRegistrySourcesPath(vaultRoot);
  try {
    const stats = await fsApi.lstat(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_METADATA_BYTES) {
      throw new Error("Registry source configuration is unavailable.");
    }
    const parsed = JSON.parse(await fsApi.readFile(filePath, "utf8"));
    assertSourceList(parsed);
    return { schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION, sources: parsed.sources.map((source) => ({ ...source })) };
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION, sources: [] };
    if (error instanceof SyntaxError) throw new Error("Registry source configuration is not valid JSON.");
    throw error;
  }
}

export async function saveRegistrySources({ vaultRoot, sources, fsApi = fs, randomId = randomUUID } = {}) {
  if (!vaultRoot) throw new Error("Owner Vault root is required.");
  const value = { schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION, sources: Array.isArray(sources) ? sources : null };
  assertSourceList(value);
  const directory = sourceDirectory(vaultRoot);
  const filePath = ownerVaultRegistrySourcesPath(vaultRoot);
  const temporaryPath = path.join(directory, `.sources-${randomId()}.json`);
  await fsApi.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await fsApi.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fsApi.rename(temporaryPath, filePath);
  } finally {
    await fsApi.rm(temporaryPath, { force: true }).catch(() => {});
  }
  return { schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION, sources: value.sources.map((source) => ({ ...source })) };
}

export async function addRegistrySource({ vaultRoot, source, fsApi = fs } = {}) {
  const validation = validateRegistrySource(source);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const current = await loadRegistrySources({ vaultRoot, fsApi });
  if (current.sources.some((entry) => entry.id === source.id)) {
    throw new Error(`Registry source ${source.id} is already configured.`);
  }
  current.sources.push({ ...source });
  current.sources.sort((left, right) => left.displayName.localeCompare(right.displayName));
  return await saveRegistrySources({ vaultRoot, sources: current.sources, fsApi });
}

export async function removeRegistrySource({ vaultRoot, sourceId, fsApi = fs } = {}) {
  if (typeof sourceId !== "string" || sourceId.trim().length === 0) throw new Error("Registry source id is required.");
  const current = await loadRegistrySources({ vaultRoot, fsApi });
  const remaining = current.sources.filter((source) => source.id !== sourceId);
  if (remaining.length === current.sources.length) throw new Error(`Registry source ${sourceId} was not found.`);
  return await saveRegistrySources({ vaultRoot, sources: remaining, fsApi });
}

async function readResponseBytes(response, limit, label) {
  if (!response?.ok) throw new Error(`${label} request failed with HTTP ${response?.status ?? "unknown"}.`);
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limit) throw new Error(`${label} exceeds the size limit.`);
  const chunks = [];
  let size = 0;
  const body = response.body ? Readable.fromWeb(response.body) : Readable.from(Buffer.from(await response.arrayBuffer()));
  for await (const chunk of body) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error(`${label} exceeds the size limit.`);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function fetchJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const content = await readResponseBytes(response, MAX_METADATA_BYTES, label);
  try {
    return JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function resolveRemoteUrl(baseUrl, locator, label) {
  if (!isSafeRegistryRelativePath(locator)) throw new Error(`${label} must be a safe relative path.`);
  const url = new URL(locator, baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${label} must resolve to an HTTPS URL without credentials or a fragment.`);
  }
  return url.toString();
}

function resolveArtifactUrl(releaseUrl, locator) {
  if (isSafeRegistryRelativePath(locator)) return resolveRemoteUrl(releaseUrl, locator, "Registry artifact");
  const url = new URL(locator);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Registry artifact must be an HTTPS URL without credentials or a fragment.");
  }
  return url.toString();
}

function selectVerifiedRelease(report, { pluginId, version }) {
  const release = report.releases.find((entry) => entry.pluginId === pluginId && entry.version === version);
  if (!release) throw new Error("The selected verified Registry release is no longer available.");
  return release;
}

async function resolveLocalArtifact(root, relativePath, fsApi) {
  if (!isSafeRegistryRelativePath(relativePath)) throw new Error("Local Registry artifact path is invalid.");
  const resolvedRoot = await fsApi.realpath(root);
  const unresolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (!isPathInside(resolvedRoot, unresolved)) throw new Error("Local Registry artifact escapes its source folder.");
  const resolved = await fsApi.realpath(unresolved);
  const stats = await fsApi.lstat(resolved);
  if (!isPathInside(resolvedRoot, resolved) || !stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("Local Registry artifact is not a regular file inside its source folder.");
  }
  return resolved;
}

async function inspectRemoteRegistrySource(source, { fetchImpl }) {
  const index = await fetchJson(fetchImpl, source.indexUrl, "Registry index");
  const sourceResult = verifyRegistryIndexForSource(source, index);
  if (!sourceResult.valid) throw new Error(sourceResult.errors.join(" "));

  const publisherKeys = new Map(index.publisherKeys.map((key) => [key.keyId, key.publicKey]));
  const releases = [];
  const errors = [];
  for (const plugin of index.plugins) {
    for (const releaseLocator of plugin.releases) {
      const label = `${plugin.id} (${releaseLocator})`;
      try {
        const releaseUrl = resolveRemoteUrl(source.indexUrl, releaseLocator, "Registry release record");
        const record = await fetchJson(fetchImpl, releaseUrl, `Release record for ${label}`);
        const recordValidation = validateReleaseRecord(record);
        if (!recordValidation.valid) throw new Error(recordValidation.errors.join(" "));
        if (record.plugin.id !== plugin.id) throw new Error("release plugin.id does not match its index entry.");
        const publisherKey = publisherKeys.get(record.publisher.keyId);
        if (!publisherKey) throw new Error(`publisher key ${record.publisher.keyId} is not declared by the Registry.`);
        const signature = verifyReleaseRecordSignature(record, publisherKey);
        if (!signature.valid) throw new Error(signature.errors.join(" "));
        releases.push({
          pluginId: record.plugin.id,
          version: record.plugin.version,
          visibility: record.visibility,
          publisherId: record.publisher.id,
          publisherKeyId: record.publisher.keyId,
          artifact: { ...record.artifact },
          artifactUrl: resolveArtifactUrl(releaseUrl, record.artifact.url),
          releaseLocator,
        });
      } catch (error) {
        errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    trust: sourceResult.trust,
    warning: sourceResult.warning,
    releases,
  };
}

/**
 * Lists install candidates without executing or downloading plugin code. Local
 * sources are explicit owner trust; remote indexes and releases are signed.
 */
export async function inspectRegistrySource(source, { fetchImpl = fetch, fsApi = fs } = {}) {
  const validation = validateRegistrySource(source);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  if (source.kind === "local") {
    const local = await inspectLocalRegistry(source.localPath);
    return {
      source: publicSource(source),
      valid: local.valid,
      errors: local.errors,
      trust: "explicit-local-owner-trust",
      warning: "Local Registry indexes are trusted because this Owner selected the folder.",
      releases: local.releases.map((release) => ({
        ...release,
        artifact: {
          sha256: release.artifactSha256,
          sizeBytes: release.artifactSizeBytes,
          url: release.artifactRelativePath,
        },
        releaseLocator: release.releaseRelativePath,
      })),
    };
  }
  const remote = await inspectRemoteRegistrySource(source, { fetchImpl });
  return { source: publicSource(source), ...remote };
}

async function downloadVerifiedArtifact({ source, release, vaultRoot, fetchImpl, fsApi, randomId }) {
  const layoutRoot = path.join(path.resolve(vaultRoot), "registry-staging", "downloads");
  await fsApi.mkdir(layoutRoot, { recursive: true, mode: 0o700 });
  const targetPath = path.join(layoutRoot, `${release.artifact.sha256.slice(0, 16)}-${randomId()}.spsplugin`);
  const response = await fetchImpl(release.artifactUrl, {
    headers: { accept: "application/octet-stream" },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response?.ok) throw new Error(`Registry plugin package request failed with HTTP ${response?.status ?? "unknown"}.`);
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength !== release.artifact.sizeBytes) {
    throw new Error("Registry plugin package size does not match its signed release record.");
  }
  if (release.artifact.sizeBytes > MAX_ARTIFACT_BYTES) throw new Error("Registry plugin package exceeds the size limit.");
  const handle = await fsApi.open(targetPath, "wx", 0o600);
  try {
    const hash = createHash("sha256");
    let sizeBytes = 0;
    const body = response.body ? Readable.fromWeb(response.body) : Readable.from(Buffer.from(await response.arrayBuffer()));
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      sizeBytes += bytes.length;
      if (sizeBytes > release.artifact.sizeBytes || sizeBytes > MAX_ARTIFACT_BYTES) {
        throw new Error("Registry plugin package exceeds its signed size.");
      }
      hash.update(bytes);
      await handle.write(bytes);
    }
    if (sizeBytes !== release.artifact.sizeBytes || hash.digest("hex") !== release.artifact.sha256) {
      throw new Error("Registry plugin package does not match its signed SHA-256 or size.");
    }
    return targetPath;
  } catch (error) {
    await fsApi.rm(targetPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await handle.close();
  }
}

/**
 * Re-inspects a source and acquires one immutable release. The caller must
 * still hand the returned archive to the code-free extractor and Core stage
 * API; this function never imports plugin JavaScript.
 */
export async function acquireRegistryRelease({
  vaultRoot,
  source,
  pluginId,
  version,
  fetchImpl = fetch,
  fsApi = fs,
  randomId = randomUUID,
} = {}) {
  if (!vaultRoot) throw new Error("Owner Vault root is required.");
  const report = await inspectRegistrySource(source, { fetchImpl, fsApi });
  if (!report.valid) throw new Error(report.errors.join("\n"));
  const release = selectVerifiedRelease(report, { pluginId, version });
  if (source.kind === "local") {
    return {
      archivePath: await resolveLocalArtifact(source.localPath, release.artifact.url, fsApi),
      cleanupArchive: false,
      artifact: release.artifact,
      source: { registryId: source.id, kind: source.kind, releaseLocator: release.releaseLocator },
      release: publicRelease(release),
    };
  }
  return {
    archivePath: await downloadVerifiedArtifact({ source, release, vaultRoot, fetchImpl, fsApi, randomId }),
    cleanupArchive: true,
    artifact: release.artifact,
    source: { registryId: source.id, kind: source.kind, releaseLocator: release.releaseLocator },
    release: publicRelease(release),
  };
}
