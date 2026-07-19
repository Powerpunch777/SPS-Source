import test from "node:test";
import assert from "node:assert/strict";
import {
  configureSpsOwnerHostLocalOnly,
  configureSpsOwnerHostPrivateTeamAccess,
  createSpsOwnerHostConfig,
  findSpsOwnerHostPorts,
  ownerHostVaultLayout,
  spsOwnerHostUrl,
} from "../src/owner-host-config.mjs";

test("creates a self-contained Owner Vault config", () => {
  const config = createSpsOwnerHostConfig({
    vaultRoot: "C:/SPS Vault",
    serverPort: 31_310,
    databasePort: 54_339,
    now: new Date("2026-07-19T00:00:00.000Z"),
  });

  assert.equal(config.server.deploymentMode, "local_trusted");
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
  assert.equal(configureSpsOwnerHostLocalOnly(team).server.deploymentMode, "local_trusted");
});
