import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";

const RPC_TIMEOUT_MS = 5_000;
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");
const bundleRoot = path.join(spsServerRoot, "sps-default-memory", "dist");

function startSidecar() {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: request.method,
      url: request.url,
      token: request.headers["x-sidecar-token"],
      body: bodyText ? JSON.parse(bodyText) : null,
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ candidate: { id: "candidate-fixture", scope: "task", content: "Fixture proposal" } }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve({
        requests,
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done, fail) => server.close(error => error ? fail(error) : done())),
      });
    });
  });
}

function launchWorker(workerPath, cwd, sidecarUrl) {
  const child = spawn(process.execPath, [workerPath], {
    cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      SPS_MEMORY_SIDECAR_URL: sidecarUrl,
      SPS_MEMORY_SIDECAR_TOKEN: "synthetic-portability-token",
      MEMORY_SIDECAR_URL: "",
      MEMORY_SIDECAR_TOKEN: "",
    },
  });
  const pending = new Map();
  const subscriptions = [];
  let stderr = "";
  let failure;
  let exit;
  let nextId = 0;
  const diagnostic = message => new Error(`${message}\nWorker stderr:\n${stderr || "(empty)"}`);
  const fail = cause => {
    failure ??= cause;
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
  };
  const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-16_384); });
  child.on("error", fail);
  child.stdin.on("error", fail);
  const exited = new Promise(resolve => {
    child.once("close", (code, signal) => {
      exit = { code, signal };
      if (pending.size > 0) fail(diagnostic(`Worker exited before replying (code=${code}, signal=${signal}).`));
      resolve(exit);
    });
  });
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  reader.on("line", line => {
    try {
      assert.ok(line.length <= 65_536, "Worker protocol output must stay bounded.");
      const message = JSON.parse(line);
      assert.equal(message.jsonrpc, "2.0");
      if (Object.hasOwn(message, "method")) {
        assert.equal(message.method, "events.subscribe", "Only declared event subscriptions may call the host.");
        subscriptions.push(message.params);
        send({ jsonrpc: "2.0", id: message.id, result: null });
        return;
      }
      const request = pending.get(message.id);
      assert.ok(request, `Unexpected Worker response id: ${message.id}.`);
      pending.delete(message.id);
      if (Object.hasOwn(message, "error")) request.reject(diagnostic(`Worker ${request.method} failed: ${JSON.stringify(message.error)}`));
      else {
        assert.ok(Object.hasOwn(message, "result"), "Worker responses require a result or error.");
        request.resolve(message.result);
      }
    } catch (cause) {
      fail(cause);
    }
  });
  reader.on("error", fail);

  function invoke(method, params = {}) {
    if (failure) return Promise.reject(failure);
    if (exit) return Promise.reject(diagnostic("Worker exited before the lifecycle request."));
    const id = `host-${++nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(diagnostic(`Timed out waiting for Worker ${method}.`)), RPC_TIMEOUT_MS);
      pending.set(id, {
        method,
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(cause) { clearTimeout(timer); reject(cause); },
      });
      try { send({ jsonrpc: "2.0", id, method, params }); }
      catch (cause) { fail(cause); }
    });
  }

  async function waitForExit() {
    let timer;
    try {
      return await Promise.race([
        exited,
        new Promise((_, reject) => { timer = setTimeout(() => reject(diagnostic("Worker did not exit within the cleanup deadline.")), RPC_TIMEOUT_MS); }),
      ]);
    } finally { clearTimeout(timer); }
  }

  return {
    child,
    invoke,
    subscriptions,
    async finish() {
      child.stdin.end();
      const result = await waitForExit();
      assert.deepEqual(result, { code: 0, signal: null }, stderr);
      if (failure) throw failure;
      reader.close();
      return result;
    },
    async dispose() {
      if (!exit) {
        child.kill();
        await waitForExit();
      }
      reader.close();
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
    },
  };
}

test("built Default Memory Worker runs from an isolated portable fixture", { timeout: 30_000 }, async () => {
  const fixture = await createWorkspaceE2eFixture();
  await fixture.assertCurrent();
  const root = fixture.directory;
  const sidecar = await startSidecar();
  let worker;
  let eofWorker;
  try {
    const fixtureDist = path.join(root, "dist");
    await mkdir(fixtureDist);
    await Promise.all(["worker.js", "manifest.js"].map(name => copyFile(path.join(bundleRoot, name), path.join(fixtureDist, name))));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
    await fixture.assertCurrent();
    assert.ok(!path.resolve(root).startsWith(path.resolve(spsServerRoot) + path.sep), "Fixture must be outside the source tree.");
    assert.ok(!path.resolve(root).split(path.sep).some(part => part.toLowerCase() === "node_modules"), "Fixture must be outside every node_modules tree.");
    assert.ok(!path.resolve(bundleRoot).startsWith(path.resolve(root) + path.sep), "Fixture must not contain or replace the source bundle.");
    await assert.rejects(readFile(path.join(root, "node_modules", "@sonparkserver", "plugin-sdk", "package.json")), { code: "ENOENT" });

    worker = launchWorker(path.join(fixtureDist, "worker.js"), root, sidecar.url);
    assert.deepEqual(await worker.invoke("initialize", {}), {
      ok: true,
      supportedMethods: ["executeTool", "onEvent", "runJob"],
    });
    assert.deepEqual(worker.subscriptions.map(item => item.eventPattern).sort(), [
      "artifact.published", "project.created", "room.checkpoint", "room.compacted", "task.blocked", "task.completed", "task.reopened",
    ]);
    assert.ok(worker.subscriptions.every(item => item.filter === null));

    assert.deepEqual(await worker.invoke("executeTool", {
      toolName: "memory-recall",
      parameters: { query: "  " },
      runContext: { companyId: "company-fixture", projectId: "project-fixture" },
    }), { error: "query_required", content: "Memory recall requires a non-empty query." });
    assert.equal(sidecar.requests.length, 0, "Invalid recall must return locally without contacting the sidecar.");

    assert.equal(await worker.invoke("onEvent", {
      event: { eventId: "event-without-company", eventType: "task.completed", entityType: "task", entityId: "task-fixture", payload: {} },
    }), null);
    assert.equal(sidecar.requests.length, 0, "Lifecycle events without a company must be ignored locally.");

    assert.equal(await worker.invoke("onEvent", {
      event: {
        eventId: "event-fixture-1",
        eventType: "task.completed",
        companyId: "company-fixture",
        entityType: "task",
        entityId: "task-fixture",
        payload: { projectId: "project-fixture", runId: "run-fixture" },
      },
    }), null);
    assert.deepEqual(sidecar.requests[0], {
      method: "POST",
      url: "/memory/candidates",
      token: "synthetic-portability-token",
      body: {
        content: "Lifecycle checkpoint: task.completed completed. Review the referenced task before promoting any long-term memory.",
        scope: "task",
        type: "lifecycle",
        tags: ["lifecycle", "task.completed"],
        idempotencyKey: "lifecycle:event-fixture-1",
        source: { kind: "sps_memory_lifecycle", note: "task.completed", eventId: "event-fixture-1", runId: "run-fixture" },
        companyId: "company-fixture",
        projectId: "project-fixture",
        agentId: null,
        roomId: null,
        taskId: "task-fixture",
        issueId: "task-fixture",
        artifactId: null,
        userId: null,
        runId: "run-fixture",
      },
    });

    assert.match((await worker.invoke("executeTool", {
      toolName: "memory-propose",
      parameters: { content: "Fixture proposal", scope: "task", type: "decision", tags: ["portable"], sourceNote: "fixture only" },
      runContext: {
        companyId: "company-fixture", projectId: "project-fixture", agentId: "agent-fixture", roomId: "room-fixture",
        issueId: "task-fixture", artifactId: "artifact-fixture", userId: "user-fixture", runId: "run-fixture",
      },
    })).content, /Candidate ID: candidate-fixture/);
    assert.deepEqual(sidecar.requests[1], {
      method: "POST",
      url: "/memory/candidates",
      token: "synthetic-portability-token",
      body: {
        content: "Fixture proposal",
        scope: "task",
        type: "decision",
        tags: ["portable"],
        source: { kind: "sps_agent_tool", note: "fixture only", runId: "run-fixture" },
        companyId: "company-fixture",
        projectId: "project-fixture",
        agentId: "agent-fixture",
        roomId: "room-fixture",
        taskId: "task-fixture",
        artifactId: "artifact-fixture",
        userId: "user-fixture",
        runId: "run-fixture",
      },
    });

    assert.deepEqual(await worker.invoke("shutdown"), null);
    await worker.finish();
    worker = null;
    assert.equal(sidecar.requests.length, 2, "Only the valid lifecycle event and proposal may reach the fixture sidecar.");

    eofWorker = launchWorker(path.join(fixtureDist, "worker.js"), root, sidecar.url);
    assert.deepEqual(await eofWorker.invoke("initialize", {}), {
      ok: true,
      supportedMethods: ["executeTool", "onEvent", "runJob"],
    });
    await eofWorker.finish();
    eofWorker = null;
  } finally {
    await worker?.dispose();
    await eofWorker?.dispose();
    await sidecar.close();
    await fixture.assertCurrent();
    await fixture.remove();
  }
});
