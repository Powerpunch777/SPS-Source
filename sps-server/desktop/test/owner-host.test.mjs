import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createSpsOwnerHostManager,
  materializeStableSpsOwnerHostNode,
  materializeSpsOwnerHostRuntime,
  resolveSpsOwnerHostRuntime,
  spsOwnerHostBundledNodePath,
} from "../src/owner-host.mjs";

function response(payload) {
  return { ok: true, json: async () => payload };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeChild(onKill = () => {}) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.connected = true;
  child.send = (message, callback) => {
    callback?.(null);
    if (message?.kind === "sps.owner-host.shutdown") onKill(child);
    return true;
  };
  child.disconnect = () => {
    if (!child.connected) return;
    child.connected = false;
    child.emit("disconnect");
  };
  child.kill = () => onKill(child);
  const shutdownPipe = new EventEmitter();
  shutdownPipe.destroyed = false;
  shutdownPipe.writableEnded = false;
  shutdownPipe.end = message => {
    assert.equal(message, "sps.owner-host.shutdown/v1\n");
    shutdownPipe.writableEnded = true;
    onKill(child);
  };
  child.stdio = [null, null, null, null, shutdownPipe];
  return child;
}

test("starts an internal Owner Host when its runtime is available", async () => {
  let healthy = false;
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => { healthy = false; child.exitCode = 0; child.emit("exit", 0); };
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["host.mjs"], cwd: "C:/sps" }),
    spawn: () => { healthy = true; return child; },
    delay: async () => {},
  });

  assert.equal((await manager.start()).state, "running");
  assert.equal((await manager.stop()).state, "stopped");
});

test("shares concurrent start calls and spawns only one owned child", async () => {
  const runtimeGate = deferred();
  const runtimeStarted = deferred();
  let healthy = false, runtimeCalls = 0, spawnCalls = 0;
  const child = fakeChild((value) => { healthy = false; value.exitCode = 0; value.emit("exit", 0); });
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => {
      runtimeCalls++;
      runtimeStarted.resolve();
      await runtimeGate.promise;
      return { command: "node", args: ["host.mjs"] };
    },
    spawn: () => { spawnCalls++; healthy = true; return child; },
    delay: async () => {},
  });

  const first = manager.start();
  const second = manager.start();
  assert.strictEqual(second, first);
  await runtimeStarted.promise;
  assert.equal(runtimeCalls, 1);
  runtimeGate.resolve();
  assert.equal((await first).state, "running");
  assert.equal(spawnCalls, 1);
  await manager.stop();
});

test("stop fences a start awaiting runtime resolution from spawning afterward", async () => {
  const runtimeGate = deferred();
  const runtimeStarted = deferred();
  let spawnCalls = 0;
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    fetchImpl: async () => ({ ok: false }),
    resolveRuntime: async () => {
      runtimeStarted.resolve();
      await runtimeGate.promise;
      return { command: "node", args: ["host.mjs"] };
    },
    spawn: () => { spawnCalls++; return fakeChild(); },
  });

  const starting = manager.start();
  await runtimeStarted.promise;
  assert.equal((await manager.stop()).state, "stopped");
  runtimeGate.resolve();
  assert.equal((await starting).state, "stopped");
  assert.equal(spawnCalls, 0);
});

test("a late old-child exit cannot revoke the replacement child's signer channel", async () => {
  const children = [], disposed = [];
  let healthyChild = null;
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    fetchImpl: async () => healthyChild ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["host.mjs"] }),
    spawn: () => {
      const child = fakeChild();
      children.push(child);
      healthyChild = child;
      return child;
    },
    startupAttempts: 1,
    delay: async () => {},
    createNativeSigner: () => {
      const index = disposed.length;
      disposed.push(0);
      return { inspect: async () => ({}), sign: async () => ({}), dispose: () => { disposed[index]++; } };
    },
    terminateTree: async () => { healthyChild = null; },
  });

  assert.equal((await manager.start()).state, "running");
  await manager.stop({ force: true });
  assert.equal(disposed[0], 1);
  assert.equal((await manager.start()).state, "running");
  const replacement = children[1];
  assert.equal(replacement.listenerCount("message"), 2);

  children[0].exitCode = 0;
  children[0].emit("exit", 0);
  assert.equal((await manager.inspect()).owned, true);
  assert.equal(replacement.listenerCount("message"), 2);
  assert.equal(disposed[1], 0);
  await manager.stop({ force: true });
  assert.equal(disposed[1], 1);
});

test("invalidating Native signing disconnects only IPC and never reattaches to a live Host", async () => {
  let healthy = false, spawnCalls = 0, signerCreations = 0, signCalls = 0, disposed = 0, killCalls = 0;
  const child = fakeChild((value) => {
    killCalls++;
    healthy = false;
    value.exitCode = 0;
    value.emit("exit", 0);
  });
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["host.mjs"] }),
    spawn: () => { spawnCalls++; healthy = true; return child; },
    startupAttempts: 1,
    delay: async () => {},
    createNativeSigner: () => {
      signerCreations++;
      return {
        inspect: async () => ({}),
        sign: async () => { signCalls++; return {}; },
        dispose: () => { disposed++; },
      };
    },
  });

  assert.equal((await manager.start()).state, "running");
  assert.equal(child.listenerCount("message"), 2);
  manager.invalidateNativeSigner();

  assert.equal(child.exitCode, null);
  assert.equal(child.connected, false);
  assert.equal(child.listenerCount("message"), 0);
  assert.equal(disposed, 1);
  assert.equal(killCalls, 0);
  assert.equal((await manager.inspect()).state, "running");
  assert.equal((await manager.start()).state, "running");
  child.emit("message", {
    v: 1,
    kind: "sps.native.signer.request",
    id: "11111111-1111-4111-8111-111111111111",
    operation: "sign",
    payload: {},
  });
  assert.equal(spawnCalls, 1);
  assert.equal(signerCreations, 1);
  assert.equal(signCalls, 0);
  assert.equal(disposed, 1);
  assert.equal(killCalls, 0);

  await manager.stop();
  assert.equal(killCalls, 1);
});

test("uses a caller-provided environment boundary instead of inheriting production secrets", async () => {
  let healthy = false;
  let spawnedEnvironment = null;
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => { healthy = false; child.exitCode = 0; child.emit("exit", 0); };
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    baseEnvironment: { PATH: "C:/safe-tools" },
    fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({
      command: "node",
      args: ["host.mjs"],
      cwd: "C:/sps",
      environment: { SPS_DESKTOP_PLUGIN_RUNTIME: "preview" },
    }),
    spawn: (_command, _args, options) => {
      spawnedEnvironment = options.env;
      healthy = true;
      return child;
    },
    delay: async () => {},
  });

  assert.equal((await manager.start()).state, "running");
  assert.equal(spawnedEnvironment.PATH, "C:/safe-tools");
  assert.equal(spawnedEnvironment.SPS_DESKTOP_PLUGIN_RUNTIME, "preview");
  assert.equal(spawnedEnvironment.OPENAI_API_KEY, undefined);
  assert.equal(spawnedEnvironment.SPS_PRODUCTION_SECRET, undefined);
  await manager.stop();
});

test("only a directly owned Core process gets the private signer IPC and stop revokes it before process exit", async () => {
  const child = fakeChild();
  let disposed = 0, options;
  const manager = createSpsOwnerHostManager({ url: "http://127.0.0.1:31310", fetchImpl: async () => ({ ok: false }),
    resolveRuntime: async () => ({ command: "node", args: ["fixture.mjs"] }), startupAttempts: 0,
    createNativeSigner: () => ({ inspect: async () => {}, sign: async () => {}, dispose: () => { disposed++; } }),
    spawn: (_command, _args, value) => { options = value; return child; },
    terminateTree: async () => { assert.equal(disposed, 1); child.exitCode = 0; child.emit("exit", 0); },
  });
  await manager.start(); assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe", "ipc", "pipe"]);
  assert.equal(options.env.SPS_DESKTOP_OWNED_SHUTDOWN_PIPE, "1");
  assert.equal(child.listenerCount("message"), 2); await manager.stop({ force: true });
  assert.equal(child.listenerCount("message"), 0); assert.equal(child.connected, false); assert.equal(disposed, 1);
  let attached = false;
  const existing = createSpsOwnerHostManager({ url: "http://127.0.0.1:31310", fetchImpl: async () => response({ status: "ok" }),
    createNativeSigner: () => { attached = true; }, spawn: () => { throw new Error("Must not spawn"); } });
  assert.equal((await existing.start()).state, "running-existing"); assert.equal(attached, false);
});

test("Windows normal stop revokes signing before requesting Core drain and does not send an abrupt signal", { skip: process.platform !== "win32" }, async () => {
  let healthy = false, disposed = 0, kills = 0, sent = 0;
  const child = fakeChild();
  child.kill = () => { kills++; };
  child.stdio[4].end = message => {
    assert.equal(message, "sps.owner-host.shutdown/v1\n");
    assert.equal(disposed, 1);
    assert.equal(child.connected, false);
    sent++; healthy = false; child.exitCode = 0; child.emit("exit", 0);
  };
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310", fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["core-fixture.mjs"] }),
    spawn: () => { healthy = true; return child; }, delay: async () => {},
    createNativeSigner: () => ({ inspect: async () => ({}), sign: async () => ({}), dispose: () => { disposed++; } }),
  });
  await manager.start();
  assert.equal((await manager.stop()).state, "stopped");
  assert.equal(sent, 1); assert.equal(kills, 0); assert.equal(child.connected, false);
});

test("an ordinary Core without Native signing also owns a Windows shutdown-only pipe", { skip: process.platform !== "win32" }, async () => {
  let healthy = false, options;
  const messages = [];
  const child = fakeChild();
  child.stdio[4].end = message => { messages.push(message); healthy = false; child.exitCode = 0; child.emit("exit", 0); };
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310", fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["core-fixture.mjs"] }),
    spawn: (_command, _args, value) => { options = value; healthy = true; return child; }, delay: async () => {},
  });
  await manager.start(); await manager.stop();
  assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe", "ipc", "pipe"]);
  assert.deepEqual(messages, ["sps.owner-host.shutdown/v1\n"]);
  assert.equal(child.listenerCount("message"), 0);
});

test("concurrent Windows normal stops share the drain after Native IPC disconnect", { skip: process.platform !== "win32" }, async () => {
  let healthy = false, disposed = 0, kills = 0, sent = 0;
  const child = fakeChild();
  child.kill = () => { kills++; };
  child.stdio[4].end = message => {
    assert.equal(message, "sps.owner-host.shutdown/v1\n");
    sent++;
  };
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310", fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["core-fixture.mjs"] }),
    spawn: () => { healthy = true; return child; }, delay: async () => {},
    createNativeSigner: () => ({ inspect: async () => ({}), sign: async () => ({}), dispose: () => { disposed++; } }),
  });
  await manager.start();
  const first = manager.stop();
  const second = manager.stop();
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(child.connected, false);
    assert.equal(sent, 1); assert.equal(disposed, 1); assert.equal(kills, 0);
  } finally {
    healthy = false; child.exitCode = 0; child.emit("exit", 0);
    await Promise.all([first, second]);
  }
  assert.equal((await manager.inspect()).state, "stopped");
});

test("normal Windows stop retains its private pipe after an earlier signer invalidation", { skip: process.platform !== "win32" }, async () => {
  let healthy = false, sent = 0, killed = 0;
  const child = fakeChild();
  child.kill = () => { killed++; };
  child.stdio[4].end = message => {
    assert.equal(message, "sps.owner-host.shutdown/v1\n");
    assert.equal(child.connected, false);
    assert.equal(child.listenerCount("message"), 0);
    sent++; healthy = false; child.exitCode = 0; child.emit("exit", 0);
  };
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310", fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["core-fixture.mjs"] }),
    spawn: () => { healthy = true; return child; }, delay: async () => {},
    createNativeSigner: () => ({ inspect: async () => ({}), sign: async () => ({}), dispose() {} }),
  });
  await manager.start(); manager.invalidateNativeSigner();
  assert.equal(healthy, true); assert.equal(killed, 0);
  await manager.stop();
  assert.equal(sent, 1); assert.equal(killed, 0);
});

test("an explicit force stop can still escalate an in-flight Windows graceful drain", { skip: process.platform !== "win32" }, async () => {
  let healthy = false, terminated = 0;
  const child = fakeChild();
  child.pid = 12345;
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310", fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["core-fixture.mjs"] }),
    spawn: () => { healthy = true; return child; }, delay: async () => {},
    createNativeSigner: () => ({ inspect: async () => ({}), sign: async () => ({}), dispose() {} }),
    terminateTree: async pid => { assert.equal(pid, child.pid); terminated++; healthy = false; child.exitCode = 0; child.emit("exit", 0); },
  });
  await manager.start();
  const graceful = manager.stop();
  await manager.stop({ force: true });
  await graceful;
  assert.equal(terminated, 1);
});

test("recovers an owned Host that becomes healthy after a bounded startup wait", async () => {
  let healthy = false;
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => { child.exitCode = 0; child.emit("exit", 0); };
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["host.mjs"], cwd: "C:/sps" }),
    spawn: () => child,
    delay: async () => {},
    startupAttempts: 1,
  });

  const timedOut = await manager.start();
  assert.equal(timedOut.state, "starting");
  assert.match(timedOut.lastError, /did not become ready/);

  healthy = true;
  const recovered = await manager.inspect();
  assert.equal(recovered.state, "running");
  assert.equal(recovered.lastError, null);
});

test("forces only its own Host process tree when graceful shutdown does not finish", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.pid = 42;
  child.kill = () => true;
  let terminatedPid = null;
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    fetchImpl: async () => ({ ok: false }),
    resolveRuntime: async () => ({ command: "node", args: ["host.mjs"], cwd: "C:/sps" }),
    spawn: () => child,
    delay: async () => {},
    startupAttempts: 0,
    terminateTree: async (pid) => { terminatedPid = pid; child.exitCode = 0; child.emit("exit", 0); },
  });

  await manager.start();
  await manager.stop({ force: true });
  assert.equal(terminatedPid, 42);
});

test("does not start when the packaged Owner Host runtime is missing", async () => {
  const manager = createSpsOwnerHostManager({
    url: "http://127.0.0.1:31310",
    fetchImpl: async () => ({ ok: false }),
    resolveRuntime: async () => null,
  });

  const status = await manager.start();
  assert.equal(status.state, "stopped");
  assert.match(status.lastError, /runtime is not installed/);
});

test("prefers the bundled Node runtime for packaged Owner Host dependencies", async () => {
  const files = new Set([
    "C:/runtime/dist/index.js",
    "C:/runtime/sps-owner-host-bootstrap.mjs",
    "C:/runtime/bin/node.exe",
  ]);
  const runtime = await resolveSpsOwnerHostRuntime({
    packagedRuntimeRoots: ["C:/runtime"],
    packagedNodeCommand: "C:/SPS Desktop.exe",
    configPath: "C:/SPS Vault/config.json",
    environment: { PAPERCLIP_HOME: "C:/SPS Vault" },
    fsApi: { access: async (entry) => {
      if (!files.has(String(entry).replaceAll("\\", "/"))) throw new Error("missing");
    } },
  });

  assert.equal(runtime.kind, "packaged-owner-runtime");
  assert.equal(runtime.command, path.join("C:/runtime", "bin", "node.exe"));
  assert.deepEqual(runtime.args, ["sps-owner-host-bootstrap.mjs"]);
  assert.deepEqual(runtime.environment, {
    PAPERCLIP_HOME: "C:/SPS Vault",
    PAPERCLIP_CONFIG: "C:/SPS Vault/config.json",
    PAPERCLIP_INSTANCE_ID: "sps-desktop-owner",
  });
});

test("uses one stable packaged Node path across Desktop updates", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-node-"));
  const runtimeRoot = path.join(temporaryRoot, "runtime-0.4.106");
  const stableRoot = path.join(temporaryRoot, "stable");
  try {
    await fs.mkdir(path.join(runtimeRoot, "bin"), { recursive: true });
    await fs.mkdir(path.join(runtimeRoot, "dist"), { recursive: true });
    await fs.writeFile(path.join(runtimeRoot, "dist", "index.js"), "export {};\n", "utf8");
    await fs.writeFile(path.join(runtimeRoot, "sps-owner-host-bootstrap.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(runtimeRoot, "bin", "node.exe"), "node-v1", "utf8");

    const first = await materializeStableSpsOwnerHostNode({ runtimeRoot, stableRoot, platform: "win32" });
    const second = await materializeStableSpsOwnerHostNode({ runtimeRoot, stableRoot, platform: "win32" });
    assert.equal(first, path.join(stableRoot, "node.exe"));
    assert.equal(second, first);
    assert.equal(await fs.readFile(first, "utf8"), "node-v1");

    await fs.writeFile(first, "tampered", "utf8");
    const repaired = await materializeStableSpsOwnerHostNode({ runtimeRoot, stableRoot, platform: "win32" });
    assert.equal(repaired, first);
    assert.equal(await fs.readFile(repaired, "utf8"), "node-v1");

    await fs.writeFile(path.join(runtimeRoot, "bin", "node.exe"), "node-v2", "utf8");
    const refreshed = await materializeStableSpsOwnerHostNode({ runtimeRoot, stableRoot, platform: "win32" });
    assert.equal(refreshed, first);
    assert.equal(await fs.readFile(refreshed, "utf8"), "node-v2");

    const runtime = await resolveSpsOwnerHostRuntime({
      packagedRuntimeRoots: [runtimeRoot],
      stableNodeCommand: refreshed,
    });
    assert.equal(runtime.command, refreshed);
    assert.equal(runtime.environment.ELECTRON_RUN_AS_NODE, undefined);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("uses a distinct validated instance identity for an isolated preview runtime", async () => {
  const files = new Set([
    "C:/runtime/dist/index.js",
    "C:/runtime/sps-owner-host-bootstrap.mjs",
    "C:/core/cli/src/index.ts",
    "C:/core/node_modules/.pnpm/tsx@4.0.0/node_modules/tsx/dist/loader.mjs",
    "C:/core/node_modules/.pnpm/tsx@4.0.0/node_modules/tsx/dist/preflight.cjs",
  ]);
  const fsApi = {
    access: async (entry) => {
      if (!files.has(String(entry).replaceAll("\\", "/"))) throw new Error("missing");
    },
    readdir: async () => [{ name: "tsx@4.0.0", isDirectory: () => true }],
  };

  const packaged = await resolveSpsOwnerHostRuntime({
    packagedRuntimeRoots: ["C:/runtime"],
    instanceId: "preview.project_01",
    fsApi,
  });
  const development = await resolveSpsOwnerHostRuntime({
    coreRoots: ["C:/core"],
    instanceId: "preview.project_01",
    configPath: "C:/SPS Vault/config.json",
    environment: { PAPERCLIP_CONFIG: "C:/wrong/config.json", PAPERCLIP_INSTANCE_ID: "wrong" },
    fsApi,
  });

  assert.equal(packaged.environment.PAPERCLIP_INSTANCE_ID, "preview.project_01");
  assert.deepEqual(development.args.slice(-4), ["--instance", "preview.project_01", "--config", "C:/SPS Vault/config.json"]);
  assert.equal(development.environment.PAPERCLIP_CONFIG, "C:/SPS Vault/config.json");
  assert.equal(development.environment.PAPERCLIP_INSTANCE_ID, "preview.project_01");
});

test("rejects unsafe Owner Host instance identities", async () => {
  for (const instanceId of ["", "preview id", "../preview", "preview/one", "a".repeat(65), 7]) {
    await assert.rejects(
      resolveSpsOwnerHostRuntime({ instanceId }),
      /instanceId must be 1-64 ASCII letters, digits, dots, underscores, or hyphens/,
    );
  }
});

test("keeps the Electron-as-Node fallback for an older packaged runtime", async () => {
  const files = new Set([
    "C:/runtime/dist/index.js",
    "C:/runtime/sps-owner-host-bootstrap.mjs",
  ]);
  const runtime = await resolveSpsOwnerHostRuntime({
    packagedRuntimeRoots: ["C:/runtime"],
    packagedNodeCommand: "C:/SPS Desktop.exe",
    fsApi: { access: async (entry) => {
      if (!files.has(String(entry).replaceAll("\\", "/"))) throw new Error("missing");
    } },
  });

  assert.equal(runtime.command, "C:/SPS Desktop.exe");
  assert.equal(runtime.environment.ELECTRON_RUN_AS_NODE, "1");
});

test("materializes the embedded runtime into the Owner data directory once", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-runtime-"));
  const source = path.join(temporaryRoot, "source");
  const target = path.join(temporaryRoot, "target");
  try {
    await fs.mkdir(path.join(source, "dist"), { recursive: true });
    await fs.mkdir(path.join(source, "sps-vendor", "tsx", "dist"), { recursive: true });
    await fs.mkdir(path.join(source, "bin"), { recursive: true });
    await fs.writeFile(path.join(source, "dist", "index.js"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-bootstrap.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-vendor", "tsx", "dist", "loader.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "bin", process.platform === "win32" ? "node.exe" : "node"), "node\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-runtime.json"), "{\"format\":1}\n", "utf8");
    await fs.writeFile(path.join(source, "package.json"), "{\"name\":\"sps-owner-host-runtime\"}\n", "utf8");

    assert.equal(await materializeSpsOwnerHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target }), target);
    assert.equal(await fs.readFile(path.join(target, "dist", "index.js"), "utf8"), "export {};\n");
    assert.equal(await fs.readFile(path.join(target, "node_modules", "tsx", "dist", "loader.mjs"), "utf8"), "export {};\n");
    assert.equal(await fs.readFile(spsOwnerHostBundledNodePath(target), "utf8"), "node\n");
    assert.equal(await materializeSpsOwnerHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target }), target);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("runs a packaged node_modules runtime in place without copying dependencies", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-runtime-direct-"));
  const source = path.join(temporaryRoot, "source");
  const target = path.join(temporaryRoot, "target");
  try {
    await fs.mkdir(path.join(source, "dist"), { recursive: true });
    await fs.mkdir(path.join(source, "node_modules", "tsx", "dist"), { recursive: true });
    await fs.writeFile(path.join(source, "dist", "index.js"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-bootstrap.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "node_modules", "tsx", "dist", "loader.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-runtime.json"), "{\"format\":3}\n", "utf8");
    await fs.writeFile(path.join(source, "package.json"), "{\"name\":\"sps-owner-host-runtime\"}\n", "utf8");

    assert.equal(await materializeSpsOwnerHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target }), source);
    await assert.rejects(fs.access(target));
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("materializes a development node_modules runtime instead of locking the source runtime", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-runtime-development-"));
  const source = path.join(temporaryRoot, "source");
  const target = path.join(temporaryRoot, "target");
  try {
    await fs.mkdir(path.join(source, "dist"), { recursive: true });
    await fs.mkdir(path.join(source, "node_modules", "tsx", "dist"), { recursive: true });
    await fs.writeFile(path.join(source, "dist", "index.js"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-bootstrap.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "node_modules", "tsx", "dist", "loader.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-runtime.json"), "{\"format\":4}\n", "utf8");
    await fs.writeFile(path.join(source, "package.json"), "{\"name\":\"sps-owner-host-runtime\"}\n", "utf8");

    assert.equal(await materializeSpsOwnerHostRuntime({
      sourceRuntimeRoot: source,
      targetRuntimeRoot: target,
      runInPlace: false,
    }), target);
    assert.equal(await fs.readFile(path.join(target, "node_modules", "tsx", "dist", "loader.mjs"), "utf8"), "export {};\n");
    assert.equal(await materializeSpsOwnerHostRuntime({
      sourceRuntimeRoot: source,
      targetRuntimeRoot: target,
      runInPlace: false,
    }), target);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("retries a stale Windows staging runtime directory before materializing", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-runtime-retry-"));
  const source = path.join(temporaryRoot, "source");
  const target = path.join(temporaryRoot, "target");
  const staging = `${target}.staging`;
  let staleRemovalAttempts = 0;
  const flakyFs = {
    ...fs,
    rm: async (entry, options) => {
      if (path.resolve(entry) === path.resolve(staging) && staleRemovalAttempts++ === 0) {
        const error = new Error("directory is temporarily busy");
        error.code = "ENOTEMPTY";
        throw error;
      }
      return await fs.rm(entry, options);
    },
  };
  try {
    await fs.mkdir(path.join(source, "dist"), { recursive: true });
    await fs.mkdir(path.join(source, "sps-vendor", "tsx", "dist"), { recursive: true });
    await fs.writeFile(path.join(source, "dist", "index.js"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-bootstrap.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-vendor", "tsx", "dist", "loader.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-runtime.json"), "{\"format\":1}\n", "utf8");
    await fs.writeFile(path.join(source, "package.json"), "{\"name\":\"sps-owner-host-runtime\"}\n", "utf8");
    await fs.mkdir(staging, { recursive: true });

    await materializeSpsOwnerHostRuntime({
      sourceRuntimeRoot: source,
      targetRuntimeRoot: target,
      fsApi: flakyFs,
      delay: async () => {},
    });

    assert.ok(staleRemovalAttempts >= 2);
    assert.equal(await fs.readFile(path.join(target, "dist", "index.js"), "utf8"), "export {};\n");
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
