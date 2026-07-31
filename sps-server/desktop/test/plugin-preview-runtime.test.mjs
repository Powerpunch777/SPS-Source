import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupPluginPreview,
  createPluginPreviewRuntime,
  ensurePluginPreviewConfig,
  ensurePluginPreviewFixture,
  isPluginPreviewBuildId,
  pluginPreviewVaultLayout,
  readPluginPreviewFixture,
  updatePluginPreviewFixture,
} from "../src/plugin-preview-runtime.mjs";

const BUILD_A = "build-123e4567-e89b-12d3-a456-426614174000";
const BUILD_B = "build-123e4567-e89b-12d3-a456-426614174001";

async function temporaryOwnerVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-plugin-preview-"));
  return { root, ownerVault: path.join(root, "owner-vault") };
}

function ports(start = 42_000) {
  return async () => ({ serverPort: start, databasePort: start + 1_000 });
}

test("accepts only build-UUID identifiers and derives a contained preview vault", () => {
  assert.equal(isPluginPreviewBuildId(BUILD_A), true);
  assert.equal(isPluginPreviewBuildId("build-nope"), false);
  assert.throws(() => pluginPreviewVaultLayout({ ownerVault: "C:/vault", buildId: "../build-nope" }));
  const preview = pluginPreviewVaultLayout({ ownerVault: "C:/vault", buildId: BUILD_A });
  assert.equal(preview.previewVault, path.join(path.resolve("C:/vault"), "developer-mode", "previews", BUILD_A));
});

test("creates and safely reuses an isolated local preview config", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const first = await ensurePluginPreviewConfig({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      findPorts: ports(),
      now: new Date("2026-07-31T00:00:00.000Z"),
      createToken: () => "a".repeat(43),
    });
    const second = await ensurePluginPreviewConfig({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      findPorts: ports(43_000),
      createToken: () => "b".repeat(43),
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.url, "http://127.0.0.1:42000");
    assert.equal(second.url, first.url);
    assert.equal(first.accessToken, "a".repeat(43));
    assert.equal(second.accessToken, first.accessToken);
    assert.equal(JSON.stringify(first.config).includes(first.accessToken), false);
    assert.equal(first.config.$meta.source, "doctor");
    assert.equal(first.config.spsPreview.version, 1);
    assert.equal(first.config.spsPreview.buildId, BUILD_A);
    assert.equal(first.config.server.deploymentMode, "local_trusted");
    assert.equal(first.config.server.host, "127.0.0.1");
    assert.equal(first.config.server.serveUi, true);
    assert.equal(first.config.database.backup.enabled, false);
    assert.equal(first.config.telemetry.enabled, false);
    assert.equal(first.config.auth.disableSignUp, true);
    assert.equal(first.config.database.mode, "embedded-postgres");
    assert.equal(first.config.storage.provider, "local_disk");
    assert.equal(first.config.secrets.provider, "local_encrypted");
    for (const entry of [
      first.config.database.embeddedPostgresDataDir,
      first.config.database.backup.dir,
      first.config.storage.localDisk.baseDir,
      first.config.secrets.localEncrypted.keyFilePath,
      first.config.logging.logDir,
    ]) assert.ok(entry.startsWith(first.previewVault));
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("keeps two preview builds independent with their own ports and vaults", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const a = await ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_A, findPorts: ports(42_000) });
    const b = await ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_B, findPorts: ports(43_000) });
    assert.notEqual(a.previewVault, b.previewVault);
    assert.notEqual(a.config.server.port, b.config.server.port);
    assert.notEqual(a.config.database.embeddedPostgresPort, b.config.database.embeddedPostgresPort);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("creates a path-free, immutable default Preview fixture and persists it per build", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const first = await ensurePluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_A });
    const second = await ensurePluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_A });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.fixture.role, "host");
    assert.equal(first.fixture.viewport, "desktop");
    assert.equal(first.fixture.uiState, "live");
    assert.equal(first.fixture.fixtures.node.enabled, true);
    assert.equal(first.fixture.fixtures.runtime.enabled, true);
    assert.equal(first.fixture.fixtures.source.enabled, true);
    assert.equal(Object.isFrozen(first.fixture), true);
    assert.equal(Object.isFrozen(first.fixture.fixtures.node.payload), true);
    assert.equal(JSON.stringify(first.fixture).match(/(?:[A-Za-z]:[\\/]|token|secret|password)/i), null);
    assert.deepEqual(second.fixture, first.fixture);
    assert.equal((await lstat(first.fixturePath)).isFile(), true);
    const persisted = JSON.parse(await readFile(first.fixturePath, "utf8"));
    assert.deepEqual(persisted, first.fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("updates and reloads a normalized Preview fixture without touching another build", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const a = await ensurePluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_A });
    const b = await ensurePluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_B });
    const updated = await updatePluginPreviewFixture({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      fixture: {
        role: "member",
        viewport: "mobile",
        uiState: "loading",
        fixtures: {
          node: { enabled: true, payload: { id: "member-node", label: "Member Node" } },
          runtime: false,
          source: { enabled: false },
        },
      },
    });
    const reloaded = await readPluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_A });
    assert.equal(updated.fixture.role, "member");
    assert.equal(updated.fixture.viewport, "mobile");
    assert.equal(reloaded.fixture.uiState, "loading");
    assert.equal(reloaded.fixture.fixtures.runtime.enabled, false);
    assert.deepEqual((await readPluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_B })).fixture, b.fixture);
    assert.notEqual(a.fixturePath, b.fixturePath);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects unsafe Preview fixture input before replacing the persisted fixture", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const initial = await ensurePluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_A });
    const before = await readFile(initial.fixturePath, "utf8");
    await assert.rejects(updatePluginPreviewFixture({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      fixture: { role: "host", fixtures: { node: { enabled: true, payload: { token: "do-not-store" } } } },
    }), /unsafe or invalid/);
    await assert.rejects(updatePluginPreviewFixture({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      fixture: { role: "host", fixtures: { source: { enabled: true, payload: { location: "C:\\Users\\owner" } } } },
    }), /unsafe or invalid/);
    assert.equal(await readFile(initial.fixturePath, "utf8"), before);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed for malformed, oversized, and symlinked Preview fixture files", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const preview = pluginPreviewVaultLayout({ ownerVault: fixture.ownerVault, buildId: BUILD_A });
    await mkdir(preview.previewVault, { recursive: true });
    await writeFile(preview.fixturePath, "{bad-json", "utf8");
    await assert.rejects(readPluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_A }), /malformed/);

    await writeFile(preview.fixturePath, "x".repeat(64 * 1024 + 1), "utf8");
    await assert.rejects(readPluginPreviewFixture({ ownerVault: fixture.ownerVault, buildId: BUILD_A }), /64KB/);

    await writeFile(preview.fixturePath, "{}", "utf8");
    const symlinkedFixtureFs = {
      ...await import("node:fs/promises"),
      lstat: async (entry) => path.resolve(entry) === path.resolve(preview.fixturePath)
        ? { isFile: () => true, isSymbolicLink: () => true }
        : lstat(entry),
    };
    await assert.rejects(readPluginPreviewFixture({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      fsApi: symlinkedFixtureFs,
    }), /regular file/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed for malformed, tampered, and escaping persisted configs", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const preview = pluginPreviewVaultLayout({ ownerVault: fixture.ownerVault, buildId: BUILD_A });
    await mkdir(preview.previewVault, { recursive: true });
    await writeFile(preview.configPath, "{not-json", "utf8");
    await assert.rejects(ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_A, findPorts: ports() }), /malformed/);

    await writeFile(preview.configPath, JSON.stringify({
      $meta: { version: 1, source: "doctor", updatedAt: "2026-07-31T00:00:00.000Z" },
      spsPreview: { version: 1, buildId: BUILD_B },
    }), "utf8");
    await assert.rejects(ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_A, findPorts: ports() }), /different build/);

    const valid = await ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_B, findPorts: ports(43_000) });
    valid.config.server.host = "0.0.0.0";
    await writeFile(valid.configPath, JSON.stringify(valid.config), "utf8");
    await assert.rejects(ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_B, findPorts: ports() }), /loopback-only/);

    valid.config.server.host = "127.0.0.1";
    valid.config.server.deploymentMode = "authenticated";
    await writeFile(valid.configPath, JSON.stringify(valid.config), "utf8");
    await assert.rejects(ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_B, findPorts: ports() }), /loopback-only/);

    valid.config.server.deploymentMode = "local_trusted";
    valid.config.storage.localDisk.baseDir = path.join(fixture.root, "outside");
    await writeFile(valid.configPath, JSON.stringify(valid.config), "utf8");
    await assert.rejects(ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_B, findPorts: ports() }), /escapes/);

    valid.config.storage.localDisk.baseDir = path.join(valid.previewVault, "storage");
    valid.config.database.mode = "postgres";
    await writeFile(valid.configPath, JSON.stringify(valid.config), "utf8");
    await assert.rejects(
      ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_B, findPorts: ports() }),
      /isolated local providers/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed for symlinked config and cleanup targets", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const preview = pluginPreviewVaultLayout({ ownerVault: fixture.ownerVault, buildId: BUILD_A });
    await mkdir(preview.previewVault, { recursive: true });
    await writeFile(preview.configPath, "{}", "utf8");
    const symlinkedConfigFs = {
      ...await import("node:fs/promises"),
      lstat: async (entry) => path.resolve(entry) === path.resolve(preview.configPath)
        ? { isFile: () => true, isSymbolicLink: () => true }
        : lstat(entry),
    };
    await assert.rejects(ensurePluginPreviewConfig({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      findPorts: ports(),
      fsApi: symlinkedConfigFs,
    }), /regular file/);
    const symlinkedCleanupFs = {
      ...await import("node:fs/promises"),
      lstat: async (entry) => path.resolve(entry) === path.resolve(preview.previewVault)
        ? { isDirectory: () => true, isSymbolicLink: () => true }
        : lstat(entry),
    };
    await assert.rejects(cleanupPluginPreview({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      fsApi: symlinkedCleanupFs,
    }), /preview.*(directory|symbolic)/);
    assert.equal((await lstat(fixture.root)).isDirectory(), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("creates a manager isolated from the main SPS Host with caller-provided runtime dependencies", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    let previewHealthy = false;
    let mainHealthy = true;
    const child = new EventEmitter();
    child.exitCode = null;
    child.kill = () => { child.exitCode = 0; child.emit("exit", 0); };
    const preview = await createPluginPreviewRuntime({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      findPorts: ports(),
      resolveRuntime: async ({ configPath }) => ({ command: "node", args: [configPath], cwd: fixture.root }),
      fetchImpl: async (url) => String(url).includes(":42000")
        ? previewHealthy ? { ok: true, json: async () => ({ status: "ok" }) } : { ok: false }
        : mainHealthy ? { ok: true, json: async () => ({ status: "ok" }) } : { ok: false },
      spawn: () => { previewHealthy = true; return child; },
    });
    const mainManager = {
      inspect: async () => ({ state: mainHealthy ? "running" : "stopped", url: "http://127.0.0.1:31310" }),
    };
    assert.notEqual(preview.manager, mainManager);
    assert.equal((await preview.manager.start()).state, "running");
    assert.equal((await mainManager.inspect()).state, "running");
    await preview.manager.stop();
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("passes only the explicit Preview base environment to its process manager", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    let managerOptions = null;
    const manager = { start: async () => ({ state: "running", owned: true }) };
    const preview = await createPluginPreviewRuntime({
      ownerVault: fixture.ownerVault,
      buildId: BUILD_A,
      findPorts: ports(),
      resolveRuntime: async () => null,
      fetchImpl: async () => ({ ok: false }),
      spawn: () => null,
      baseEnvironment: { PATH: "C:/safe-tools" },
      managerFactory: (options) => {
        managerOptions = options;
        return manager;
      },
    });
    assert.equal(preview.manager, manager);
    assert.deepEqual(managerOptions.baseEnvironment, { PATH: "C:/safe-tools" });
    assert.equal(managerOptions.baseEnvironment.OPENAI_API_KEY, undefined);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("cleanup removes only the selected contained preview vault", async () => {
  const fixture = await temporaryOwnerVault();
  try {
    const a = await ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_A, findPorts: ports() });
    const b = await ensurePluginPreviewConfig({ ownerVault: fixture.ownerVault, buildId: BUILD_B, findPorts: ports(43_000) });
    assert.equal((await cleanupPluginPreview({ ownerVault: fixture.ownerVault, buildId: BUILD_A })).removed, true);
    await assert.rejects(lstat(a.previewVault));
    assert.equal((await lstat(b.previewVault)).isDirectory(), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
