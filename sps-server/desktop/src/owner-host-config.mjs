import net from "node:net";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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

export async function findSpsOwnerHostPorts({
  serverPort = SPS_OWNER_HOST_DEFAULT_PORT,
  databasePort = SPS_OWNER_HOST_DEFAULT_DATABASE_PORT,
  isAvailable = canListen,
  attempts = 100,
} = {}) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidateServerPort = serverPort + offset;
    const candidateDatabasePort = databasePort + offset;
    if (!isUsablePort(candidateServerPort) || !isUsablePort(candidateDatabasePort)) break;
    if (await isAvailable(candidateServerPort) && await isAvailable(candidateDatabasePort)) {
      return { serverPort: candidateServerPort, databasePort: candidateDatabasePort };
    }
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
      deploymentMode: "local_trusted",
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
      // Google authentication may create a user record, but company access is
      // still granted only by the one-time invitation created before switch.
      disableSignUp: false,
    },
  };
}

export function configureSpsOwnerHostLocalOnly(config, { now = new Date() } = {}) {
  const server = config?.server;
  if (!server?.port) throw new Error("SPS Owner Host config has no server port.");
  return {
    ...config,
    $meta: nextConfigMetadata(config, now),
    server: {
      ...server,
      deploymentMode: "local_trusted",
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

export async function updateSpsOwnerHostConfig({ vaultRoot, update, fsApi = { mkdir, readFile, rename, writeFile } } = {}) {
  if (typeof update !== "function") throw new Error("SPS Owner Host config update function is required.");
  const layout = ownerHostVaultLayout(vaultRoot);
  const raw = await fsApi.readFile(layout.configPath, "utf8");
  const previous = parseExistingConfig(raw, layout.configPath);
  const next = update(previous);
  if (!next || typeof next !== "object") throw new Error("SPS Owner Host config update returned no config.");
  const temporaryPath = `${layout.configPath}.${process.pid}.${Date.now()}.tmp`;
  await fsApi.writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fsApi.rename(temporaryPath, layout.configPath);
  return { config: next, layout };
}

export function spsOwnerHostUrl(config) {
  const port = Number(config?.server?.port);
  if (!isUsablePort(port)) throw new Error("SPS Owner Host config has no valid server.port.");
  return `http://127.0.0.1:${port}`;
}

export async function ensureSpsOwnerHostConfig({
  vaultRoot,
  fsApi = { mkdir, readFile, rename, writeFile },
  findPorts = findSpsOwnerHostPorts,
  now,
} = {}) {
  const layout = ownerHostVaultLayout(vaultRoot);
  try {
    const raw = await fsApi.readFile(layout.configPath, "utf8");
    const config = parseExistingConfig(raw, layout.configPath);
    return { config, layout, created: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const ports = await findPorts();
  const config = createSpsOwnerHostConfig({
    vaultRoot: layout.root,
    serverPort: ports.serverPort,
    databasePort: ports.databasePort,
    now,
  });
  await fsApi.mkdir(layout.root, { recursive: true });
  const temporaryPath = `${layout.configPath}.${process.pid}.${Date.now()}.tmp`;
  await fsApi.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await fsApi.rename(temporaryPath, layout.configPath);
  return { config, layout, created: true };
}
