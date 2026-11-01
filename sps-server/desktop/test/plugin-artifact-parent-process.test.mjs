import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { lstat, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createSpsPluginArtifactParentClient } from "../src/plugin-artifact-parent-channel.mjs";
import { createSpsDesktopPluginArtifactActivityGate } from "../src/plugin-artifact-activity-gate.mjs";

const core = path.resolve(import.meta.dirname, "../../../external/sps-core");
const require = createRequire(path.join(core, "cli", "package.json"));
const loader = require.resolve("tsx/esm");
const fixtureModule = fileURLToPath(new URL("./fixtures/plugin-artifact-channel-child.mjs", import.meta.url));
async function fixture(t, dropOperation) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-artifact-ipc-"));
  const original = await lstat(root, { bigint: true });
  const parent = await realpath(os.tmpdir());
  const child = fork(fixtureModule, [], { execArgv: ["--import", pathToFileURL(loader).href], windowsHide: true,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SPS_ARTIFACT_TEST_ROOT: root, SPS_ARTIFACT_TEST_CORE: core },
    stdio: ["ignore", "pipe", "pipe", "ipc"] });
  child.stdout.resume();
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = `${stderr}${String(chunk)}`.slice(-4000); });
  const terminal = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
  const proxy = new EventEmitter(); proxy.connected = true;
  proxy.send = (...args) => child.send(...args);
  child.on("message", message => {
    if (message.kind === "sps.plugin-artifacts.response" && message.operation === dropOperation) return;
    proxy.emit("message", message);
  });
  child.once("disconnect", () => { proxy.connected = false; proxy.emit("disconnect"); });
  const artifacts = createSpsDesktopPluginArtifactActivityGate();
  let releaseUncertainty;
  const client = createSpsPluginArtifactParentClient(proxy, { isCurrent: () => child.exitCode === null,
    timeoutMs: dropOperation ? 100 : 5000, onUncertain: () => { releaseUncertainty ??= artifacts.retainUncertainty(); } });
  t.after(async () => {
    client.dispose();
    if (child.connected) child.send({ kind: "sps.test.artifact", operation: "exit" });
    let timer;
    const result = await Promise.race([terminal, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Isolated artifact IPC fixture did not close; preserve its data.")), 10_000); })]).finally(() => clearTimeout(timer));
    assert.deepEqual(result, { code: 0, signal: null });
    releaseUncertainty?.();
    const current = await lstat(root, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(current[key], original[key]);
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(path.dirname(await realpath(root)), parent);
    assert.ok(path.basename(root).startsWith("sps-artifact-ipc-"));
    await rm(root, { recursive: true, force: true });
  });
  // The parent listener is attached before the child imports/starts its server.
  let timer;
  await Promise.race([new Promise(resolve => proxy.on("message", message => {
    if (message.kind === "sps.plugin-artifacts.ready") resolve();
  })), terminal.then(result => { throw new Error(`Private fixture exited before readiness (${result.code}): ${stderr}`); }),
  new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`No private Core artifact channel readiness: ${stderr}`)), 10_000); })]).finally(() => clearTimeout(timer));
  let next = 0;
  async function probe() {
    const id = ++next;
    const result = new Promise(resolve => {
      const listener = value => { if (value.kind === "sps.test.artifact.result" && value.id === id) { child.off("message", listener); resolve(value.admitted); } };
      child.on("message", listener);
    });
    child.send({ kind: "sps.test.artifact", operation: "probe", id });
    let timer;
    return Promise.race([result, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Private fixture probe did not reply.")), 5000); })]).finally(() => clearTimeout(timer));
  }
  return { child, client, artifacts, probe, root };
}

test("real child captures parent-supplied files and denies a changed file without releasing uncertainty", { timeout: 20_000 }, async t => {
  const f = await fixture(t);
  const file = path.join(f.root, "retained.spsplugin");
  await writeFile(file, "original");
  const parentPaths = [{ source: "desktop-developer-build", ownerId: "project-one", state: "retained", path: file, kind: "file" }];
  await assert.rejects(f.artifacts.withMaintenance(() => f.client.withSnapshot(async scope => {
    assert.equal(scope.coverage, "core-and-parent-paths");
    assert.deepEqual(scope.parentPaths, [{ ...parentPaths[0], canonicalPath: await realpath(file) }]);
    assert.equal(await f.probe(), false);
    await writeFile(file, "changed bytes");
    await scope.assertCurrent();
    assert.fail("A changed parent path must not advance Main work.");
  }, { parentPaths })));
  assert.throws(() => f.artifacts.withActivity(async () => {}));
  assert.throws(() => f.artifacts.withMaintenance(async () => {}));
});

test("real child Core reference scope excludes activity until callback and remote final validation finish", { timeout: 20_000 }, async t => {
  const f = await fixture(t);
  assert.equal(await f.probe(), true);
  let old;
  const result = await f.artifacts.withMaintenance(() => f.client.withSnapshot(async scope => {
    old = scope;
    assert.equal(Object.isFrozen(scope.references), true);
    assert.equal(await f.probe(), false);
    await scope.assertCurrent();
    assert.throws(() => f.artifacts.withActivity(async () => {}));
    return "original-result";
  }));
  assert.equal(result, "original-result");
  await assert.rejects(old.assertCurrent());
  assert.equal(await f.probe(), true);
});

for (const operation of ["begin", "check", "end"]) {
  test(`real child lost ${operation} reply retains uncertainty instead of granting new maintenance`, { timeout: 20_000 }, async t => {
    const f = await fixture(t, operation);
    let callbacks = 0;
    await assert.rejects(f.artifacts.withMaintenance(() => f.client.withSnapshot(async () => { callbacks += 1; })));
    assert.equal(callbacks, operation === "end" ? 1 : 0);
    assert.throws(() => f.artifacts.withMaintenance(async () => {}));
    assert.throws(() => f.artifacts.withActivity(async () => {}));
    await assert.rejects(f.client.withSnapshot(async () => {}));
    // Core may have completed an end whose reply was lost; parent still needs
    // actual old-child closure, not a probe or an elapsed timeout, to clear it.
    assert.equal(await f.probe(), operation === "end");
  });
}
