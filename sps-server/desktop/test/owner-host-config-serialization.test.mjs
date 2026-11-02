import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";
import {
  createSpsOwnerHostConfig,
  ownerHostVaultLayout,
  updateSpsOwnerHostConfig,
} from "../src/owner-host-config.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function createVault(t, name = "vault") {
  const fixture = await createWorkspaceE2eFixture();
  t.after(async () => {
    await fixture.assertCurrent();
    await fixture.remove();
  });

  const vaultRoot = path.join(fixture.directory, name);
  await fs.mkdir(vaultRoot);
  const layout = ownerHostVaultLayout(vaultRoot);
  const config = createSpsOwnerHostConfig({ vaultRoot, serverPort: 31_310, databasePort: 54_339 });
  await fs.writeFile(layout.configPath, JSON.stringify(config), "utf8");
  return { vaultRoot, layout, config };
}

async function readSavedConfig(configPath) {
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

test("concurrent updates preserve both fields and leave only valid config JSON", { timeout: 10_000 }, async t => {
  const { vaultRoot, layout } = await createVault(t);

  await Promise.all([
    updateSpsOwnerHostConfig({
      vaultRoot,
      update: previous => ({ ...previous, server: { ...previous.server, port: 31_311 } }),
    }),
    updateSpsOwnerHostConfig({
      vaultRoot,
      update: previous => ({
        ...previous,
        database: { ...previous.database, embeddedPostgresPort: 54_340 },
      }),
    }),
  ]);

  const saved = await readSavedConfig(layout.configPath);
  assert.equal(saved.server.port, 31_311);
  assert.equal(saved.database.embeddedPostgresPort, 54_340);
  assert.deepEqual((await fs.readdir(vaultRoot)).sort(), ["config.json"]);
});

test("the next update reads only after the first update publishes", { timeout: 10_000 }, async t => {
  const { vaultRoot, layout } = await createVault(t);
  const firstOpen = deferred();
  const releaseFirstOpen = deferred();
  let openCalls = 0;
  let readCalls = 0;
  let secondReadServerPort;
  const fsApi = {
    ...fs,
    readFile: async (...args) => {
      readCalls += 1;
      const raw = await fs.readFile(...args);
      if (readCalls === 2) secondReadServerPort = JSON.parse(raw).server.port;
      return raw;
    },
    open: async (...args) => {
      openCalls += 1;
      if (openCalls === 1) {
        firstOpen.resolve();
        await releaseFirstOpen.promise;
      }
      return fs.open(...args);
    },
  };

  let firstUpdate;
  let secondUpdate;
  try {
    firstUpdate = updateSpsOwnerHostConfig({
      vaultRoot,
      fsApi,
      update: previous => ({ ...previous, server: { ...previous.server, port: 31_311 } }),
    });
    await firstOpen.promise;
    secondUpdate = updateSpsOwnerHostConfig({
      vaultRoot,
      fsApi,
      update: previous => ({
        ...previous,
        database: { ...previous.database, embeddedPostgresPort: 54_340 },
      }),
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(readCalls, 1, "the queued update must not read before the first publish");
  } finally {
    releaseFirstOpen.resolve();
    await Promise.allSettled([firstUpdate, secondUpdate].filter(Boolean));
  }

  await Promise.all([firstUpdate, secondUpdate]);
  assert.equal(secondReadServerPort, 31_311);
  const saved = await readSavedConfig(layout.configPath);
  assert.equal(saved.server.port, 31_311);
  assert.equal(saved.database.embeddedPostgresPort, 54_340);
});

test("a rejected callback does not poison the Vault update queue", { timeout: 10_000 }, async t => {
  const { vaultRoot, layout } = await createVault(t);
  const firstRead = deferred();
  const releaseFirstRead = deferred();
  let realpathCalls = 0;
  let readCalls = 0;
  const secondCanonicalRoot = deferred();
  const fsApi = {
    ...fs,
    realpath: async (...args) => {
      const result = await fs.realpath(...args);
      realpathCalls += 1;
      if (realpathCalls === 2) secondCanonicalRoot.resolve();
      return result;
    },
    readFile: async (...args) => {
      const raw = await fs.readFile(...args);
      readCalls += 1;
      if (readCalls === 1) {
        firstRead.resolve();
        await releaseFirstRead.promise;
      }
      return raw;
    },
  };

  const firstUpdate = updateSpsOwnerHostConfig({
    vaultRoot,
    fsApi,
    update: previous => {
      throw new Error("intentional callback failure");
    },
  });
  const firstRejected = assert.rejects(firstUpdate, /intentional callback failure/);
  await firstRead.promise;

  const secondUpdate = updateSpsOwnerHostConfig({
    vaultRoot,
    fsApi,
    update: previous => ({ ...previous, server: { ...previous.server, port: 31_311 } }),
  });
  await secondCanonicalRoot.promise;
  await new Promise(resolve => setImmediate(resolve));
  releaseFirstRead.resolve();

  await firstRejected;
  await secondUpdate;
  const saved = await readSavedConfig(layout.configPath);
  assert.equal(saved.server.port, 31_311);
});

test("an update in a different Vault proceeds while the first Vault is held", { timeout: 10_000 }, async t => {
  const { vaultRoot: vaultA } = await createVault(t, "vault-a");
  const { vaultRoot: vaultB, layout: layoutB } = await createVault(t, "vault-b");
  const firstOpen = deferred();
  const releaseFirstOpen = deferred();
  let vaultAStarted = false;
  let vaultAFinished = false;
  const fsApi = {
    ...fs,
    open: async (filePath, ...args) => {
      if (!vaultAStarted && path.dirname(filePath) === vaultA) {
        vaultAStarted = true;
        firstOpen.resolve();
        await releaseFirstOpen.promise;
      }
      return fs.open(filePath, ...args);
    },
  };

  let updateA;
  try {
    updateA = updateSpsOwnerHostConfig({
      vaultRoot: vaultA,
      fsApi,
      update: previous => ({ ...previous, server: { ...previous.server, port: 31_311 } }),
    }).then(result => { vaultAFinished = true; return result; });
    await firstOpen.promise;

    const updateB = updateSpsOwnerHostConfig({
      vaultRoot: vaultB,
      fsApi,
      update: previous => ({
        ...previous,
        database: { ...previous.database, embeddedPostgresPort: 54_340 },
      }),
    });
    let timeout;
    try {
      await Promise.race([
        updateB,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("different Vault update was blocked")), 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    assert.equal(vaultAFinished, false);
    assert.equal((await readSavedConfig(layoutB.configPath)).database.embeddedPostgresPort, 54_340);
  } finally {
    releaseFirstOpen.resolve();
    await Promise.allSettled([updateA].filter(Boolean));
  }

  await updateA;
});

test("two owned paths to the same canonical Vault share the update queue", { timeout: 10_000 }, async t => {
  const fixture = await createWorkspaceE2eFixture();
  t.after(() => fixture.remove());
  const root = path.join(fixture.directory, "vault");
  const alias = path.join(fixture.directory, "vault-alias");
  await fs.mkdir(root);
  await fs.symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
  const configPath = path.join(root, "config.json");
  await fs.writeFile(configPath, JSON.stringify(createSpsOwnerHostConfig({ vaultRoot: root, serverPort: 31310, databasePort: 54339 })));
  const started = deferred(), release = deferred(), canonical = deferred();
  let reads = 0, opens = 0;
  const fsApi = { ...fs,
    async realpath(value) { const result = await fs.realpath(value); if (value === alias) canonical.resolve(); return result; },
    async readFile(...args) { reads += 1; return fs.readFile(...args); },
    async open(...args) { if (++opens === 1) { started.resolve(); await release.promise; } return fs.open(...args); },
  };
  const first = updateSpsOwnerHostConfig({ vaultRoot: root, fsApi, update: value => ({ ...value, server: { ...value.server, port: 31311 } }) });
  let second;
  try {
    await started.promise;
    second = updateSpsOwnerHostConfig({ vaultRoot: alias, fsApi, update: value => ({ ...value, database: { ...value.database, embeddedPostgresPort: 54340 } }) });
    await canonical.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1);
  } finally {
    release.resolve();
    await Promise.allSettled([first, second].filter(Boolean));
  }
  await Promise.all([first, second]);
  const saved = await readSavedConfig(configPath);
  assert.equal(saved.server.port, 31311);
  assert.equal(saved.database.embeddedPostgresPort, 54340);
});
