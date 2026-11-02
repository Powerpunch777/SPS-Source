import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createSpsDesktopPluginArtifactActivityGate } from "../src/plugin-artifact-activity-gate.mjs";
import { createSpsOwnerVaultOperationGate } from "../src/owner-vault-operation-gate.mjs";
import { createSpsPluginPreviewOperationGate } from "../src/plugin-preview-operation-gate.mjs";

const source = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const entries = [
  ["materializeCurrentSpsOwnerHostRuntime", []], ["stageRegistryPluginFromFilePicker", []],
  ["listDesktopBundledPluginReviews", []], ["stageDesktopBundledPluginReview", ["plugin"]],
  ["addDesktopRegistrySource", [{ id: "source" }]], ["removeDesktopRegistrySource", ["source"]],
  ["stageDesktopRegistryRelease", [{ sourceId: "source", pluginId: "plugin", version: "1.0.0" }]],
  ["enableDesktopRegistryStage", ["stage"]], ["connectDesktopDeveloperProject", [{ id: "project" }]],
  ["withDeveloperProjectOperation", ["project", () => {}]],
  ["updateDesktopPluginPreviewEnvironment", [{ role: "member" }]],
  ["reloadDesktopDeveloperUi", ["project"]], ["restartDesktopDeveloperWorker", ["project"]],
  ["removeDesktopDeveloperProject", ["project"]], ["exportOwnerVaultTransfer", []],
];

for (const [name, args] of entries) {
  test(`actual Main ${name} retains artifact activity across the complete delegated operation`, async () => {
    const gate = createSpsDesktopPluginArtifactActivityGate();
    const hold = deferred();
    const calls = [];
    const context = { desktopPluginArtifactActivity: gate, [`${name}Active`]: (...input) => { calls.push(input); return hold.promise; } };
    const begin = source.indexOf(`async function ${name}(`);
    const end = source.indexOf(`async function ${name}Active(`, begin);
    assert.ok(begin > 0 && end > begin, `Missing actual Main wrapper for ${name}`);
    runInNewContext(`${source.slice(begin, end)}\nthis.entry=${name};`, context);
    await gate.withMaintenance(async () => {
      await assert.rejects(context.entry(...args), /maintenance/);
      assert.equal(calls.length, 0, "Maintenance must reject before the delegated operation can touch files.");
    });
    const operation = context.entry(...args);
    assert.equal(calls.length, 1);
    assert.throws(() => gate.withMaintenance(async () => {}), /in progress/);
    hold.resolve("original-result");
    assert.equal(await operation, "original-result");
    await gate.withMaintenance(async () => {});
    context[`${name}Active`] = async () => { throw new Error("original-failure"); };
    await assert.rejects(context.entry(...args), /original-failure/);
    await gate.withMaintenance(async () => {});
  });
}

test("Main injects the same artifact coordinator into both Owner Vault and Preview lifecycles", () => {
  assert.match(source, /const pluginPreviewOperations = createSpsPluginPreviewOperationGate\(\{ withArtifactActivity: desktopPluginArtifactActivity\.withActivity \}\)/);
  assert.match(source, /const ownerVaultOperations = createSpsOwnerVaultOperationGate\(\{\s+withArtifactActivity: desktopPluginArtifactActivity\.withActivity,/);
});

test("artifact maintenance denies account/start/restore before invalidation, generation or external effects", async () => {
  const artifacts = createSpsDesktopPluginArtifactActivityGate();
  let invalidations = 0, effects = 0;
  const vault = createSpsOwnerVaultOperationGate({ withArtifactActivity: artifacts.withActivity,
    onInvalidation: () => { invalidations += 1; } });
  await artifacts.withMaintenance(async () => {
    for (const operation of ["changeConnection", "start", "restore"]) {
      await assert.rejects(vault[operation](() => { effects += 1; }), /maintenance/);
    }
    assert.equal(vault.connectionGeneration(), 0n);
    assert.equal(vault.isRestoring(), false);
    assert.equal(vault.isChangingConnection(), false);
    assert.equal(invalidations, 0);
    assert.equal(effects, 0);
  });
  await vault.restore(async permit => vault.start(async () => { effects += 1; }, { restorePermit: permit }));
  assert.equal(effects, 1);
  assert.equal(invalidations, 1);
});

test("a Preview lifecycle and a Vault start protect asynchronous work without draining or replacing owners", async () => {
  const artifacts = createSpsDesktopPluginArtifactActivityGate();
  const preview = createSpsPluginPreviewOperationGate({ withArtifactActivity: artifacts.withActivity });
  const vault = createSpsOwnerVaultOperationGate({ withArtifactActivity: artifacts.withActivity });
  for (const start of [action => preview.run(action), action => vault.start(action)]) {
    const hold = deferred();
    const operation = start(() => hold.promise);
    assert.throws(() => artifacts.withMaintenance(async () => {}), /in progress/);
    hold.resolve(); await operation;
    await artifacts.withMaintenance(async () => {
      await assert.rejects(start(async () => { throw new Error("must not enter"); }), /maintenance/);
    });
  }
});
