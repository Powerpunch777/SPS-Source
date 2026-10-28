import net from "node:net";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const SPS_OWNER_HOST_DEFAULT_PORT = 31_310;
export const SPS_OWNER_HOST_DEFAULT_DATABASE_PORT = 54_339;

function isUsablePort(value) {
  return Number.isInteger(value) && value > 0 && value < 65_536;
}

function parseExistingConfig(raw, configPath) {
  try {
    const parsed = JSON.parse(raw);
    const port = Number(parsed?.server?.port);
    const databasePort = Number(parsed?.database?.embeddedPostgresPort);
    if (!isUsablePort(port) || !isUsablePort(databasePort)) {
      throw new Error("server.port and database.embeddedPostgresPort are required.");
    }
    return parsed;
  } catch (error) {
    throw new Error(`SPS Owner Host config is invalid at ${configPath}: ${error.message}`);
  }
}

function sameOwnedIdentity(expected, actual) {
  if (!actual.isFile() || actual.isSymbolicLink() || actual.nlink !== 1n) return false;
  for (const key of ["dev", "ino", "birthtimeNs"]) {
    if (expected[key] === 0n || actual[key] === 0n || expected[key] !== actual[key]) return false;
  }
  return true;
}

function sameOwnedFile(expected, actual) {
  return sameOwnedIdentity(expected, actual) && expected.size === actual.size
    && expected.mtimeNs === actual.mtimeNs && expected.ctimeNs === actual.ctimeNs;
}

function sameDirectory(expected, actual) {
  if ((!expected.isDirectory() && !expected.isSymbolicLink())
    || expected.isDirectory() !== actual.isDirectory()
    || expected.isSymbolicLink() !== actual.isSymbolicLink()) return false;
  for (const key of ["dev", "ino"]) {
    if (expected[key] === 0n || actual[key] === 0n || expected[key] !== actual[key]) return false;
  }
  return true;
}

// Reference pattern: atomically's MIT-licensed src/index.ts at 5d3af2b945ef332483f86ae9cbb18a3b19657eb7.
// This local implementation is not copied code; retain SPS's identity-bound temp cleanup and directory recheck.
// Source: https://github.com/fabiospampinato/atomically/blob/5d3af2b945ef332483f86ae9cbb18a3b19657eb7/src/index.ts
// MIT license: https://github.com/fabiospampinato/atomically/blob/5d3af2b945ef332483f86ae9cbb18a3b19657eb7/license
async function writeOwnerHostConfig(layout, config, fsApi) {
  const parent = await fsApi.lstat(layout.root, { bigint: true });
  const bytes = `${JSON.stringify(config, null, 2)}\n`;
  const temporaryPath = path.join(layout.root, `.config-${randomUUID()}.tmp`);
  let owned;
  try {
    const handle = await fsApi.open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try {
      owned = await handle.stat({ bigint: true });
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
      owned = await handle.stat({ bigint: true });
    } finally {
      await handle.close();
    }
    const currentParent = await fsApi.lstat(layout.root, { bigint: true });
    if (!sameDirectory(parent, currentParent)) throw new Error("SPS Owner Host config directory changed before save.");
    const currentTemporary = await fsApi.lstat(temporaryPath, { bigint: true });
    if (!sameOwnedFile(owned, currentTemporary)) throw new Error("SPS Owner Host config temporary file changed before save.");
    await fsApi.rename(temporaryPath, layout.configPath);
    owned = undefined;
  } finally {
    if (owned) {
      try {
        const current = await fsApi.lstat(temporaryPath, { bigint: true });
        const currentParent = await fsApi.lstat(layout.root, { bigint: true });
        if (sameDirectory(parent, currentParent) && sameOwnedIdentity(owned, current)) await fsApi.unlink(temporaryPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findDynamicLoopbackPorts() {
  const servers = [];
  try {
    const ports = [];
    for (let index = 0; index < 2; index += 1) {
      const server = net.createServer();
      servers.push(server);
      server.unref();
      ports.push(await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
          const address = server.address();
          if (!address || typeof address === "string") reject(new Error("No local port was assigned."));
          else resolve(address.port);
        });
      }));
    }
    return { serverPort: ports[0], databasePort: ports[1] };
  } finally {
    // Hold both probes until allocated so the OS cannot return the same port.
    await Promise.all(servers.filter(server => server.listening).map(server => new Promise(resolve => server.close(resolve))));
  }
}

export async function findSpsOwnerHostPorts({
  serverPort = SPS_OWNER_HOST_DEFAULT_PORT,
  databasePort = SPS_OWNER_HOST_DEFAULT_DATABASE_PORT,
  isAvailable = canListen,
  attempts = 100,
  findDynamicPorts = findDynamicLoopbackPorts,
} = {}) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidateServerPort = serverPort + offset;
    const candidateDatabasePort = databasePort + offset;
    if (!isUsablePort(candidateServerPort) || !isUsablePort(candidateDatabasePort)) break;
    if (candidateServerPort !== candidateDatabasePort && await isAvailable(candidateServerPort) && await isAvailable(candidateDatabasePort)) {
      return { serverPort: candidateServerPort, databasePort: candidateDatabasePort };
    }
  }
  try {
    const fallback = await findDynamicPorts();
    if (isUsablePort(fallback?.serverPort) && isUsablePort(fallback?.databasePort)
      && fallback.serverPort !== fallback.databasePort
      && await isAvailable(fallback.serverPort) && await isAvailable(fallback.databasePort)) {
      return { serverPort: fallback.serverPort, databasePort: fallback.databasePort };
    }
  } catch (cause) {
    throw new Error("SPS Desktop could not select local Owner Host ports. Try again after checking local networking.", { cause });
  }
  throw new Error("SPS Desktop could not reserve a local Owner Host port. Close the conflicting app and try again.");
}

export function ownerHostVaultLayout(vaultRoot) {
  const root = path.resolve(vaultRoot);
  return {
    root,
    configPath: path.join(root, "config.json"),
    databaseDir: path.join(root, "database"),
    backupDir: path.join(root, "backups"),
    storageDir: path.join(root, "storage"),
    secretsPath: path.join(root, "secrets", "master.key"),
    logDir: path.join(root, "logs"),
    projectsDir: path.join(root, "projects"),
  };
}

export function createSpsOwnerHostConfig({ vaultRoot, serverPort, databasePort, now = new Date() } = {}) {
  if (!vaultRoot) throw new Error("SPS Owner Host vault root is required.");
  if (!isUsablePort(serverPort) || !isUsablePort(databasePort)) {
    throw new Error("SPS Owner Host requires valid local server and database ports.");
  }
  const layout = ownerHostVaultLayout(vaultRoot);
  return {
    $meta: {
      version: 1,
      updatedAt: now.toISOString(),
      source: "onboard",
    },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: layout.databaseDir,
      embeddedPostgresPort: databasePort,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 14,
        dir: layout.backupDir,
      },
    },
    logging: { mode: "file", logDir: layout.logDir },
    server: {
      deploymentMode: "authenticated",
      exposure: "private",
      bind: "loopback",
      host: "127.0.0.1",
      port: serverPort,
      allowedHostnames: [],
      serveUi: true,
    },
    auth: { baseUrlMode: "auto", disableSignUp: false },
    telemetry: { enabled: false },
    storage: { provider: "local_disk", localDisk: { baseDir: layout.storageDir } },
    secrets: {
      provider: "local_encrypted",
      strictMode: false,
      localEncrypted: { keyFilePath: layout.secretsPath },
    },
  };
}

function nextConfigMetadata(config, now) {
  return {
    ...(config.$meta ?? {}),
    version: 1,
    updatedAt: now.toISOString(),
    source: "configure",
  };
}

export function configureSpsOwnerHostPrivateTeamAccess(config, { hostname, now = new Date() } = {}) {
  const normalizedHostname = String(hostname ?? "").trim().toLowerCase().replace(/\.+$/, "");
  if (!/^[a-z0-9][a-z0-9.-]*\.ts\.net$/.test(normalizedHostname)) {
    throw new Error("Private SPS team access requires a valid Tailscale MagicDNS hostname.");
  }
  const server = config?.server;
  if (!server?.port) throw new Error("SPS Owner Host config has no server port.");
  return {
    ...config,
    $meta: nextConfigMetadata(config, now),
    server: {
      ...server,
      deploymentMode: "authenticated",
      exposure: "private",
      // Tailscale Serve owns the external TLS endpoint. The Core process
      // remains loopback-only so it is never reachable directly from LAN.
      bind: "loopback",
      host: "127.0.0.1",
      customBindHost: undefined,
      allowedHostnames: [normalizedHostname],
    },
    auth: {
      ...(config.auth ?? {}),
      baseUrlMode: "explicit",
      publicBaseUrl: `https://${normalizedHostname}`,
      // SPS Identity proves the user, but company access is still granted only
      // by the one-time invitation created before this switch.
      disableSignUp: false,
    },
  };
}

export function configureSpsOwnerHostAuthenticatedLocal(config, { now = new Date() } = {}) {
  const server = config?.server;
  if (!server?.port) throw new Error("SPS Owner Host config has no server port.");
  return {
    ...config,
    $meta: nextConfigMetadata(config, now),
    server: {
      ...server,
      deploymentMode: "authenticated",
      exposure: "private",
      bind: "loopback",
      host: "127.0.0.1",
      customBindHost: undefined,
      allowedHostnames: [],
    },
    auth: {
      ...(config.auth ?? {}),
      baseUrlMode: "auto",
      publicBaseUrl: undefined,
      disableSignUp: false,
    },
  };
}

export function rebaseSpsOwnerHostConfigPaths(config, { vaultRoot, now = new Date() } = {}) {
  if (!config || typeof config !== "object") throw new Error("SPS Owner Host config is required.");
  if (!vaultRoot) throw new Error("SPS Owner Host vault root is required.");
  const layout = ownerHostVaultLayout(vaultRoot);
  return {
    ...config,
    $meta: nextConfigMetadata(config, now),
    database: {
      ...(config.database ?? {}),
      embeddedPostgresDataDir: layout.databaseDir,
      backup: {
        ...(config.database?.backup ?? {}),
        dir: layout.backupDir,
      },
    },
    logging: {
      ...(config.logging ?? {}),
      logDir: layout.logDir,
    },
    storage: {
      ...(config.storage ?? {}),
      localDisk: {
        ...(config.storage?.localDisk ?? {}),
        baseDir: layout.storageDir,
      },
    },
    secrets: {
      ...(config.secrets ?? {}),
      localEncrypted: {
        ...(config.secrets?.localEncrypted ?? {}),
        keyFilePath: layout.secretsPath,
      },
    },
  };
}

export async function updateSpsOwnerHostConfig({ vaultRoot, update, fsApi = { mkdir, readFile, rename, open, lstat, unlink } } = {}) {
  if (typeof update !== "function") throw new Error("SPS Owner Host config update function is required.");
  const layout = ownerHostVaultLayout(vaultRoot);
  const raw = await fsApi.readFile(layout.configPath, "utf8");
  const previous = parseExistingConfig(raw, layout.configPath);
  const next = update(previous);
  if (!next || typeof next !== "object") throw new Error("SPS Owner Host config update returned no config.");
  await writeOwnerHostConfig(layout, next, fsApi);
  return { config: next, layout };
}

export function spsOwnerHostUrl(config) {
  const port = Number(config?.server?.port);
  if (!isUsablePort(port)) throw new Error("SPS Owner Host config has no valid server.port.");
  return `http://127.0.0.1:${port}`;
}

export async function ensureSpsOwnerHostConfig({
  vaultRoot,
  fsApi = { mkdir, readFile, rename, open, lstat, unlink },
  findPorts = findSpsOwnerHostPorts,
  now,
} = {}) {
  const layout = ownerHostVaultLayout(vaultRoot);
  let raw;
  try {
    raw = await fsApi.readFile(layout.configPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (raw !== undefined) {
    const config = parseExistingConfig(raw, layout.configPath);
    if (config.server?.deploymentMode === "authenticated") {
      return { config, layout, created: false };
    }
    // SPS Desktop no longer supports an anonymous local Core. Upgrade existing
    // vaults in place while retaining their data, port, and storage layout.
    const upgraded = configureSpsOwnerHostAuthenticatedLocal(config, { now });
    await writeOwnerHostConfig(layout, upgraded, fsApi);
    return { config: upgraded, layout, created: false, upgraded: true };
  }

  const ports = await findPorts();
  const config = createSpsOwnerHostConfig({
    vaultRoot: layout.root,
    serverPort: ports.serverPort,
    databasePort: ports.databasePort,
    now,
  });
  await fsApi.mkdir(layout.root, { recursive: true });
  await writeOwnerHostConfig(layout, config, fsApi);
  return { config, layout, created: true };
}
