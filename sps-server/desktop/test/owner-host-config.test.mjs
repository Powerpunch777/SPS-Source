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

test("falls back to a dynamic pair and rechecks both ports for availability", async () => {
  const checked = [];
  let allocations = 0;
  const ports = await findSpsOwnerHostPorts({
    serverPort: 31_310,
    databasePort: 54_339,
    attempts: 1,
    isAvailable: async (port) => {
      checked.push(port);
      return port !== 31_310;
    },
    findDynamicPorts: async () => {
      allocations += 1;
      return { serverPort: 32_123, databasePort: 54_123 };
    },
  });

  assert.deepEqual(ports, { serverPort: 32_123, databasePort: 54_123 });
  assert.equal(allocations, 1);
  assert.deepEqual(checked, [31_310, 32_123, 54_123]);
});

test("rejects invalid or duplicate dynamic port pairs", async () => {
  for (const pair of [
    { serverPort: 0, databasePort: 54_123 },
    { serverPort: 32_123, databasePort: 65_536 },
    { serverPort: 32_123, databasePort: 32_123 },
    { serverPort: "32_123", databasePort: 54_123 },
  ]) {
    await assert.rejects(
      findSpsOwnerHostPorts({
        attempts: 1,
        isAvailable: async () => false,
        findDynamicPorts: async () => pair,
      }),
      /could not reserve a local Owner Host port/i,
    );
  }
});

test("rejects a dynamic pair when either fallback port is unavailable", async () => {
  const checked = [];
  await assert.rejects(
    findSpsOwnerHostPorts({
      attempts: 1,
      isAvailable: async (port) => {
        checked.push(port);
        return port !== 31_310 && port !== 54_123;
      },
      findDynamicPorts: async () => ({ serverPort: 32_123, databasePort: 54_123 }),
    }),
    /could not reserve a local Owner Host port/i,
  );
  assert.deepEqual(checked, [31_310, 32_123, 54_123]);
});

test("wraps dynamic allocator failures with the local port selection error", async () => {
  const cause = new Error("OS port allocation failed");
  await assert.rejects(
    findSpsOwnerHostPorts({
      attempts: 1,
      isAvailable: async () => false,
      findDynamicPorts: async () => { throw cause; },
    }),
    (error) => error.message.includes("could not select local Owner Host ports") && error.cause === cause,
  );
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

test("reuses an existing authenticated config without invoking the dynamic allocator", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-owner-host-config-reuse-"));
  let allocatorCalls = 0;
  let portFinderCalls = 0;
  try {
    const vaultRoot = path.join(root, "vault");
    const existing = createSpsOwnerHostConfig({
      vaultRoot,
      serverPort: 31_310,
      databasePort: 54_339,
    });
    await mkdir(vaultRoot, { recursive: true });
    await writeFile(path.join(vaultRoot, "config.json"), JSON.stringify(existing), "utf8");

    const result = await ensureSpsOwnerHostConfig({
      vaultRoot,
      findPorts: async () => {
        portFinderCalls += 1;
        return await findSpsOwnerHostPorts({
          attempts: 1,
          isAvailable: async () => false,
          findDynamicPorts: async () => {
            allocatorCalls += 1;
            throw new Error("allocator must not run for an existing config");
          },
        });
      },
    });

    assert.equal(result.created, false);
    assert.equal(result.config.server.port, 31_310);
    assert.equal(result.config.database.embeddedPostgresPort, 54_339);
    assert.equal(portFinderCalls, 0);
    assert.equal(allocatorCalls, 0);
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
