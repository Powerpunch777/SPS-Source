import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSpsDefaultMemoryConfig, defaultMemoryVaultLayout } from "../src/default-memory-host.mjs";
import { readSpsDesktopPluginArtifactInputs } from "../src/desktop-artifact-inputs.mjs";
import { createSpsOwnerHostConfig, ownerHostVaultLayout } from "../src/owner-host-config.mjs";
import { captureSpsOwnerHostRuntimeReferences } from "../src/owner-host-runtime-references.mjs";
import { captureSpsDesktopSourceArtifactReferences } from "../src/desktop-source-artifact-references.mjs";

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-desktop-artifact-inputs-"));
  try { await run(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function writeCanonical(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeVault(root, { indexes = true } = {}) {
  const vaultRoot = path.join(root, "owner-vault");
  await fs.mkdir(vaultRoot, { recursive: true });
  const coreConfigPath = ownerHostVaultLayout(vaultRoot).configPath;
  const coreConfig = createSpsOwnerHostConfig({ vaultRoot, serverPort: 31310, databasePort: 54321 });
  await writeCanonical(coreConfigPath, coreConfig);

  const memoryConfigPath = defaultMemoryVaultLayout(vaultRoot).configPath;
  const memoryConfig = createSpsDefaultMemoryConfig({ ownerVaultRoot: vaultRoot, port: 31311, token: "memory-private-token" });
  await writeCanonical(memoryConfigPath, memoryConfig);

  if (indexes) {
    await writeCanonical(path.join(vaultRoot, "developer-mode", "projects.json"), { schemaVersion: 1, projects: [] });
    await writeCanonical(path.join(vaultRoot, "registry-sources", "sources.json"), { schemaVersion: 1, sources: [] });
  }
  return { vaultRoot, coreConfigPath, memoryConfigPath };
}

function coreRuntime(configPath, cwd) {
  const captured = captureSpsOwnerHostRuntimeReferences({
    kind: "packaged-owner-runtime",
    command: process.execPath,
    cwd,
    args: ["sps-owner-host-bootstrap.mjs"],
    environment: { PAPERCLIP_CONFIG: configPath },
  }, {});
  assert.equal(captured.snapshot.available, true);
  return {
    readRuntimeArtifactReferences: () => captured.snapshot,
  };
}

function memoryRuntime(configPath, root) {
  const refs = [
    ["command", process.execPath, "file"],
    ["entry", path.join(root, "memory-sidecar.mjs"), "file"],
    ["cwd", root, "directory"],
    ["config", configPath, "file"],
  ].map(([label, referencePath, kind]) => Object.freeze({
    source: "desktop-memory-runtime",
    ownerId: `fixture-memory:${label}`,
    state: "retained",
    path: referencePath,
    kind,
  }));
  return { readRuntimeArtifactReferences: () => Object.freeze({ available: true, references: Object.freeze(refs) }) };
}

const authorized = () => undefined;

test("retains the private Source reader for exact synchronous reconciliation under current authority", async () => {
  await fixture(async root => {
    const { vaultRoot, coreConfigPath } = await makeVault(root);
    const hostOrigin = "http://127.0.0.1:31310";
    const id = "11111111-1111-4111-8111-111111111111", workspaceId = "22222222-2222-4222-8222-222222222222";
    const sourcePath = path.join(root, "mapped-source");
    await fs.mkdir(sourcePath);
    const state = { profile: { connectionKind: "owner-host", hubUrl: hostOrigin, companyId: workspaceId,
      workspaceSources: [{ id, name: "Source", sourcePath }] }, accountConnections: {}, encryptedShareState: null };
    let current = true;
    const result = await readSpsDesktopPluginArtifactInputs({ vaultRoot,
      runtimeOwners: [{ kind: "core", manager: coreRuntime(coreConfigPath, root) }],
      assertCurrent() { if (!current) throw new Error("Host changed"); },
      readSourceReferences: () => captureSpsDesktopSourceArtifactReferences({ hostOrigin, readState: () => state,
        readShareState: () => assert.fail("No protected credentials in fixture.") }),
    });
    const sources = [{ kind: "workspace", id, workspaceId, resourceId: id, status: "available",
      routeFingerprint: null, revision: "2026-11-02T03:04:05.006Z" }];
    const inventory = { sources, grants: [], fingerprint: createHash("sha256").update(JSON.stringify([sources, []])).digest("hex") };
    const receipt = result.reconcileSourceInventory(inventory);
    assert.deepEqual(receipt, { sourceCount: 1, grantCount: 0, fingerprint: inventory.fingerprint });
    assert.ok(Object.isFrozen(receipt));
    current = false;
    assert.throws(() => result.reconcileSourceInventory(inventory), /Host changed/);
    current = true;
    state.profile.workspaceSources[0].sourcePath = path.join(root, "replacement");
    assert.throws(() => result.reconcileSourceInventory(inventory), /Source references are unavailable/);
  });
});

test("missing and asynchronous Source reconciliation cannot become a synchronous receipt", async () => {
  await fixture(async root => {
    const { vaultRoot, coreConfigPath } = await makeVault(root);
    const base = { vaultRoot, runtimeOwners: [{ kind: "core", manager: coreRuntime(coreConfigPath, root) }], assertCurrent: authorized };
    const missing = await readSpsDesktopPluginArtifactInputs(base);
    assert.throws(() => missing.reconcileSourceInventory({}));
    for (const readSourceReferences of [async () => ({ references: [], assertCurrent() {} }), async () => { throw new Error("reader unavailable"); }]) {
      await assert.rejects(readSpsDesktopPluginArtifactInputs({ ...base, readSourceReferences }));
    }
    for (const reconcileSourceInventory of [async () => Object.freeze({}), async () => { throw new Error("unavailable"); }]) {
      const result = await readSpsDesktopPluginArtifactInputs({ ...base,
        readSourceReferences: () => ({ references: [], assertCurrent() {}, reconcileSourceInventory }),
      });
      assert.throws(() => result.reconcileSourceInventory({}));
    }
  });
});

test("composes named runtime/config, developer and Registry refs without protecting the Vault root", async () => {
  await fixture(async root => {
    const { vaultRoot, coreConfigPath, memoryConfigPath } = await makeVault(root);
    const core = coreRuntime(coreConfigPath, path.join(root, "core-workdir"));
    const memoryRuntimeRoot = path.join(root, "memory-runtime");
    const memory = memoryRuntime(memoryConfigPath, memoryRuntimeRoot);
    const preview = {
      fixturePath: path.join(root, "preview", "fixture-v1.json"),
      accessTokenPath: path.join(root, "preview", "desktop-access.token"),
    };
    await writeCanonical(preview.fixturePath, { fixture: true });
    await fs.writeFile(preview.accessTokenPath, "private-preview-token\n", "utf8");

    const result = await readSpsDesktopPluginArtifactInputs({
      vaultRoot,
      runtimeOwners: [{ kind: "core", manager: core }, { kind: "memory", manager: memory }],
      preview,
      configuredMemoryPath: memoryConfigPath,
      assertCurrent: authorized,
    });
    const byPath = new Map(result.references.map(reference => [reference.path, reference]));
    const layout = ownerHostVaultLayout(vaultRoot);
    const memoryLayout = defaultMemoryVaultLayout(vaultRoot);
    for (const [referencePath, kind] of [
      [coreConfigPath, "file"],
      [layout.databaseDir, "directory"], [layout.backupDir, "directory"], [layout.logDir, "directory"],
      [layout.storageDir, "directory"], [layout.secretsPath, "file"],
      [memoryConfigPath, "file"], [memoryLayout.dataDir, "directory"], [memoryLayout.journalsDir, "directory"],
      [preview.fixturePath, "file"], [preview.accessTokenPath, "file"],
    ]) assert.equal(byPath.get(referencePath)?.kind, kind, `expected reference for ${referencePath}`);

    assert.ok(result.references.some(reference => reference.path === path.join(memoryRuntimeRoot, "memory-sidecar.mjs")
      && reference.ownerId === "fixture-memory:entry"));
    assert.ok(result.references.some(reference => reference.source === "desktop-developer-index"
      && reference.path === path.join(vaultRoot, "developer-mode", "projects.json")));
    assert.ok(result.references.some(reference => reference.source === "desktop-registry-source-index"
      && reference.path === path.join(vaultRoot, "registry-sources", "sources.json")));
    assert.ok(result.references.every(reference => reference.path !== vaultRoot));
    assert.equal(JSON.stringify(result.references).includes("memory-private-token"), false);
    assert.equal(JSON.stringify(result.references).includes("private-preview-token"), false);
    assert.equal(Object.isFrozen(result) && Object.isFrozen(result.references), true);
    assert.ok(result.references.every(Object.isFrozen));
    await assert.doesNotReject(result.assertCurrent());
  });
});

test("allows missing Developer and Registry indexes but invalidates when either appears", async () => {
  await fixture(async root => {
    const { vaultRoot, coreConfigPath } = await makeVault(root, { indexes: false });
    const result = await readSpsDesktopPluginArtifactInputs({
      vaultRoot,
      runtimeOwners: [{ kind: "core", manager: coreRuntime(coreConfigPath, path.join(root, "core-workdir")) }],
      assertCurrent: authorized,
    });
    assert.ok(result.references.some(reference => reference.source === "desktop-developer-index"));
    assert.ok(result.references.some(reference => reference.source === "desktop-registry-source-index"));
    await assert.doesNotReject(result.assertCurrent());

    await writeCanonical(path.join(vaultRoot, "developer-mode", "projects.json"), { schemaVersion: 1, projects: [] });
    await assert.rejects(result.assertCurrent());
  });

  await fixture(async root => {
    const { vaultRoot, coreConfigPath } = await makeVault(root, { indexes: false });
    const result = await readSpsDesktopPluginArtifactInputs({
      vaultRoot,
      runtimeOwners: [{ kind: "core", manager: coreRuntime(coreConfigPath, path.join(root, "core-workdir")) }],
      assertCurrent: authorized,
    });
    await writeCanonical(path.join(vaultRoot, "registry-sources", "sources.json"), { schemaVersion: 1, sources: [] });
    await assert.rejects(result.assertCurrent());
  });
});

test("invalidates metadata edits to existing Developer and Registry indexes", async () => {
  await fixture(async root => {
    const { vaultRoot, coreConfigPath } = await makeVault(root);
    const sourcePath = path.join(root, "developer-source");
    await fs.mkdir(sourcePath, { recursive: true });
    const projectsPath = path.join(vaultRoot, "developer-mode", "projects.json");
    const project = { id: "dev-11111111-1111-4111-8111-111111111111", displayName: "Initial",
      sourcePath, createdAt: "2026-11-02T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" };
    await writeCanonical(projectsPath, { schemaVersion: 1, projects: [project] });
    const result = await readSpsDesktopPluginArtifactInputs({
      vaultRoot,
      runtimeOwners: [{ kind: "core", manager: coreRuntime(coreConfigPath, path.join(root, "core-workdir")) }],
      assertCurrent: authorized,
    });
    await writeCanonical(projectsPath, { schemaVersion: 1, projects: [{ ...project, displayName: "Changed" }] });
    await assert.rejects(result.assertCurrent());
  });

  await fixture(async root => {
    const { vaultRoot, coreConfigPath } = await makeVault(root);
    const localPath = path.join(root, "local-registry");
    await fs.mkdir(localPath, { recursive: true });
    const sourcesPath = path.join(vaultRoot, "registry-sources", "sources.json");
    const source = { id: "io.sps.local", kind: "local", displayName: "Initial Registry", localPath };
    await writeCanonical(sourcesPath, { schemaVersion: 1, sources: [source] });
    const result = await readSpsDesktopPluginArtifactInputs({
      vaultRoot,
      runtimeOwners: [{ kind: "core", manager: coreRuntime(coreConfigPath, path.join(root, "core-workdir")) }],
      assertCurrent: authorized,
    });
    await writeCanonical(sourcesPath, { schemaVersion: 1, sources: [{ ...source, displayName: "Changed Registry" }] });
    await assert.rejects(result.assertCurrent());
  });
});

test("denies false or asynchronous authority receipts before reading runtime references", async () => {
  await fixture(async root => {
    const { vaultRoot } = await makeVault(root);
    let reads = 0;
    const manager = { readRuntimeArtifactReferences() { reads++; return { available: true, references: [] }; } };
    for (const assertCurrent of [() => false, async () => undefined, async () => { throw new Error("revoked"); }]) {
      await assert.rejects(readSpsDesktopPluginArtifactInputs({
        vaultRoot, runtimeOwners: [{ kind: "core", manager }], assertCurrent,
      }));
    }
    assert.equal(reads, 0);
  });
});

test("rejects unavailable or replaced runtime snapshots", async () => {
  await fixture(async root => {
    const { vaultRoot, coreConfigPath } = await makeVault(root);
    const core = coreRuntime(coreConfigPath, path.join(root, "core-workdir"));
    await assert.rejects(readSpsDesktopPluginArtifactInputs({
      vaultRoot,
      runtimeOwners: [{ kind: "core", manager: { readRuntimeArtifactReferences: () => ({ available: false, references: [] }) } }],
      assertCurrent: authorized,
    }));

    let current = core.readRuntimeArtifactReferences();
    const changing = { readRuntimeArtifactReferences: () => current };
    const result = await readSpsDesktopPluginArtifactInputs({
      vaultRoot, runtimeOwners: [{ kind: "core", manager: changing }], assertCurrent: authorized,
    });
    current = Object.freeze({ available: true, references: Object.freeze([
      ...current.references,
      Object.freeze({ source: "desktop-owned-runtime", ownerId: "replacement", state: "retained", path: process.execPath, kind: "file" }),
    ]) });
    await assert.rejects(result.assertCurrent());
  });
});

test("retains configured Memory paths while its runtime is stopped and rejects an omitted configured path", async () => {
  await fixture(async root => {
    const { vaultRoot, coreConfigPath, memoryConfigPath } = await makeVault(root);
    const memory = { readRuntimeArtifactReferences: () => Object.freeze({ available: true, references: Object.freeze([]) }) };
    const options = {
      vaultRoot,
      runtimeOwners: [
        { kind: "core", manager: coreRuntime(coreConfigPath, path.join(root, "core-workdir")) },
        { kind: "memory", manager: memory },
      ],
      configuredMemoryPath: memoryConfigPath,
      assertCurrent: authorized,
    };
    const result = await readSpsDesktopPluginArtifactInputs(options);
    const memoryLayout = defaultMemoryVaultLayout(vaultRoot);
    for (const [referencePath, kind] of [
      [memoryConfigPath, "file"],
      [memoryLayout.dataDir, "directory"],
      [memoryLayout.journalsDir, "directory"],
    ]) assert.ok(result.references.some(reference => reference.path === referencePath && reference.kind === kind));
    assert.equal(result.references.filter(reference => reference.path === memoryConfigPath).length, 1);

    const { configuredMemoryPath: _omitted, ...withoutConfiguredPath } = options;
    await assert.rejects(readSpsDesktopPluginArtifactInputs(withoutConfiguredPath));
  });
});

test("rejects unknown owners and a missing live Core config instead of returning an empty list", async () => {
  await fixture(async root => {
    const { vaultRoot, coreConfigPath } = await makeVault(root);
    await assert.rejects(readSpsDesktopPluginArtifactInputs({
      vaultRoot,
      runtimeOwners: [{ kind: "unknown", manager: coreRuntime(coreConfigPath, path.join(root, "core-workdir")) }],
      assertCurrent: authorized,
    }));
    await assert.rejects(readSpsDesktopPluginArtifactInputs({
      vaultRoot,
      runtimeOwners: [{ kind: "core", manager: coreRuntime(path.join(root, "missing-config.json"), path.join(root, "core-workdir")) }],
      assertCurrent: authorized,
    }));
  });
});
