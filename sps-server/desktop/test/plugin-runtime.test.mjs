import test from "node:test";
import assert from "node:assert/strict";
import { inspectSpsPluginRuntime } from "../src/plugin-runtime.mjs";

test("reports a usable npm runtime", async () => {
  const result = await inspectSpsPluginRuntime({
    platform: "win32",
    execFileImpl: (_command, _args, _options, callback) => callback(null, "11.7.0\n"),
  });

  assert.deepEqual(result, {
    state: "ready",
    command: "npm.cmd",
    npmCli: null,
    version: "11.7.0",
    message: "npm plugins and local-folder plugins are available.",
  });
});

test("keeps local-folder plugins available when npm is missing", async () => {
  const result = await inspectSpsPluginRuntime({
    platform: "linux",
    execFileImpl: (_command, _args, _options, callback) => callback(new Error("not found")),
  });

  assert.equal(result.state, "local-folder-only");
  assert.equal(result.command, null);
  assert.equal(result.npmCli, null);
  assert.match(result.message, /local-folder plugins remain available/);
});

test("finds the standard Windows Node installation when Electron cannot resolve npm from PATH", async () => {
  const nodeCommand = "C:\\Program Files\\nodejs\\node.exe";
  const nodeNpm = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  const commands = [];
  const result = await inspectSpsPluginRuntime({
    platform: "win32",
    environment: { ProgramFiles: "C:\\Program Files" },
    existsSyncImpl: (candidate) => candidate === nodeCommand || candidate === nodeNpm,
    execFileImpl: (command, _args, _options, callback) => {
      commands.push(command);
      callback(command === nodeCommand ? null : new Error("not found"), command === nodeCommand ? "11.7.0\n" : "");
    },
  });

  assert.equal(result.state, "ready");
  assert.equal(result.command, nodeCommand);
  assert.equal(result.npmCli, nodeNpm);
  assert.deepEqual(commands, ["npm.cmd", "npm", nodeCommand]);
});
