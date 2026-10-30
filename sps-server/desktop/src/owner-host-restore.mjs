import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function usage() {
  throw new Error("SPS Owner Host restore requires config, backup, and Core runtime module paths.");
}

async function loadModule(filePath) {
  return await import(pathToFileURL(path.resolve(filePath)).href);
}

const [configPath, backupFile, dbModulePath, embeddedPostgresModulePath] = process.argv.slice(2);
if (!configPath || !backupFile || !dbModulePath || !embeddedPostgresModulePath) usage();

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const configuredDatabaseDir = config.database?.embeddedPostgresDataDir;
if (typeof configuredDatabaseDir !== "string" || configuredDatabaseDir.trim().length === 0) {
  throw new Error("SPS restore config is missing database.embeddedPostgresDataDir.");
}
const databaseDir = path.resolve(configuredDatabaseDir);
const port = Number(config.database?.embeddedPostgresPort);
if (!databaseDir || !Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("SPS restore config has no valid embedded PostgreSQL database path or port.");
}

const db = await loadModule(dbModulePath);
const embeddedModule = await loadModule(embeddedPostgresModulePath);
await db.prepareEmbeddedPostgresNativeRuntime?.();

const instance = new embeddedModule.default({
  databaseDir,
  user: "paperclip",
  password: "paperclip",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
});

let restoreFailed = false;
let restoreError;
try {
  await fs.mkdir(databaseDir, { recursive: true });
  await instance.initialise();
  await instance.start();
  const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/postgres`;
  await db.ensurePostgresDatabase(adminConnectionString, "paperclip");
  const connectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
  await db.runDatabaseRestore({
    connectionString,
    backupFile: path.resolve(backupFile),
    connectTimeoutSeconds: 30,
  });
  await db.sanitizePostRestoreDatabase(connectionString);
} catch (error) {
  restoreFailed = true;
  restoreError = error;
}
try {
  await instance.stop();
} catch (shutdownError) {
  if (restoreFailed) throw new AggregateError([restoreError, shutdownError], "SPS Host restore and database shutdown both failed.");
  throw new Error("SPS Host restore database shutdown was not confirmed.", { cause: shutdownError });
}
if (restoreFailed) throw restoreError;
