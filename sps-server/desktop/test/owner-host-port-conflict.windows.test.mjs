import assert from "node:assert/strict";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSpsOwnerHostConfig, ownerHostVaultLayout } from "../src/owner-host-config.mjs";
import { createSpsOwnerHostManager, resolveSpsOwnerHostRuntime } from "../src/owner-host.mjs";

test("actual owned Core refuses an occupied configured port and preserves existing database bytes", {
  skip: process.platform !== "win32", timeout: 90_000,
}, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-owned-port-conflict-"));
  const identity = await lstat(root, { bigint: true });
  const temporaryRoot = await realpath(os.tmpdir());
  const listener = createServer((_request, response) => response.writeHead(503).end("owned-test-listener"));
  let manager;
  t.after(async () => {
    if (manager) {
      const stopped = await manager.stop();
      assert.equal(stopped.state, "stopped", "Unconfirmed owned Core must preserve its test directory.");
      assert.equal(stopped.owned, false);
    }
    listener.closeAllConnections();
    if (listener.listening) await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    const current = await lstat(root, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(current[key], identity[key]);
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(path.dirname(await realpath(root)), temporaryRoot);
    assert.ok(path.basename(root).startsWith("sps-owned-port-conflict-"));
    await rm(root, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const layout = ownerHostVaultLayout(root);
  const config = createSpsOwnerHostConfig({ vaultRoot: root, serverPort: address.port, databasePort: 54329 });
  await writeFile(layout.configPath, JSON.stringify(config), { flag: "wx" });
  await mkdir(layout.databaseDir);
  const sentinel = path.join(layout.databaseDir, "existing-data-sentinel");
  const existingBytes = Buffer.from("existing database bytes must remain unchanged");
  await writeFile(sentinel, existingBytes, { flag: "wx" });
  const coreRoot = path.resolve(import.meta.dirname, "../../../external/sps-core");
  const environment = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"]
    .filter(key => typeof process.env[key] === "string").map(key => [key, process.env[key]]));
  manager = createSpsOwnerHostManager({ url: `http://127.0.0.1:${address.port}`, baseEnvironment: environment,
    startupAttempts: 100,
    resolveRuntime: () => resolveSpsOwnerHostRuntime({ coreRoots: [coreRoot], configPath: layout.configPath,
      nodeCommand: process.execPath, environment: { PAPERCLIP_HOME: root, PAPERCLIP_TELEMETRY_DISABLED: "1" } }),
  });
  const status = await manager.start();
  assert.equal(status.state, "stopped");
  assert.equal(status.owned, false);
  assert.match(status.lastError, /configured SPS Desktop Host port is unavailable/);
  assert.equal(listener.listening, true, "The conflicting listener must remain untouched.");
  assert.equal(listener.address().port, address.port);
  assert.deepEqual(await readdir(layout.databaseDir), ["existing-data-sentinel"]);
  assert.deepEqual(await readFile(sentinel), existingBytes);
  await assert.rejects(lstat(path.join(layout.databaseDir, "PG_VERSION")), { code: "ENOENT" });
});
