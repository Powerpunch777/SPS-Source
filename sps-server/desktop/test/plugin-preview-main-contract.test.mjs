import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const mainPath = path.resolve(import.meta.dirname, "..", "src", "main.mjs");
const previewPreloadPath = path.resolve(import.meta.dirname, "..", "src", "plugin-preview-preload.cjs");

test("Desktop accepts only its own Preview process and promotes after the window loads", async () => {
  const source = await readFile(mainPath, "utf8");
  const start = source.indexOf("async function startDesktopPluginPreview");
  const apply = source.indexOf("async function applyDesktopDeveloperCandidate");
  const rollback = source.indexOf("async function rollbackDesktopDeveloperProject");
  assert.ok(start >= 0 && apply > start && rollback > apply);

  const startSource = source.slice(start, apply);
  assert.match(startSource, /status\.state === "running-existing"/);
  assert.match(startSource, /status\.owned !== true/);

  const applySource = source.slice(apply, rollback);
  const windowLoad = applySource.indexOf("await showPluginPreviewWindow(preview)");
  const promote = applySource.indexOf("await promoteDeveloperCandidate");
  assert.ok(windowLoad >= 0 && promote > windowLoad);
});

test("Desktop injects only a normalized per-build fixture into its isolated Preview", async () => {
  const [source, preload] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(previewPreloadPath, "utf8"),
  ]);
  const start = source.indexOf("async function startDesktopPluginPreview");
  const workspace = source.indexOf("async function ensurePluginPreviewWorkspace");
  const startSource = source.slice(start, workspace);
  assert.match(startSource, /ensurePluginPreviewFixture\(\{/);
  assert.match(startSource, /pluginPreviewRuntime = \{ \.\.\.preview, projectId, fixture: fixtureState\.fixture \}/);
  assert.match(source, /preload: path\.join\(__dirname, "plugin-preview-preload\.cjs"\)/);
  assert.match(source, /ipcMain\.on\("desktop:plugin-preview-fixture"[\s\S]*?event\.sender\.id === pluginPreviewWindow\.webContents\.id/);
  assert.match(source, /updatePluginPreviewFixture\([\s\S]*?webContents\.reloadIgnoringCache\(\)/);
  assert.match(preload, /ipcRenderer\.sendSync\("desktop:plugin-preview-fixture"\)/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("__SPS_PLUGIN_PREVIEW_FIXTURE_V1__"/);
  assert.doesNotMatch(preload, /token|secret|password|require\("node:/i);
});

test("Desktop persists redacted Preview diagnostics without coupling renderer failure to the main Workspace", async () => {
  const source = await readFile(mainPath, "utf8");
  assert.match(source, /appendPluginPreviewDiagnostic/);
  assert.match(source, /PREVIEW_RUNTIME_STARTED/);
  assert.match(source, /PREVIEW_PACKAGE_STAGED/);
  assert.match(source, /PREVIEW_PLUGIN_READY/);
  assert.match(source, /PREVIEW_RENDERER_LOAD_FAILED/);
  assert.match(source, /PREVIEW_WORKER_RESTART_FAILED/);
  assert.match(source, /ipcMain\.handle\("desktop:developer-list-preview-diagnostics"/);
  assert.match(source, /ipcMain\.handle\("desktop:developer-clear-preview-diagnostics"/);
});
