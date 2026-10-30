import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { createChecklistPackage } from "../scripts/no-ai-checklist-package.mjs";

const TEMP_PREFIX = "sps-model-request-package-";
const EVENT_PATTERN = "plugin.local.no-ai-checklist.changed";
const RPC_TIMEOUT_MS = 5_000;

function launchBundledWorker(bundledWorker, directory, signal) {
  const child = spawn(process.execPath, [bundledWorker], {
    cwd: directory,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    signal,
  });
  const pending = new Map();
  const hostRequests = [];
  let stderr = "";
  let failure;
  let exit;
  let nextId = 0;
  let messageCount = 0;

  const diagnostic = message => new Error(`${message}\nWorker stderr:\n${stderr || "(empty)"}`);
  function fail(cause) {
    failure ??= cause;
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
  }
  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-16_384); });
  child.on("error", cause => fail(cause));
  child.stdin.on("error", cause => fail(cause));
  const exited = new Promise(resolve => {
    child.once("close", (code, exitSignal) => {
      exit = { code, signal: exitSignal };
      if (pending.size > 0) fail(diagnostic(`Worker exited before replying (code=${code}, signal=${exitSignal}).`));
      resolve(exit);
    });
  });

  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  reader.on("line", line => {
    try {
      assert.ok(line.length <= 65_536 && ++messageCount <= 16, "Worker protocol output must stay bounded.");
      const message = JSON.parse(line);
      assert.equal(message.jsonrpc, "2.0");
      assert.ok(typeof message.id === "string" || typeof message.id === "number", "Worker messages require an RPC id.");
      if (Object.hasOwn(message, "method")) {
        assert.equal(message.method, "events.subscribe", "Only the fixture event subscription is allowed; no Core or provider RPCs.");
        assert.equal(hostRequests.length, 0, "The fixture must subscribe exactly once.");
        assert.deepEqual(message.params, { eventPattern: EVENT_PATTERN, filter: null });
        hostRequests.push({ method: message.method, params: message.params });
        send({ jsonrpc: "2.0", id: message.id, result: null });
        return;
      }
      const request = pending.get(message.id);
      assert.ok(request, `Unexpected Worker response id: ${message.id}.`);
      if (Object.hasOwn(message, "error")) {
        pending.delete(message.id);
        request.reject(diagnostic(`Worker ${request.method} failed: ${JSON.stringify(message.error)}`));
      } else {
        assert.ok(Object.hasOwn(message, "result"), "Worker responses require a result or error.");
        pending.delete(message.id);
        request.resolve(message.result);
      }
    } catch (cause) {
      fail(cause);
    }
  });
  reader.on("error", cause => fail(cause));

  function invoke(method, params = {}) {
    if (failure) return Promise.reject(failure);
    if (exit) return Promise.reject(diagnostic("Worker exited before the lifecycle request."));
    const id = `host-${++nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        fail(diagnostic(`Timed out waiting for Worker ${method}.`));
      }, RPC_TIMEOUT_MS);
      pending.set(id, {
        method,
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(cause) { clearTimeout(timer); reject(cause); },
      });
      try {
        send({ jsonrpc: "2.0", id, method, params });
      } catch (cause) {
        fail(cause);
      }
    });
  }

  async function waitForExit() {
    let timer;
    try {
      return await Promise.race([
        exited,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(diagnostic("Worker did not exit within the cleanup deadline.")), RPC_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    invoke,
    hostRequests,
    waitForExit,
    assertHealthyExit(result) {
      assert.deepEqual(result, { code: 0, signal: null }, stderr);
      if (failure) throw failure;
    },
    async dispose() {
      try {
        if (!exit) {
          child.kill();
          await waitForExit();
        }
      } finally {
        reader.close();
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
      }
    },
  };
}

test("generated model-request bundle initializes and completes its lifecycle with only a finite fake Host", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  let worker;
  try {
    const { manifest } = await createChecklistPackage(root, { withUi: false, modelRequests: true });
    for (const capability of ["sps.models.read", "sps.models.submit", "sps.models.cancel", "sps.executions.read"]) {
      assert.ok(manifest.capabilities.includes(capability));
    }
    const bundledWorker = path.resolve(root, manifest.entrypoints.worker);
    worker = launchBundledWorker(bundledWorker, root, t.signal);

    assert.deepEqual(await worker.invoke("initialize", { manifest }), {
      ok: true,
      supportedMethods: ["health", "shutdown", "executeTool", "onEvent", "runJob", "getData", "performAction"],
    });
    assert.deepEqual(await worker.invoke("health"), { status: "ok", ready: true, mode: "no-ai" });
    assert.equal(await worker.invoke("shutdown"), null);
    worker.assertHealthyExit(await worker.waitForExit());
    assert.deepEqual(worker.hostRequests, [{
      method: "events.subscribe",
      params: { eventPattern: EVENT_PATTERN, filter: null },
    }]);
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
