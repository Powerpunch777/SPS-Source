import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { TextDecoder } from "node:util";
import {
  inspectLocalRegistry,
} from "@sonparkserver/plugin-sdk/registry/local-registry-v1.mjs";
import {
  isSafeRegistryRelativePath,
  validateReleaseRecord,
  verifyReleaseRecordSignature,
} from "@sonparkserver/plugin-sdk/registry/release-record-v1.mjs";
import {
  validateRegistrySource,
  verifyRegistryIndexForSource,
} from "@sonparkserver/plugin-sdk/registry/source-trust-v1.mjs";

const REGISTRY_SOURCES_SCHEMA_VERSION = 1;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_REGISTRY_SOURCE_REFERENCES = 4096;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;

// This key is intentionally compiled into SPS Desktop. Remote Registry data
// never supplies its own trust root, so a compromised index cannot approve a
// replacement signing key. Rotating this key requires a Desktop update.
export const SPS_OFFICIAL_REGISTRY_SOURCE = Object.freeze({
  id: "io.sps.official",
  kind: "official",
  displayName: "SPS Official Registry",
  // GitHub Pages is the current distribution transport. The public Redon
  // domain remains the catalog and documentation home, but is not used for
  // desktop acquisition until its TLS certificate is provisioned.
  indexUrl: "https://raw.githubusercontent.com/Powerpunch777/SPS-Official-Extensions/main/registry.json",
  trustedRoot: Object.freeze({
    keyId: "ed25519:sps-official-registry-root-1",
    publicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAwulANS1+yX316js++mKcwkPcGh7pVkB+Dh+0wt0LTJE=\n-----END PUBLIC KEY-----\n",
  }),
});

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

function normalizedReleaseCompatibility(compatibility) {
  return {
    ...compatibility,
    extensionProfile: compatibility?.extensionProfile ?? "1.0",
  };
}

function assertSourceList(value) {
  if (!isPlainObject(value) || value.schemaVersion !== REGISTRY_SOURCES_SCHEMA_VERSION || !Array.isArray(value.sources)) {
    throw new Error("Registry source configuration is invalid.");
  }
  const ids = new Set();
  for (const source of value.sources) {
    assertSpsRegistrySourcePolicy(source);
    if (ids.has(source.id)) throw new Error(`Duplicate Registry source id: ${source.id}.`);
    ids.add(source.id);
  }
}

function sourceDirectory(vaultRoot) {
  return path.join(path.resolve(vaultRoot), "registry-sources");
}

export function isBundledRegistrySource(sourceOrId) {
  const sourceId = typeof sourceOrId === "string" ? sourceOrId : sourceOrId?.id;
  return sourceId === SPS_OFFICIAL_REGISTRY_SOURCE.id;
}

function isExactOfficialRegistrySource(source) {
  return source?.id === SPS_OFFICIAL_REGISTRY_SOURCE.id
    && source?.kind === SPS_OFFICIAL_REGISTRY_SOURCE.kind
    && source?.displayName === SPS_OFFICIAL_REGISTRY_SOURCE.displayName
    && source?.indexUrl === SPS_OFFICIAL_REGISTRY_SOURCE.indexUrl
    && source?.trustedRoot?.keyId === SPS_OFFICIAL_REGISTRY_SOURCE.trustedRoot.keyId
    && source?.trustedRoot?.publicKey === SPS_OFFICIAL_REGISTRY_SOURCE.trustedRoot.publicKey;
}

function assertSpsRegistrySourcePolicy(source, { allowBundledOfficial = false } = {}) {
  const validation = validateRegistrySource(source);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  if (source.kind === "local") return;
  if (allowBundledOfficial && isExactOfficialRegistrySource(source)) return;
  throw new Error("SPS Desktop currently supports only the bundled SPS Official Registry and Owner-selected local development Registries.");
}

function mergeBundledRegistrySources(sources) {
  const configured = sources.filter((source) => !isBundledRegistrySource(source));
  return [SPS_OFFICIAL_REGISTRY_SOURCE, ...configured]
    .map((source) => ({
      ...source,
      ...(source.trustedRoot ? { trustedRoot: { ...source.trustedRoot } } : {}),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function ownerVaultRegistrySourcesPath(vaultRoot) {
  return path.join(sourceDirectory(vaultRoot), "sources.json");
}

function sameFileIdentity(left, right) {
  if (!left.isFile() || !right.isFile() || left.isSymbolicLink() || right.isSymbolicLink()
    || left.nlink !== 1n || right.nlink !== 1n || left.dev !== right.dev || left.ino !== right.ino
    || left.birthtimeNs !== right.birthtimeNs) {
    throw new Error("Registry source configuration is unavailable.");
  }
}

function identitySnapshot(stats) {
  return {
    dev: stats.dev,
    ino: stats.ino,
    birthtimeNs: stats.birthtimeNs,
    size: stats.size,
    mtimeNs: stats.mtimeNs,
    ctimeNs: stats.ctimeNs,
  };
}

function identitiesMatch(left, right) {
  return ["dev", "ino", "birthtimeNs", "size", "mtimeNs", "ctimeNs"]
    .every((key) => left[key] === right[key]);
}

function sameLocalDirectoryIdentity(left, right) {
  return ["dev", "ino", "birthtimeNs", "mtimeNs", "ctimeNs"]
    .every((key) => left[key] === right[key]);
}

function normalizedPathKey(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function assertRegistryText(value) {
  if (typeof value === "string") {
    if (value.includes("\0") || value.includes("\uFFFD")) {
      throw new Error("Registry source configuration contains invalid text.");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertRegistryText(entry);
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertRegistryText(key);
      assertRegistryText(entry);
    }
  }
}

async function assertRegistryPathParents(filePath, fsApi) {
  const resolved = path.dirname(path.resolve(filePath));
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const rootStats = await fsApi.lstat(current);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error("Registry source configuration parent is unavailable.");
  }
  for (const component of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stats;
    try {
      stats = await fsApi.lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error("Registry source configuration parent is unavailable.");
    }
  }
}

async function readRegistrySourceSnapshot(filePath, fsApi) {
  await assertRegistryPathParents(filePath, fsApi);
  let before;
  try {
    before = await fsApi.lstat(filePath, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, sources: [], bytes: null, identity: null };
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(MAX_METADATA_BYTES)) {
    throw new Error("Registry source configuration is unavailable.");
  }

  const handle = await fsApi.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  let bytes;
  let identity;
  try {
    const opened = await handle.stat({ bigint: true });
    sameFileIdentity(before, opened);
    if (opened.size > BigInt(MAX_METADATA_BYTES)) throw new Error("Registry source configuration exceeds the size limit.");
    const buffer = Buffer.alloc(MAX_METADATA_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      offset += bytesRead;
      if (bytesRead === 0) break;
    }
    if (offset > MAX_METADATA_BYTES) throw new Error("Registry source configuration exceeds the size limit.");
    bytes = buffer.subarray(0, offset);
    const afterRead = await handle.stat({ bigint: true });
    sameFileIdentity(opened, afterRead);
    if (opened.size !== BigInt(offset) || opened.size !== afterRead.size
      || opened.mtimeNs !== afterRead.mtimeNs || opened.ctimeNs !== afterRead.ctimeNs) {
      throw new Error("Registry source configuration changed while being read.");
    }
    identity = identitySnapshot(afterRead);
  } finally {
    await handle.close();
  }

  const after = await fsApi.lstat(filePath, { bigint: true });
  sameFileIdentity(before, after);
  await assertRegistryPathParents(filePath, fsApi);
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    throw new Error("Registry source configuration changed while being read.");
  }

  let raw;
  try {
    raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("Registry source configuration is not valid UTF-8.");
  }
  if (raw.includes("\0") || raw.includes("\uFFFD")) {
    throw new Error("Registry source configuration contains invalid text.");
  }
  if (raw.startsWith("\uFEFF")) raw = raw.slice(1);
  if (raw.startsWith("\uFEFF")) throw new Error("Registry source configuration has multiple byte-order marks.");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Registry source configuration is not valid JSON.");
  }
  assertSourceList(parsed);
  assertRegistryText(parsed);
  if (Object.keys(parsed).some((key) => !["schemaVersion", "sources"].includes(key))) {
    throw new Error("Registry source configuration has unknown fields.");
  }
  const sources = parsed.sources.map((source) => {
    if (Object.keys(source).some((key) => !["id", "kind", "displayName", "localPath"].includes(key))) {
      throw new Error("Registry source configuration has unknown fields.");
    }
    return source;
  });
  if (sources.length + 1 > MAX_REGISTRY_SOURCE_REFERENCES) {
    throw new Error("Registry source reference limit exceeded.");
  }
  const canonical = `${JSON.stringify({ schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION, sources }, null, 2)}\n`;
  const comparable = raw.replace(/\r\n/g, "\n");
  if (comparable !== canonical && comparable !== canonical.slice(0, -1)) {
    throw new Error("Registry source configuration is not in canonical format.");
  }

  return { exists: true, sources, bytes, identity };
}

async function registryDirectoryAncestry(directory, fsApi) {
  const root = path.parse(directory).root;
  if (process.platform === "win32" ? !/^[A-Za-z]:\\$/.test(root) : root !== "/") {
    throw new Error("Configured local Registry path must use a local filesystem root.");
  }
  const result = [];
  for (let current = directory;; current = path.dirname(current)) {
    if (result.length >= 1024) throw new Error("Configured local Registry path ancestry exceeds its limit.");
    const stats = await fsApi.lstat(current, { bigint: true });
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Configured local Registry path parent is unavailable.");
    }
    result.push({ path: current, dev: stats.dev, ino: stats.ino, birthtimeNs: stats.birthtimeNs });
    if (path.dirname(current) === current) break;
  }
  return result;
}

function sameRegistryAncestry(before, after) {
  return before.length === after.length && before.every((entry, index) =>
    ["path", "dev", "ino", "birthtimeNs"].every(key => entry[key] === after[index][key]));
}

async function inspectLocalSourceDirectory(localPath, fsApi) {
  const directoryPath = path.resolve(localPath);
  const originalAncestry = await registryDirectoryAncestry(directoryPath, fsApi);
  const stats = await fsApi.lstat(directoryPath, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Configured local Registry path must be an existing unlinked directory.");
  }
  const canonicalPath = await fsApi.realpath(directoryPath);
  if (typeof canonicalPath !== "string" || !path.isAbsolute(canonicalPath)
    || path.resolve(canonicalPath) !== canonicalPath) throw new Error("Configured local Registry path is not canonical.");
  // Windows short names can differ from realpath without being links. Require
  // identical directory identities and validate both original/canonical chains.
  const canonicalAncestry = await registryDirectoryAncestry(canonicalPath, fsApi);
  const canonicalStats = await fsApi.lstat(canonicalPath, { bigint: true });
  const after = await fsApi.lstat(directoryPath, { bigint: true });
  if (!sameLocalDirectoryIdentity(stats, canonicalStats) || !sameLocalDirectoryIdentity(stats, after)
    || !sameRegistryAncestry(originalAncestry, await registryDirectoryAncestry(directoryPath, fsApi))
    || !sameRegistryAncestry(canonicalAncestry, await registryDirectoryAncestry(canonicalPath, fsApi))
    || normalizedPathKey(await fsApi.realpath(directoryPath)) !== normalizedPathKey(canonicalPath)) {
    throw new Error("Configured local Registry directory changed while being read.");
  }
  return {
    path: directoryPath,
    canonicalPath,
    originalAncestry,
    canonicalAncestry,
    identity: { dev: stats.dev, ino: stats.ino, birthtimeNs: stats.birthtimeNs, mtimeNs: stats.mtimeNs, ctimeNs: stats.ctimeNs },
  };
}

/** Captures private, read-only artifact references for configured local Registries. */
export async function readRegistrySourceArtifactReferences({ vaultRoot, fsApi = fs } = {}) {
  if (!vaultRoot) throw new Error("Owner Vault root is required.");
  const filePath = ownerVaultRegistrySourcesPath(vaultRoot);
  const initial = await readRegistrySourceSnapshot(filePath, fsApi);
  const localDirectories = [];
  for (const source of initial.sources) {
    if (source.kind !== "local") throw new Error("Only local Registry sources may be referenced.");
    localDirectories.push({ source, ...await inspectLocalSourceDirectory(source.localPath, fsApi) });
  }
  const references = [Object.freeze({
    source: "desktop-registry-source-index",
    ownerId: "sources",
    state: "retained",
    path: filePath,
    kind: "file",
  }), ...localDirectories.map(({ source, path: directoryPath }) => Object.freeze({
    source: "desktop-registry-source",
    ownerId: source.id,
    state: "retained",
    path: directoryPath,
    kind: "directory",
  }))];
  return Object.freeze({
    references: Object.freeze(references),
    async assertCurrent() {
      const current = await readRegistrySourceSnapshot(filePath, fsApi);
      if (current.exists !== initial.exists
        || (current.exists && (!identitiesMatch(current.identity, initial.identity) || !current.bytes.equals(initial.bytes)))) {
        throw new Error("Registry source configuration changed after artifact references were captured.");
      }
      for (const captured of localDirectories) {
        const present = await inspectLocalSourceDirectory(captured.source.localPath, fsApi);
        if (normalizedPathKey(present.path) !== normalizedPathKey(captured.path)
          || normalizedPathKey(present.canonicalPath) !== normalizedPathKey(captured.canonicalPath)
          || !sameLocalDirectoryIdentity(captured.identity, present.identity)
          || !sameRegistryAncestry(captured.originalAncestry, present.originalAncestry)
          || !sameRegistryAncestry(captured.canonicalAncestry, present.canonicalAncestry)) {
          throw new Error("Configured local Registry directory changed after artifact references were captured.");
        }
      }
      return true;
    },
  });
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
    return {
      schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION,
      sources: mergeBundledRegistrySources(parsed.sources),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION, sources: mergeBundledRegistrySources([]) };
    }
    if (error instanceof SyntaxError) throw new Error("Registry source configuration is not valid JSON.");
    throw error;
  }
}

export async function saveRegistrySources({ vaultRoot, sources, fsApi = fs, randomId = randomUUID } = {}) {
  if (!vaultRoot) throw new Error("Owner Vault root is required.");
  const sourceList = Array.isArray(sources) ? sources : null;
  if (sourceList) {
    for (const source of sourceList) {
      if (isBundledRegistrySource(source) && !isExactOfficialRegistrySource(source)) {
        throw new Error("The SPS Official Registry identity is reserved for the bundled source.");
      }
    }
  }
  const configuredSources = sourceList?.filter((source) => !isBundledRegistrySource(source)) ?? null;
  const value = { schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION, sources: configuredSources };
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
  return {
    schemaVersion: REGISTRY_SOURCES_SCHEMA_VERSION,
    sources: mergeBundledRegistrySources(value.sources),
  };
}

export async function addRegistrySource({ vaultRoot, source, fsApi = fs } = {}) {
  assertSpsRegistrySourcePolicy(source);
  const current = await loadRegistrySources({ vaultRoot, fsApi });
  if (current.sources.some((entry) => entry.id === source.id)) {
    throw new Error(`Registry source ${source.id} is already configured.`);
  }
  const configuredSources = current.sources.filter((entry) => !isBundledRegistrySource(entry));
  configuredSources.push({ ...source });
  configuredSources.sort((left, right) => left.displayName.localeCompare(right.displayName));
  return await saveRegistrySources({ vaultRoot, sources: configuredSources, fsApi });
}

export async function removeRegistrySource({ vaultRoot, sourceId, fsApi = fs } = {}) {
  if (typeof sourceId !== "string" || sourceId.trim().length === 0) throw new Error("Registry source id is required.");
  if (isBundledRegistrySource(sourceId)) {
    throw new Error("The bundled SPS Official Registry cannot be removed.");
  }
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

function resolveArtifactUrl(registryIndexUrl, locator) {
  // Registry artifact paths are rooted at the signed Registry index. Release
  // records live under `releases/`, while artifacts live beside that folder
  // under `packages/`, so resolving from a release record would request an
  // unintended `releases/packages/...` path.
  if (isSafeRegistryRelativePath(locator)) return resolveRemoteUrl(registryIndexUrl, locator, "Registry artifact");
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
  const publisherProfiles = new Map((index.publishers ?? []).map((profile) => [profile.id, profile]));
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
          isLatest: plugin.latest === record.plugin.version,
          visibility: record.visibility,
          ...(record.catalog === undefined ? {} : { catalog: { ...record.catalog } }),
          ...(record.capabilities === undefined ? {} : { capabilities: [...record.capabilities] }),
          compatibility: normalizedReleaseCompatibility(record.compatibility),
          permissionsDigest: record.permissionsDigest,
          publisherId: record.publisher.id,
          ...(publisherProfiles.has(record.publisher.id) ? { publisherProfile: { ...publisherProfiles.get(record.publisher.id) } } : {}),
          publisherKeyId: record.publisher.keyId,
          artifact: { ...record.artifact },
          artifactUrl: resolveArtifactUrl(source.indexUrl, record.artifact.url),
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
  assertSpsRegistrySourcePolicy(source, { allowBundledOfficial: true });
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
        compatibility: normalizedReleaseCompatibility(release.compatibility),
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
