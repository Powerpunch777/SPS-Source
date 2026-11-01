import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { captureSpsOwnerHostRuntimeReferences } from "../src/owner-host-runtime-references.mjs";

const root = path.resolve(os.tmpdir(), "sps-runtime-reference-fixture");
const pkg = (environment = {}) => ({ kind: "packaged-owner-runtime", command: process.execPath,
  cwd: root, args: ["sps-owner-host-bootstrap.mjs"], environment });

test("captures only named launch paths, not provider values or the entire Vault container", () => {
  const config = path.join(root, "config.json"), bundle = path.join(root, "bundle"), refresh = path.join(root, "refresh");
  const captured = captureSpsOwnerHostRuntimeReferences(pkg({ PAPERCLIP_CONFIG: config,
    SPS_BUNDLED_PLUGIN_PATHS: [bundle, refresh].join(path.delimiter), SPS_BUNDLED_PLUGIN_REFRESH_PATHS: refresh,
    PAPERCLIP_HOME: path.dirname(root), SPS_MEMORY_SIDECAR_TOKEN: "not-a-path-secret" }), { PATH: "fixture-path" });
  assert.equal(captured.snapshot.available, true);
  assert.deepEqual(captured.snapshot.references.map(item => item.path), [process.execPath, root,
    path.join(root, "sps-owner-host-bootstrap.mjs"), config, bundle, refresh, refresh]);
  assert.ok(captured.snapshot.references.every(item => item.source === "desktop-owned-runtime" && item.state === "retained"));
  assert.ok(captured.snapshot.references.every(Object.isFrozen));
  assert.equal(Object.isFrozen(captured.snapshot.references), true);
  assert.equal(Object.isFrozen(captured.snapshot), true);
  assert.equal(JSON.stringify(captured.snapshot).includes("not-a-path-secret"), false);
  assert.equal(captured.runtime.environment.SPS_MEMORY_SIDECAR_TOKEN, "not-a-path-secret");
  assert.equal(captured.runtime.environment.PATH, "fixture-path");
});

test("binds copied actual launch inputs before an asynchronous Job preparation can mutate them", () => {
  const original = pkg({ PAPERCLIP_CONFIG: path.join(root, "original.json") });
  const base = { PATH: "original-path" };
  const captured = captureSpsOwnerHostRuntimeReferences(original, base);
  original.args[0] = "replacement.mjs";
  original.environment.PAPERCLIP_CONFIG = path.join(root, "replacement.json");
  base.PATH = "replacement-path";
  assert.equal(captured.snapshot.available, true);
  assert.equal(captured.runtime.args[0], "sps-owner-host-bootstrap.mjs");
  assert.equal(captured.runtime.environment.PATH, "original-path");
  assert.ok(captured.snapshot.references.some(item => item.path === path.join(root, "original.json")));
  assert.equal(Object.isFrozen(captured.runtime), true);
  assert.equal(Object.isFrozen(captured.runtime.args), true);
  assert.equal(Object.isFrozen(captured.runtime.environment), true);
});

test("captures Node's actual process.env without accepting unrelated exotic environment objects", () => {
  // Do not depend on machine-specific optional SPS path overrides and do not
  // mutate the environment of the process running this test.
  const overrides = Object.fromEntries(Object.keys(process.env)
    .filter(key => /^(?:PAPERCLIP_|SPS_)/i.test(key)).map(key => [key, ""]));
  const captured = captureSpsOwnerHostRuntimeReferences(pkg(overrides), process.env);
  assert.equal(captured.snapshot.available, true);
  assert.notEqual(captured.runtime.environment, process.env);
  for (const [key, value] of Object.entries(process.env)) {
    assert.equal(captured.runtime.environment[key], Object.hasOwn(overrides, key) ? "" : value);
  }
  class Environment { PATH = "fixture"; }
  assert.equal(captureSpsOwnerHostRuntimeReferences(pkg(), new Environment()).snapshot.available, false);
});

test("captures development preflight, file URL loader, entry and optional config from the existing resolver shape", () => {
  const preflight = path.join(root, "preflight.cjs"), loader = path.join(root, "loader.mjs");
  const entry = path.join(root, "cli", "src", "index.ts"), config = path.join(root, "config.json");
  for (const configArgs of [[], ["--config", config]]) {
    const captured = captureSpsOwnerHostRuntimeReferences({ command: process.execPath, cwd: root, kind: "development-core",
      args: ["--require", preflight, "--import", pathToFileURL(loader).href, entry, "run", "--instance", "sps-test", ...configArgs], environment: {} });
    assert.equal(captured.snapshot.available, true);
    assert.deepEqual(captured.snapshot.references.map(item => item.path), [process.execPath, root, preflight, loader, entry,
      ...(configArgs.length ? [config] : [])]);
  }
});

test("unsupported or unresolved launch inputs cannot imply an empty safe reference set", () => {
  for (const change of [
    { command: "node" }, { cwd: "relative" }, { kind: "custom" }, { args: ["other-bootstrap.mjs"] },
    { environment: { PAPERCLIP_CONFIG: "relative" } }, { environment: { SPS_BUNDLED_PLUGIN_PATHS: `${root}${path.delimiter}` } },
    { environment: { SPS_PLUGIN_NODE_COMMAND: `${root}\0hidden` } },
  ]) {
    const value = { ...pkg(), ...change };
    const captured = captureSpsOwnerHostRuntimeReferences(value);
    assert.equal(captured.snapshot.available, false);
    assert.deepEqual(captured.snapshot.references, []);
    assert.equal(captured.runtime, value, "Unsupported cleanup introspection must not rewrite ordinary launch behavior.");
  }
});

test("accessor inputs are unavailable without executing their getters", () => {
  let calls = 0;
  const accessor = { enumerable: true, get() { calls++; throw new Error("Must not execute"); } };
  const values = [Object.defineProperty(pkg(), "cwd", accessor), pkg(Object.defineProperty({}, "PAPERCLIP_CONFIG", accessor)),
    { ...pkg(), args: Object.defineProperty(["sps-owner-host-bootstrap.mjs"], 0, accessor) }];
  for (const value of values) assert.equal(captureSpsOwnerHostRuntimeReferences(value).snapshot.available, false);
  assert.equal(calls, 0);
});

test("Windows case-insensitive environment lookup matches Node precedence without changing actual env keys", () => {
  const upper = path.join(root, "upper.json"), lower = path.join(root, "lower.json");
  const captured = captureSpsOwnerHostRuntimeReferences(pkg({ paperclip_config: lower, PAPERCLIP_CONFIG: upper }));
  assert.equal(captured.snapshot.available, true);
  assert.ok(captured.snapshot.references.some(item => item.path === upper));
  assert.equal(captured.snapshot.references.some(item => item.path === lower), false);
  assert.equal(captured.runtime.environment.paperclip_config, lower);
  assert.equal(captured.runtime.environment.PAPERCLIP_CONFIG, upper);
  const lowerOnly = captureSpsOwnerHostRuntimeReferences(pkg({ paperclip_config: lower }));
  assert.equal(lowerOnly.snapshot.references.some(item => item.path === lower), process.platform === "win32");
});
