import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  configureSpsOwnerHostAuthenticatedLocal,
  configureSpsOwnerHostPrivateTeamAccess,
  createSpsOwnerHostConfig,
  ensureSpsOwnerHostConfig,
  findSpsOwnerHostPorts,
  ownerHostVaultLayout,
  rebaseSpsOwnerHostConfigPaths,
  spsOwnerHostUrl,
} from "../src/owner-host-config.mjs";

test("creates a self-contained Owner Vault config", () => {
  const config = createSpsOwnerHostConfig({
    vaultRoot: "C:/SPS Vault",
    serverPort: 31_310,
    databasePort: 54_339,
    now: new Date("2026-07-19T00:00:00.000Z"),
  });

  assert.equal(config.server.deploymentMode, "authenticated");
  assert.equal(config.server.host, "127.0.0.1");
  assert.equal(config.database.embeddedPostgresDataDir, "C:\\SPS Vault\\database");
  assert.equal(config.storage.localDisk.baseDir, "C:\\SPS Vault\\storage");
  assert.equal(config.secrets.localEncrypted.keyFilePath, "C:\\SPS Vault\\secrets\\master.key");
  assert.equal(spsOwnerHostUrl(config), "http://127.0.0.1:31310");
});

test("selects the first pair of available Owner Host ports", async () => {
  const checked = [];
  const ports = await findSpsOwnerHostPorts({
    serverPort: 31_310,
    databasePort: 54_339,
    isAvailable: async (port) => {
      checked.push(port);
      return port !== 31_310 && port !== 54_339;
    },
  });

  assert.deepEqual(ports, { serverPort: 31_311, databasePort: 54_340 });
  assert.deepEqual(checked, [31_310, 31_311, 54_340]);
});

test("keeps all Owner Host data inside its vault layout", () => {
  const layout = ownerHostVaultLayout("C:/SPS Vault");
  for (const value of Object.values(layout)) {
    assert.match(value, /^C:\\SPS Vault/);
  }
});

test("rebases every machine-local Owner Host path after a staged restore is promoted", () => {
  const staged = createSpsOwnerHostConfig({
    vaultRoot: "C:/SPS staging",
    serverPort: 31_310,
    databasePort: 54_339,
  });

  const restored = rebaseSpsOwnerHostConfigPaths(staged, {
    vaultRoot: "C:/SPS final",
    now: new Date("2026-08-02T00:00:00.000Z"),
  });

  assert.equal(restored.server.port, 31_310);
  assert.equal(restored.database.embeddedPostgresPort, 54_339);
  assert.equal(restored.database.embeddedPostgresDataDir, "C:\\SPS final\\database");
  assert.equal(restored.database.backup.dir, "C:\\SPS final\\backups");
  assert.equal(restored.logging.logDir, "C:\\SPS final\\logs");
  assert.equal(restored.storage.localDisk.baseDir, "C:\\SPS final\\storage");
  assert.equal(restored.secrets.localEncrypted.keyFilePath, "C:\\SPS final\\secrets\\master.key");
  assert.equal(JSON.stringify(restored).includes("SPS staging"), false);
});

test("upgrades an existing local-trusted Owner Vault without moving its data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-owner-host-config-"));
  try {
    const vaultRoot = path.join(root, "vault");
    const oldConfig = createSpsOwnerHostConfig({
      vaultRoot,
      serverPort: 31_310,
      databasePort: 54_339,
    });
    oldConfig.server.deploymentMode = "local_trusted";
    await mkdir(vaultRoot, { recursive: true });
    await writeFile(path.join(vaultRoot, "config.json"), JSON.stringify(oldConfig), "utf8");

    const result = await ensureSpsOwnerHostConfig({ vaultRoot });

    assert.equal(result.created, false);
    assert.equal(result.upgraded, true);
    assert.equal(result.config.server.deploymentMode, "authenticated");
    assert.equal(result.config.server.port, 31_310);
    assert.equal(result.config.database.embeddedPostgresPort, 54_339);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("switches the Owner Host to authenticated private Tailnet access without opening its Core port", () => {
  const base = createSpsOwnerHostConfig({
    vaultRoot: "C:/SPS Vault",
    serverPort: 31_310,
    databasePort: 54_339,
  });
  const team = configureSpsOwnerHostPrivateTeamAccess(base, {
    hostname: "main-computer.tail1725c2.ts.net.",
    now: new Date("2026-07-19T01:00:00.000Z"),
  });
  assert.equal(team.server.deploymentMode, "authenticated");
  assert.equal(team.server.exposure, "private");
  assert.equal(team.server.bind, "loopback");
  assert.equal(team.server.host, "127.0.0.1");
  assert.deepEqual(team.server.allowedHostnames, ["main-computer.tail1725c2.ts.net"]);
  assert.deepEqual(team.auth, {
    baseUrlMode: "explicit",
    publicBaseUrl: "https://main-computer.tail1725c2.ts.net",
    disableSignUp: false,
  });
  assert.equal(configureSpsOwnerHostAuthenticatedLocal(team).server.deploymentMode, "authenticated");
});
