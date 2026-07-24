import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSpsOwnerHostManager, materializeSpsOwnerHostRuntime, resolveSpsOwnerHostRuntime } from "../src/owner-host.mjs";

function response(payload) {
  return { ok: true, json: async () => payload };
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
  });
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
    await fs.writeFile(path.join(source, "dist", "index.js"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-bootstrap.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-vendor", "tsx", "dist", "loader.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-owner-host-runtime.json"), "{\"format\":1}\n", "utf8");
    await fs.writeFile(path.join(source, "package.json"), "{\"name\":\"sps-owner-host-runtime\"}\n", "utf8");

    assert.equal(await materializeSpsOwnerHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target }), target);
    assert.equal(await fs.readFile(path.join(target, "dist", "index.js"), "utf8"), "export {};\n");
    assert.equal(await fs.readFile(path.join(target, "node_modules", "tsx", "dist", "loader.mjs"), "utf8"), "export {};\n");
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
