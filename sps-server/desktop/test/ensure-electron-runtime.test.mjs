import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ensureElectronRuntime } from "../scripts/ensure-electron-runtime.mjs";

const desktopRoot = path.resolve("C:/sps-desktop-test");
const installerPath = path.join(desktopRoot, "node_modules", "electron", "install.js");
const runtimePath = path.join(desktopRoot, "node_modules", "electron", "dist", "electron.exe");

test("does not reinstall an existing Electron runtime", () => {
  let spawned = false;
  assert.equal(ensureElectronRuntime({
    desktopRoot,
    platform: "win32",
    exists: (candidate) => candidate === runtimePath,
    spawn: () => { spawned = true; return { status: 0 }; },
  }), runtimePath);
  assert.equal(spawned, false);
});

test("fails clearly when the Electron installer is missing", () => {
  assert.throws(
    () => ensureElectronRuntime({ desktopRoot, platform: "win32", exists: () => false }),
    /Electron package is unavailable/,
  );
});

test("runs the Electron installer and verifies the resulting runtime", () => {
  let installed = false;
  let invocation = null;
  const result = ensureElectronRuntime({
    desktopRoot,
    platform: "win32",
    nodeExecutable: "node-test",
    env: { TEST_ENV: "1" },
    exists: (candidate) => candidate === installerPath || (candidate === runtimePath && installed),
    spawn: (command, args, options) => {
      invocation = { command, args, options };
      installed = true;
      return { status: 0 };
    },
  });
  assert.equal(result, runtimePath);
  assert.equal(invocation.command, "node-test");
  assert.deepEqual(invocation.args, [installerPath]);
  assert.equal(invocation.options.cwd, path.dirname(installerPath));
});

test("fails closed when Electron installation does not produce a runtime", () => {
  assert.throws(
    () => ensureElectronRuntime({
      desktopRoot,
      platform: "win32",
      exists: (candidate) => candidate === installerPath,
      spawn: () => ({ status: 1 }),
    }),
    /installation failed \(exit 1\)/,
  );
});
