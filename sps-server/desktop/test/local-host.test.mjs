import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSpsLocalHostManager, materializeSpsHostRuntime, resolveSpsHostRuntime } from "../src/local-host.mjs";

function response(payload) {
  return { ok: true, json: async () => payload };
}

test("adopts an already running local SPS Host without spawning another server", async () => {
  let spawned = false;
  const manager = createSpsLocalHostManager({
    fetchImpl: async () => response({ status: "ok" }),
    spawn: () => { spawned = true; },
  });

  const status = await manager.start();
  assert.equal(status.state, "adopted-external");
  assert.equal(spawned, false);
});

test("starts and owns a stopped Host only when a runtime is available", async () => {
  let healthy = false;
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => { healthy = false; child.exitCode = 0; child.emit("exit", 0); };
  const manager = createSpsLocalHostManager({
    fetchImpl: async () => healthy ? response({ status: "ok" }) : { ok: false },
    resolveRuntime: async () => ({ command: "node", args: ["host.mjs"], cwd: "C:/sps" }),
    spawn: () => {
      healthy = true;
      return child;
    },
    delay: async () => {},
  });

  const started = await manager.start();
  assert.equal(started.state, "running");
  const stopped = await manager.stop();
  assert.equal(stopped.state, "stopped");
});

test("does not try to start a Host when no packaged runtime exists", async () => {
  const manager = createSpsLocalHostManager({
    fetchImpl: async () => ({ ok: false }),
    resolveRuntime: async () => null,
  });

  const status = await manager.start();
  assert.equal(status.state, "stopped");
  assert.match(status.lastError, /runtime is not installed/);
});

test("finds a development Core runtime only when its tsx loader is available", async () => {
  const files = new Set([
    "C:/sps/cli/src/index.ts",
    "C:/sps/node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/loader.mjs",
    "C:/sps/node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/preflight.cjs",
  ]);
  const runtime = await resolveSpsHostRuntime({
    coreRoots: ["C:/missing", "C:/sps"],
    fsApi: {
      access: async (entry) => {
        if (!files.has(String(entry).replaceAll("\\", "/"))) throw new Error("missing");
      },
      readdir: async () => [{ name: "tsx@4.22.4", isDirectory: () => true }],
    },
  });

  assert.equal(runtime.kind, "development-core");
  assert.equal(runtime.args.at(-1), "default");
});

test("prefers the packaged Host runtime and launches Electron as Node", async () => {
  const files = new Set([
    "C:/runtime/dist/index.js",
    "C:/runtime/node_modules/tsx/dist/loader.mjs",
  ]);
  const runtime = await resolveSpsHostRuntime({
    packagedRuntimeRoots: ["C:/runtime"],
    packagedNodeCommand: "C:/SPS Desktop.exe",
    configPath: "C:/Users/owner/.sps/instances/default/config.json",
    fsApi: {
      access: async (entry) => {
        if (!files.has(String(entry).replaceAll("\\", "/"))) throw new Error("missing");
      },
    },
  });

  assert.equal(runtime.kind, "packaged-runtime");
  assert.equal(runtime.command, "C:/SPS Desktop.exe");
  assert.deepEqual(runtime.environment, { ELECTRON_RUN_AS_NODE: "1" });
  assert.deepEqual(runtime.args.slice(2, 4), ["-e", "await import('./dist/index.js')"]);
  assert.deepEqual(runtime.args.slice(-2), ["--config", "C:/Users/owner/.sps/instances/default/config.json"]);
});

test("materializes the packaged vendor payload into an executable runtime once", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-host-runtime-"));
  const source = path.join(temporaryRoot, "source");
  const target = path.join(temporaryRoot, "target");
  try {
    await fs.mkdir(path.join(source, "dist"), { recursive: true });
    await fs.mkdir(path.join(source, "sps-vendor", "tsx", "dist"), { recursive: true });
    await fs.writeFile(path.join(source, "dist", "index.js"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-vendor", "tsx", "dist", "loader.mjs"), "export {};\n", "utf8");
    await fs.writeFile(path.join(source, "sps-host-runtime.json"), "{\"format\":1}\n", "utf8");
    await fs.writeFile(path.join(source, "package.json"), "{\"name\":\"sps-host-runtime\"}\n", "utf8");

    assert.equal(await materializeSpsHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target }), target);
    assert.equal(await fs.readFile(path.join(target, "dist", "index.js"), "utf8"), "export {};\n");
    assert.equal(await fs.readFile(path.join(target, "node_modules", "tsx", "dist", "loader.mjs"), "utf8"), "export {};\n");
    assert.equal(await fs.readFile(path.join(target, "package.json"), "utf8"), "{\"name\":\"sps-host-runtime\"}\n");
    assert.equal(await materializeSpsHostRuntime({ sourceRuntimeRoot: source, targetRuntimeRoot: target }), target);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
