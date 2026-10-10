import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createSpsOwnerHostConfig,
  findSpsOwnerHostPorts,
  ownerHostVaultLayout,
  spsOwnerHostUrl,
} from "./owner-host-config.mjs";
import { createSpsOwnerHostManager } from "./owner-host.mjs";
import { normalizeSpsPluginPreviewFixtureV1 } from "@sonparkserver/plugin-sdk/preview/fixtures-v1.mjs";

const BUILD_ID = /^build-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW_METADATA_SOURCE = "doctor";
const PREVIEW_METADATA_VERSION = 1;
const MAX_PREVIEW_CONFIG_BYTES = 128 * 1024;
const MAX_PREVIEW_FIXTURE_BYTES = 64 * 1024;
const PREVIEW_ACCESS_TOKEN = /^[A-Za-z0-9_-]{43,128}$/;

function defaultPreviewFixture() {
  return normalizeSpsPluginPreviewFixtureV1({
    role: "host",
    viewport: "desktop",
    uiState: "live",
    fixtures: {
      node: {
        enabled: true,
        payload: {
          id: "preview-node",
          label: "Preview Node",
          status: "ready",
          capabilities: ["cli", "local-ai"],
        },
      },
      runtime: {
        enabled: true,
        payload: {
          id: "preview-runtime",
          label: "Preview Runtime",
          status: "available",
          kind: "local",
        },
      },
      source: {
        enabled: true,
        payload: {
          id: "preview-source",
          label: "Preview Source",
          status: "connected",
          kind: "repository",
        },
      },
    },
  });
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function requireBuildId(buildId) {
  if (typeof buildId !== "string" || !BUILD_ID.test(buildId)) {
    throw new Error("SPS plugin preview build id must use the build-UUID format.");
  }
  return buildId.toLowerCase();
}

async function lstatIfExists(entry, fsApi) {
  try {
    return await fsApi.lstat(entry);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoSymlinks(root, target, fsApi) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isContained(resolvedRoot, resolvedTarget)) throw new Error("SPS preview path escapes its vault.");

  let current = resolvedRoot;
  const rootStat = await lstatIfExists(current, fsApi);
  if (rootStat?.isSymbolicLink()) throw new Error("SPS preview vault must not be a symbolic link.");
  const relative = path.relative(resolvedRoot, resolvedTarget);
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    const stat = await lstatIfExists(current, fsApi);
    if (stat?.isSymbolicLink()) throw new Error("SPS preview paths must not traverse symbolic links.");
  }
}

function expectedPreviewLayout(previewVault) {
  return ownerHostVaultLayout(previewVault);
}

function expectedPreviewConfig({ previewVault, buildId, serverPort, databasePort, now }) {
  const config = createSpsOwnerHostConfig({
    vaultRoot: previewVault,
    serverPort,
    databasePort,
    now,
  });
  return {
    ...config,
    $meta: {
      version: 1,
      updatedAt: now.toISOString(),
      source: PREVIEW_METADATA_SOURCE,
    },
    spsPreview: {
      version: PREVIEW_METADATA_VERSION,
      buildId,
    },
    database: {
      ...config.database,
      backup: {
        ...config.database.backup,
        enabled: false,
      },
    },
    server: {
      ...config.server,
      deploymentMode: "local_trusted",
      exposure: "private",
      bind: "loopback",
      host: "127.0.0.1",
      allowedHostnames: [],
      serveUi: true,
    },
    auth: {
      baseUrlMode: "auto",
      disableSignUp: true,
    },
    telemetry: { enabled: false },
  };
}

function requireExactPath(actual, expected, label) {
  if (typeof actual !== "string" || path.resolve(actual) !== path.resolve(expected)) {
    throw new Error(`SPS preview config ${label} escapes its preview vault.`);
  }
}

async function validatePreviewConfig({ config, previewVault, buildId, fsApi }) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("SPS preview config is malformed.");
  }
  if (
    config.$meta?.source !== PREVIEW_METADATA_SOURCE
    || config.spsPreview?.version !== PREVIEW_METADATA_VERSION
    || config.spsPreview?.buildId !== buildId
  ) {
    throw new Error("SPS preview config belongs to a different build.");
  }
  const server = config.server;
  if (
    server?.deploymentMode !== "local_trusted"
    || server?.exposure !== "private"
    || server?.bind !== "loopback"
    || server?.host !== "127.0.0.1"
    || server?.serveUi !== true
    || !Number.isInteger(Number(server?.port))
    || Number(server.port) <= 0
    || Number(server.port) >= 65_536
  ) {
    throw new Error("SPS preview config must be local-trusted and loopback-only.");
  }
  if (server.allowedHostnames?.length) throw new Error("SPS preview config cannot expose hostnames.");
  if (config.auth?.publicBaseUrl || config.auth?.baseUrlMode !== "auto") {
    throw new Error("SPS preview config cannot use public or authenticated access.");
  }
  if (
    config.auth?.disableSignUp !== true
    || config.database?.mode !== "embedded-postgres"
    || config.logging?.mode !== "file"
    || config.storage?.provider !== "local_disk"
    || config.secrets?.provider !== "local_encrypted"
  ) {
    throw new Error("SPS preview config must use only isolated local providers.");
  }
  if (server.customBindHost != null) {
    throw new Error("SPS preview config cannot use a custom bind host.");
  }
  if (config.database?.backup?.enabled !== false || config.telemetry?.enabled !== false) {
    throw new Error("SPS preview config must disable backups and telemetry.");
  }
  const databasePort = Number(config.database?.embeddedPostgresPort);
  if (!Number.isInteger(databasePort) || databasePort <= 0 || databasePort >= 65_536) {
    throw new Error("SPS preview config has an invalid database port.");
  }

  const layout = expectedPreviewLayout(previewVault);
  requireExactPath(config.database?.embeddedPostgresDataDir, layout.databaseDir, "database path");
  requireExactPath(config.database?.backup?.dir, layout.backupDir, "backup path");
  requireExactPath(config.logging?.logDir, layout.logDir, "log path");
  requireExactPath(config.storage?.localDisk?.baseDir, layout.storageDir, "storage path");
  requireExactPath(config.secrets?.localEncrypted?.keyFilePath, layout.secretsPath, "secrets path");
  for (const entry of [
    layout.databaseDir,
    layout.backupDir,
    layout.logDir,
    layout.storageDir,
    layout.secretsPath,
  ]) {
    await assertNoSymlinks(previewVault, entry, fsApi);
  }
  return config;
}

async function readValidatedPreviewConfig({ previewVault, buildId, fsApi }) {
  const layout = expectedPreviewLayout(previewVault);
  const stat = await lstatIfExists(layout.configPath, fsApi);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("SPS preview config must be a regular file.");
  let config;
  try {
    if (stat.size > MAX_PREVIEW_CONFIG_BYTES) throw new Error("config exceeds the size limit");
    const raw = await fsApi.readFile(layout.configPath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_PREVIEW_CONFIG_BYTES) {
      throw new Error("config exceeds the size limit");
    }
    config = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`SPS preview config is malformed: ${error.message}`);
  }
  return validatePreviewConfig({ config, previewVault, buildId, fsApi });
}

async function writePreviewConfig({ config, previewVault, fsApi }) {
  const layout = expectedPreviewLayout(previewVault);
  await assertNoSymlinks(path.dirname(previewVault), previewVault, fsApi);
  await fsApi.mkdir(previewVault, { recursive: true, mode: 0o700 });
  await assertNoSymlinks(path.dirname(previewVault), previewVault, fsApi);
  const temporaryPath = path.join(previewVault, `.config-${process.pid}-${Date.now()}.tmp`);
  try {
    await fsApi.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fsApi.rename(temporaryPath, layout.configPath);
  } finally {
    await fsApi.rm(temporaryPath, { force: true }).catch(() => {});
  }
  try {
    await fsApi.chmod(layout.configPath, 0o600);
  } catch {
    // Windows does not support POSIX modes. The atomic replacement still holds.
  }
}

async function readPluginPreviewFixtureFile({ fixturePath, fsApi }) {
  const stat = await lstatIfExists(fixturePath, fsApi);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("SPS preview fixture must be a regular file.");
  }
  if (stat.size > MAX_PREVIEW_FIXTURE_BYTES) {
    throw new Error("SPS preview fixture exceeds the 64KB size limit.");
  }
  let parsed;
  try {
    const raw = await fsApi.readFile(fixturePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_PREVIEW_FIXTURE_BYTES) {
      throw new Error("fixture exceeds the 64KB size limit");
    }
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`SPS preview fixture is malformed: ${error.message}`);
  }
  try {
    return normalizeSpsPluginPreviewFixtureV1(parsed);
  } catch (error) {
    throw new Error(`SPS preview fixture is unsafe or invalid: ${error.message}`);
  }
}

async function writePluginPreviewFixtureFile({ preview, fixture, fsApi }) {
  const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_PREVIEW_FIXTURE_BYTES) {
    throw new Error("SPS preview fixture exceeds the 64KB size limit.");
  }
  await assertNoSymlinks(preview.ownerVault, preview.previewVault, fsApi);
  await fsApi.mkdir(preview.previewVault, { recursive: true, mode: 0o700 });
  await assertNoSymlinks(preview.ownerVault, preview.previewVault, fsApi);
  const temporaryPath = path.join(preview.previewVault, `.fixture-${process.pid}-${Date.now()}.tmp`);
  try {
    await fsApi.writeFile(temporaryPath, serialized, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fsApi.rename(temporaryPath, preview.fixturePath);
  } finally {
    await fsApi.rm(temporaryPath, { force: true }).catch(() => {});
  }
  try {
    await fsApi.chmod(preview.fixturePath, 0o600);
  } catch {
    // Windows protects the file through the private Owner Vault ACL.
  }
}

async function ensurePreviewAccessToken({ preview, fsApi, createToken }) {
  const stat = await lstatIfExists(preview.accessTokenPath, fsApi);
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256) {
      throw new Error("SPS preview access token is unavailable.");
    }
    const token = (await fsApi.readFile(preview.accessTokenPath, "utf8")).trim();
    if (!PREVIEW_ACCESS_TOKEN.test(token)) throw new Error("SPS preview access token is invalid.");
    return token;
  }
  const token = createToken();
  if (typeof token !== "string" || !PREVIEW_ACCESS_TOKEN.test(token)) {
    throw new Error("SPS preview access token generator returned an invalid token.");
  }
  const temporaryPath = path.join(preview.previewVault, `.access-${process.pid}-${Date.now()}.tmp`);
  try {
    await fsApi.writeFile(temporaryPath, `${token}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fsApi.rename(temporaryPath, preview.accessTokenPath);
  } finally {
    await fsApi.rm(temporaryPath, { force: true }).catch(() => {});
  }
  try {
    await fsApi.chmod(preview.accessTokenPath, 0o600);
  } catch {
    // Windows protects the file through the private Owner Vault ACL.
  }
  return token;
}

export function isPluginPreviewBuildId(buildId) {
  return typeof buildId === "string" && BUILD_ID.test(buildId);
}

export function pluginPreviewVaultLayout({ ownerVault, buildId } = {}) {
  if (!ownerVault) throw new Error("SPS Owner Vault root is required for plugin preview.");
  const normalizedBuildId = requireBuildId(buildId);
  const previewsRoot = path.join(path.resolve(ownerVault), "developer-mode", "previews");
  const previewVault = path.join(previewsRoot, normalizedBuildId);
  if (!isContained(previewsRoot, previewVault)) throw new Error("SPS preview vault escapes the previews root.");
  return {
    ownerVault: path.resolve(ownerVault),
    previewsRoot,
    previewVault,
    configPath: path.join(previewVault, "config.json"),
    fixturePath: path.join(previewVault, "fixture-v1.json"),
    accessTokenPath: path.join(previewVault, "desktop-access.token"),
    buildId: normalizedBuildId,
  };
}

export async function readPluginPreviewFixture({ ownerVault, buildId, fsApi = fs } = {}) {
  const preview = pluginPreviewVaultLayout({ ownerVault, buildId });
  await assertNoSymlinks(preview.ownerVault, preview.previewVault, fsApi);
  const fixture = await readPluginPreviewFixtureFile({ fixturePath: preview.fixturePath, fsApi });
  return fixture ? { ...preview, fixture } : null;
}

export async function ensurePluginPreviewFixture({ ownerVault, buildId, fsApi = fs } = {}) {
  const preview = pluginPreviewVaultLayout({ ownerVault, buildId });
  await assertNoSymlinks(preview.ownerVault, preview.previewVault, fsApi);
  const existing = await readPluginPreviewFixtureFile({ fixturePath: preview.fixturePath, fsApi });
  if (existing) return { ...preview, fixture: existing, created: false };
  const fixture = defaultPreviewFixture();
  await writePluginPreviewFixtureFile({ preview, fixture, fsApi });
  return { ...preview, fixture, created: true };
}

export async function updatePluginPreviewFixture({ ownerVault, buildId, fixture, fsApi = fs } = {}) {
  const preview = pluginPreviewVaultLayout({ ownerVault, buildId });
  let normalized;
  try {
    normalized = normalizeSpsPluginPreviewFixtureV1(fixture);
  } catch (error) {
    throw new Error(`SPS preview fixture is unsafe or invalid: ${error.message}`);
  }
  await writePluginPreviewFixtureFile({ preview, fixture: normalized, fsApi });
  return { ...preview, fixture: normalized, updated: true };
}

export async function ensurePluginPreviewConfig({
  ownerVault,
  buildId,
  fsApi = fs,
  findPorts = findSpsOwnerHostPorts,
  now = new Date(),
  createToken = () => randomBytes(32).toString("base64url"),
} = {}) {
  const preview = pluginPreviewVaultLayout({ ownerVault, buildId });
  await assertNoSymlinks(preview.ownerVault, preview.previewVault, fsApi);
  const existing = await readValidatedPreviewConfig({ ...preview, fsApi });
  if (existing) {
    const accessToken = await ensurePreviewAccessToken({ preview, fsApi, createToken });
    return { ...preview, config: existing, accessToken, created: false, url: spsOwnerHostUrl(existing) };
  }

  const ports = await findPorts();
  const config = expectedPreviewConfig({
    previewVault: preview.previewVault,
    buildId: preview.buildId,
    serverPort: ports.serverPort,
    databasePort: ports.databasePort,
    now,
  });
  await writePreviewConfig({ config, previewVault: preview.previewVault, fsApi });
  await validatePreviewConfig({ config, previewVault: preview.previewVault, buildId: preview.buildId, fsApi });
  const accessToken = await ensurePreviewAccessToken({ preview, fsApi, createToken });
  return { ...preview, config, accessToken, created: true, url: spsOwnerHostUrl(config) };
}

export async function cleanupPluginPreview({ ownerVault, buildId, fsApi = fs } = {}) {
  const preview = pluginPreviewVaultLayout({ ownerVault, buildId });
  await assertNoSymlinks(preview.ownerVault, preview.previewVault, fsApi);
  const stat = await lstatIfExists(preview.previewVault, fsApi);
  if (!stat) return { ...preview, removed: false };
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("SPS preview cleanup target must be a real preview directory.");
  await fsApi.rm(preview.previewVault, { recursive: true, force: true });
  return { ...preview, removed: true };
}

export async function createPluginPreviewRuntime({
  ownerVault,
  buildId,
  resolveRuntime,
  fetchImpl,
  spawn,
  baseEnvironment = {},
  managerFactory = createSpsOwnerHostManager,
  ...configOptions
} = {}) {
  if (typeof resolveRuntime !== "function" || typeof fetchImpl !== "function" || typeof spawn !== "function") {
    throw new Error("SPS preview runtime requires resolveRuntime, fetch, and spawn implementations.");
  }
  const preview = await ensurePluginPreviewConfig({ ownerVault, buildId, ...configOptions });
  const manager = managerFactory({
    url: preview.url,
    resolveRuntime: async () => resolveRuntime({ ...preview }),
    fetchImpl,
    spawn,
    baseEnvironment,
  });
  return { ...preview, manager };
}
