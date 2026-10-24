import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { coreRecoveryEnvironment, loadCoreRecoverySettings, saveCoreRecoverySettings } from "../src/core-recovery-store.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-core-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("missing preferences keep the existing startup policy and explicit changes persist", async t => {
  const root = await fixture(t);
  const userDataPath = path.join(root, "user-data");
  assert.deepEqual(await loadCoreRecoverySettings({ userDataPath }), { pluginsDisabled: false, storageError: null });
  assert.equal((await saveCoreRecoverySettings({ userDataPath, disabled: true })).pluginsDisabled, true);
  assert.equal((await loadCoreRecoverySettings({ userDataPath })).pluginsDisabled, true);
  assert.equal((await saveCoreRecoverySettings({ userDataPath, disabled: false })).pluginsDisabled, false);
  assert.equal(JSON.parse(await readFile(path.join(userDataPath, "core-recovery.json"), "utf8")).schemaVersion, 1);
});

test("corrupt, unbounded, and invalid recovery preferences fail closed", async t => {
  const userDataPath = await fixture(t);
  const target = path.join(userDataPath, "core-recovery.json");
  for (const raw of ["{", "x".repeat(4097), JSON.stringify({ schemaVersion: 1, pluginsDisabled: "false", updatedAt: new Date().toISOString() }), JSON.stringify({ schemaVersion: 1, pluginsDisabled: false, updatedAt: "bad" })]) {
    await writeFile(target, raw);
    const state = await loadCoreRecoverySettings({ userDataPath });
    assert.equal(state.pluginsDisabled, true);
    assert.ok(state.storageError);
  }
});

test("recovery settings never follow directory junctions", async t => {
  const root = await fixture(t);
  const outside = path.join(root, "other");
  await mkdir(outside);
  const userDataPath = path.join(root, "linked");
  await symlink(outside, userDataPath, process.platform === "win32" ? "junction" : "dir");
  assert.equal((await loadCoreRecoverySettings({ userDataPath })).pluginsDisabled, true);
  await assert.rejects(saveCoreRecoverySettings({ userDataPath, disabled: false }), /regular directory/);
  await assert.rejects(readFile(path.join(outside, "core-recovery.json")), { code: "ENOENT" });
});

test("settings writes are serialized, validate inputs, and never mutate another application file", async t => {
  const userDataPath = await fixture(t);
  const sentinel = path.join(userDataPath, "state.json");
  await writeFile(sentinel, "keep");
  const first = saveCoreRecoverySettings({ userDataPath, disabled: true });
  const second = saveCoreRecoverySettings({ userDataPath, disabled: false });
  await first;
  await second;
  assert.equal((await loadCoreRecoverySettings({ userDataPath })).pluginsDisabled, false);
  assert.equal(await readFile(sentinel, "utf8"), "keep");
  await assert.rejects(saveCoreRecoverySettings({ userDataPath, disabled: "false" }), TypeError);
  await assert.rejects(loadCoreRecoverySettings({ userDataPath: "relative" }), TypeError);
});

test("launch environment blocks plugin code for invalid or absent recovery snapshots", () => {
  assert.deepEqual(coreRecoveryEnvironment({ pluginsDisabled: true }), { SPS_PLUGIN_RECOVERY_MODE: "all-disabled" });
  assert.deepEqual(coreRecoveryEnvironment({ pluginsDisabled: false }), { SPS_PLUGIN_RECOVERY_MODE: "" });
  assert.equal(coreRecoveryEnvironment({}).SPS_PLUGIN_RECOVERY_MODE, "all-disabled");
});
