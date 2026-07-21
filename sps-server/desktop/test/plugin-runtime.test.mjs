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
  assert.match(result.message, /local-folder plugins remain available/);
});
