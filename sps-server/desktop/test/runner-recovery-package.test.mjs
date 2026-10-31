import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import test from "node:test";
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

function launchWorker(workerPath, cwd, signal) {
  const child = spawn(process.execPath, [workerPath], { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], signal });
  const pending = new Map();
  const runtimeRequests = [];
  let stderr = "";
  let failure;
  let exit;
  let nextId = 0;
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

test("generated Runner recovery package validates its manifest and routes public Worker data/actions through declared runtime RPCs", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
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
    assert.deepEqual(worker.runtimeRequests.map(({ method }) => method), ROUTES.map(([, , method]) => method));
  } finally {
    try {
      await worker?.dispose();
    } finally {
      assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(root).startsWith(TEMP_PREFIX));
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
});
