import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import test from "node:test";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";
import {
  createRunnerRecoveryReferencePackage,
  RUNNER_RECOVERY_CAPABILITIES,
  RUNNER_RECOVERY_PLUGIN_KEY,
} from "../scripts/runner-recovery-reference-package.mjs";

const TEMP_PREFIX = "sps-runner-recovery-package-";
const COMPANY_ID = "company-runner-test";
const RPC_TIMEOUT_MS = 5_000;
const ROUTES = [
  ["getData", "runner-list", "sps.runtimes.list", { companyId: COMPANY_ID }],
  ["getData", "grant-list", "sps.executionGrants.list", { companyId: COMPANY_ID }],
  ["getData", "run-get", "sps.runs.get", { companyId: COMPANY_ID, runId: "run-1" }],
  ["getData", "run-events", "sps.runs.listEvents", { companyId: COMPANY_ID, runId: "run-1" }],
  ["performAction", "grant-upsert", "sps.executionGrants.upsert", {
    companyId: COMPANY_ID, subjectKey: "agent:test", nodeId: "node-1", runnerProfileId: "profile-1",
  }],
  ["performAction", "grant-revoke", "sps.executionGrants.revoke", { companyId: COMPANY_ID, grantId: "grant-1" }],
  ["performAction", "run-dispatch", "sps.runs.dispatch", {
    companyId: COMPANY_ID, executionGrantId: "grant-1", args: ["--version"], timeoutMs: 1000,
  }],
  ["performAction", "run-cancel", "sps.runs.cancel", { companyId: COMPANY_ID, runId: "run-1" }],
];

async function createOwnedTemporaryRoot(label) {
  const parent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(parent), parent);
  const prefix = `${TEMP_PREFIX}${label}-`;
  const root = await mkdtemp(path.join(parent, prefix));
  assert.equal(await assertPlainDirectory(root), root);
  const identity = await lstat(root, { bigint: true });
  let removed = false;
  return {
    root,
    async cleanup() {
      if (removed) return;
      assert.ok(path.isAbsolute(root) && path.resolve(root) === root);
      assert.equal(path.dirname(root), parent);
      assert.ok(path.basename(root).startsWith(prefix));
      assert.equal(await assertPlainDirectory(root), root);
      const current = await lstat(root, { bigint: true });
      assert.ok(current.isDirectory() && !current.isSymbolicLink());
      for (const field of ["dev", "ino", "birthtimeNs"]) {
        assert.equal(current[field], identity[field], `Refuse cleanup after temporary root ${field} changed.`);
      }
      await rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 });
      removed = true;
    },
  };
}

function launchWorker(workerPath, cwd, signal, env = process.env) {
  const child = spawn(process.execPath, [workerPath], { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], signal });
  const pending = new Map();
  const runtimeRequests = [];
  let stderr = "";
  let failure;
  let exit;
  let nextId = 0;
  const outputEofs = { stdout: false, stderr: false };
  child.stdout.once("end", () => { outputEofs.stdout = true; });
  child.stderr.once("end", () => { outputEofs.stderr = true; });
  const diagnostic = message => new Error(`${message}\nWorker stderr:\n${stderr || "(empty)"}`);
  function fail(cause) {
    failure ??= cause;
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
  }
  function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-16_384); });
  child.on("error", fail);
  child.stdin.on("error", fail);
  const exited = new Promise(resolve => child.once("close", (code, signal) => {
    exit = { code, signal };
    if (pending.size) fail(diagnostic(`Worker exited before replying (code=${code}, signal=${signal}).`));
    resolve(exit);
  }));
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  reader.on("line", line => {
    try {
      const message = JSON.parse(line);
      assert.equal(message.jsonrpc, "2.0");
      if (Object.hasOwn(message, "method")) {
        assert.match(message.method, /^sps\./, "Only SPS runtime RPCs are allowed.");
        runtimeRequests.push({ method: message.method, params: message.params });
        send({ jsonrpc: "2.0", id: message.id, result: { method: message.method } });
        return;
      }
      const request = pending.get(message.id);
      assert.ok(request, `Unexpected response id: ${message.id}.`);
      pending.delete(message.id);
      if (message.error) request.reject(diagnostic(`${request.method} failed: ${JSON.stringify(message.error)}`));
      else request.resolve(message.result);
    } catch (cause) { fail(cause); }
  });

  function invoke(method, params = {}, scoped = false) {
    if (failure) return Promise.reject(failure);
    if (exit) return Promise.reject(diagnostic("Worker exited before lifecycle request."));
    const id = `host-${++nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(diagnostic(`Timed out waiting for ${method}.`)), RPC_TIMEOUT_MS);
      pending.set(id, {
        method,
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(cause) { clearTimeout(timer); reject(cause); },
      });
      send({
        jsonrpc: "2.0", id, method, params,
        ...(scoped ? { paperclipInvocation: { id: `inv-${id}`, scope: { companyId: COMPANY_ID } } } : {}),
      });
    });
  }

  return {
    invoke,
    runtimeRequests,
    exited,
    outputEofs,
    closeInput() { child.stdin.end(); },
    async dispose() {
      if (!exit) {
        child.kill();
        await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(diagnostic("Worker did not exit during cleanup.")), RPC_TIMEOUT_MS))]);
      }
      reader.close();
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    },
  };
}

async function assertWorkerRoutes(worker, manifest) {
  assert.deepEqual(await worker.invoke("initialize", { manifest }), {
    ok: true,
    supportedMethods: ["executeTool", "onEvent", "runJob", "getData", "performAction"],
  });
  for (const [method, key, runtimeMethod, runtimeParams] of ROUTES) {
    const params = method === "getData"
      ? { key, companyId: COMPANY_ID, params: { runId: "run-1", grantId: "grant-1" } }
      : { key, companyId: COMPANY_ID, params: {
        companyId: COMPANY_ID, runId: "run-1", grantId: "grant-1", subjectKey: "agent:test",
        nodeId: "node-1", runnerProfileId: "profile-1", executionGrantId: "grant-1", args: ["--version"], timeoutMs: 1000,
      }, actorContext: { type: "user", companyId: COMPANY_ID, userId: "test-user" } };
    const result = await worker.invoke(method, params, true);
    assert.deepEqual(result, { method: runtimeMethod });
    assert.deepEqual(worker.runtimeRequests.at(-1), { method: runtimeMethod, params: runtimeParams });
  }

  assert.deepEqual(await worker.invoke("shutdown"), null);
  worker.closeInput();
  assert.deepEqual(await worker.exited, { code: 0, signal: null });
  assert.deepEqual(worker.outputEofs, { stdout: true, stderr: true });
  assert.deepEqual(worker.runtimeRequests.map(({ method }) => method), ROUTES.map(([, , method]) => method));
}

test("generated Runner recovery package validates its manifest and routes public Worker data/actions through declared runtime RPCs", { timeout: 30_000 }, async t => {
  const temporary = await createOwnedTemporaryRoot("generated");
  const { root } = temporary;
  let worker;
  try {
    const { manifest } = await createRunnerRecoveryReferencePackage(root);
    assert.equal(manifest.id, RUNNER_RECOVERY_PLUGIN_KEY);
    assert.deepEqual(manifest.capabilities, RUNNER_RECOVERY_CAPABILITIES);
    assert.deepEqual(manifest.sps, {
      contractVersion: "2.0",
      primitives: ["runtimes.list", "runtimes.dispatch", "runs.observe", "runs.cancel"],
    });

    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    assert.equal(packageJson.spsPlugin.manifest, "./dist/manifest.js");
    assert.equal(packageJson.spsPlugin.worker, "./dist/worker.js");
    const bundledManifest = await import(pathToFileURL(path.join(root, packageJson.spsPlugin.manifest)).href);
    assert.deepEqual(bundledManifest.default, manifest);
    const workerPath = path.resolve(root, packageJson.spsPlugin.worker);
    worker = launchWorker(workerPath, root, t.signal);

    await assertWorkerRoutes(worker, manifest);
  } finally {
    await worker?.dispose();
    await temporary.cleanup();
  }
});

test("copied Runner recovery distribution runs all eight routes without its builder tree or SDK junction", { timeout: 30_000 }, async t => {
  const builder = await createOwnedTemporaryRoot("builder");
  let distribution;
  let worker;
  try {
    const { manifest } = await createRunnerRecoveryReferencePackage(builder.root);
    distribution = await createOwnedTemporaryRoot("distribution");
    assert.notEqual(distribution.root, builder.root);
    await mkdir(path.join(distribution.root, "dist"));
    for (const relative of ["package.json", "dist/manifest.js", "dist/worker.js"]) {
      const source = path.join(builder.root, relative);
      const destination = path.join(distribution.root, relative);
      const sourceDetails = await lstat(source);
      assert.ok(sourceDetails.isFile() && !sourceDetails.isSymbolicLink() && sourceDetails.nlink === 1);
      await copyFile(source, destination, constants.COPYFILE_EXCL);
      const copiedDetails = await lstat(destination);
      assert.ok(copiedDetails.isFile() && !copiedDetails.isSymbolicLink() && copiedDetails.nlink === 1);
      assert.equal(await realpath(destination), destination);
      assert.equal(copiedDetails.size, sourceDetails.size);
      const sourceHash = createHash("sha256").update(await readFile(source)).digest("hex");
      const copiedHash = createHash("sha256").update(await readFile(destination)).digest("hex");
      assert.equal(copiedHash, sourceHash, `${relative} must retain its exact SHA-256 after copying.`);
    }
    assert.deepEqual((await readdir(distribution.root)).sort(), ["dist", "package.json"]);
    assert.deepEqual((await readdir(path.join(distribution.root, "dist"))).sort(), ["manifest.js", "worker.js"]);
    assert.equal(await assertPlainDirectory(path.join(distribution.root, "dist")), path.join(distribution.root, "dist"));
    for (const excluded of ["node_modules", "src"]) {
      await assert.rejects(lstat(path.join(distribution.root, excluded)), error => error?.code === "ENOENT");
    }

    // Remove the owned builder and its SDK junction before executing the copy.
    await builder.cleanup();
    await assert.rejects(lstat(builder.root), error => error?.code === "ENOENT");
    const packageJson = JSON.parse(await readFile(path.join(distribution.root, "package.json"), "utf8"));
    assert.equal(packageJson.spsPlugin.manifest, "./dist/manifest.js");
    assert.equal(packageJson.spsPlugin.worker, "./dist/worker.js");
    const copiedManifest = await import(pathToFileURL(path.join(distribution.root, packageJson.spsPlugin.manifest)).href);
    assert.deepEqual(copiedManifest.default, manifest);
    const env = process.platform === "win32" ? {
      SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot ?? "C:\\Windows",
      WINDIR: process.env.WINDIR ?? process.env.windir ?? process.env.SystemRoot ?? "C:\\Windows",
    } : {};
    worker = launchWorker(path.join(distribution.root, packageJson.spsPlugin.worker), distribution.root, t.signal, env);
    await assertWorkerRoutes(worker, copiedManifest.default);
  } finally {
    await worker?.dispose();
    await distribution?.cleanup();
    await builder.cleanup();
  }
});
