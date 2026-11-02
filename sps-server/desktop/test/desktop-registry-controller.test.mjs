import assert from "node:assert/strict";
import test from "node:test";

import { registerDesktopRegistryIpc } from "../src/desktop-registry-controller.mjs";

const channels = [
  "desktop:registry-list-sources",
  "desktop:registry-list-bundled-reviews",
  "desktop:registry-stage-bundled-review",
  "desktop:registry-choose-local-source",
  "desktop:registry-add-source",
  "desktop:registry-remove-source",
  "desktop:registry-inspect-source",
  "desktop:registry-stage-release",
  "desktop:registry-enable-stage",
  "desktop:registry-list-stages",
  "desktop:developer-list-projects",
  "desktop:developer-choose-project-folder",
  "desktop:developer-connect-project",
  "desktop:developer-inspect-project",
  "desktop:developer-run-gates",
  "desktop:developer-apply-candidate",
  "desktop:developer-rollback-project",
  "desktop:developer-reload-ui",
  "desktop:developer-restart-worker",
  "desktop:developer-reveal-package",
  "desktop:developer-list-preview-diagnostics",
  "desktop:developer-clear-preview-diagnostics",
  "desktop:developer-preview-state",
  "desktop:developer-update-preview-environment",
  "desktop:developer-remove-project",
];

function makeHarness() {
  const handlers = new Map();
  const calls = [];
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };
  const event = { sender: { id: 7 } };
  const services = {};
  for (const channel of channels) {
    const key = channel.replace(/^desktop:/, "").replaceAll("-", "_");
    services[key] = async (...args) => {
      calls.push({ key, args });
      return { key, args };
    };
  }
  services.public_desktop_preview_state = () => {
    calls.push({ key: "public_desktop_preview_state", args: [] });
    return { state: "ready" };
  };
  let registryAssertions = 0;
  let ownerAssertions = 0;
  registerDesktopRegistryIpc({
    ipcMain,
    assertRegistryWindowEvent: () => { registryAssertions += 1; },
    assertRegistryOwner: () => { ownerAssertions += 1; },
    listRegistrySources: services.registry_list_sources,
    listDesktopBundledPluginReviews: services.registry_list_bundled_reviews,
    stageDesktopBundledPluginReview: services.registry_stage_bundled_review,
    chooseDesktopLocalRegistryFolder: services.registry_choose_local_source,
    addDesktopRegistrySource: services.registry_add_source,
    removeDesktopRegistrySource: services.registry_remove_source,
    inspectDesktopRegistrySource: services.registry_inspect_source,
    stageDesktopRegistryRelease: services.registry_stage_release,
    enableDesktopRegistryStage: services.registry_enable_stage,
    listDesktopRegistryStages: services.registry_list_stages,
    listDesktopDeveloperProjects: services.developer_list_projects,
    chooseDesktopDeveloperProjectFolder: services.developer_choose_project_folder,
    connectDesktopDeveloperProject: services.developer_connect_project,
    inspectDesktopDeveloperProject: services.developer_inspect_project,
    runDesktopDeveloperGates: services.developer_run_gates,
    applyDesktopDeveloperCandidate: services.developer_apply_candidate,
    rollbackDesktopDeveloperProject: services.developer_rollback_project,
    reloadDesktopDeveloperUi: services.developer_reload_ui,
    restartDesktopDeveloperWorker: services.developer_restart_worker,
    revealDesktopDeveloperPackage: services.developer_reveal_package,
    listDesktopPluginPreviewDiagnostics: services.developer_list_preview_diagnostics,
    clearDesktopPluginPreviewDiagnostics: services.developer_clear_preview_diagnostics,
    publicDesktopPluginPreviewState: services.public_desktop_preview_state,
    updateDesktopPluginPreviewEnvironment: services.developer_update_preview_environment,
    removeDesktopDeveloperProject: services.developer_remove_project,
  });
  return { handlers, calls, event, get registryAssertions() { return registryAssertions; }, get ownerAssertions() { return ownerAssertions; } };
}

test("registers every registry and developer channel", () => {
  const harness = makeHarness();
  assert.deepEqual([...harness.handlers.keys()], channels);
});

test("forwards registry and developer arguments without changing their shape", async () => {
  const harness = makeHarness();
  const inputs = new Map([
    ["desktop:registry-add-source", { sourceId: "source-1" }],
    ["desktop:registry-stage-bundled-review", { pluginId: "sps.fixture", directory: "ignored" }],
    ["desktop:registry-remove-source", { sourceId: "source-2" }],
    ["desktop:registry-inspect-source", { sourceId: "source-3" }],
    ["desktop:registry-stage-release", { release: "release-1" }],
    ["desktop:registry-enable-stage", { stageId: "stage-1" }],
    ["desktop:developer-connect-project", { projectId: "project-1" }],
    ["desktop:developer-inspect-project", { projectId: "project-2" }],
    ["desktop:developer-run-gates", { projectId: "project-3", executionMode: "trusted-local" }],
    ["desktop:developer-apply-candidate", { projectId: "project-4", executionMode: "trusted-local" }],
    ["desktop:developer-rollback-project", { projectId: "project-5", executionMode: "trusted-local" }],
    ["desktop:developer-reload-ui", { projectId: "project-6", executionMode: "trusted-local" }],
    ["desktop:developer-restart-worker", { projectId: "project-7", executionMode: "trusted-local" }],
    ["desktop:developer-reveal-package", { projectId: "project-package", archivePath: "ignored" }],
    ["desktop:developer-list-preview-diagnostics", { limit: 3 }],
    ["desktop:developer-update-preview-environment", { projectId: "project-8" }],
    ["desktop:developer-remove-project", { projectId: "project-9" }],
  ]);
  for (const channel of channels) {
    const input = inputs.get(channel);
    await harness.handlers.get(channel)(harness.event, input);
  }
  assert.equal(harness.registryAssertions, channels.length);
  assert.equal(harness.ownerAssertions, 7);
  assert.deepEqual(harness.calls.find((call) => call.key === "developer_reveal_package").args, ["project-package"]);
  assert.deepEqual(harness.calls.find((call) => call.key === "registry_add_source").args, [inputs.get("desktop:registry-add-source")]);
  assert.deepEqual(harness.calls.find((call) => call.key === "registry_remove_source").args, ["source-2"]);
  assert.deepEqual(harness.calls.find((call) => call.key === "registry_stage_bundled_review").args, ["sps.fixture"]);
  assert.deepEqual(harness.calls.find((call) => call.key === "developer_inspect_project").args, ["project-2"]);
  assert.deepEqual(harness.calls.find((call) => call.key === "developer_list_preview_diagnostics").args, [{ limit: 3 }]);
  assert.deepEqual(harness.calls.find((call) => call.key === "developer_remove_project").args, ["project-9"]);
});

test("every developer code-execution entry rejects missing or protected mode before any service call", async () => {
  const harness = makeHarness();
  const entries = ["run-gates", "apply-candidate", "rollback-project", "reload-ui", "restart-worker"];
  for (const entry of entries) {
    const invoke = input => harness.handlers.get(`desktop:developer-${entry}`)(harness.event, input);
    await assert.rejects(invoke({ projectId: "project-1" }));
    await assert.rejects(invoke({ projectId: "project-1", executionMode: "protected" }), /Protected development execution is unavailable/);
    await assert.rejects(invoke({ projectId: "project-1", executionMode: "trusted-local", arbitraryScope: true }));
  }
  assert.deepEqual(harness.calls, []);
});

test("explicit trusted mode never bypasses Registry window and Host owner checks", async () => {
  for (const denied of ["window", "owner"]) {
    const handlers = new Map(); let executed = false;
    const reject = () => { throw new Error("authority denied"); };
    registerDesktopRegistryIpc({ ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
      assertRegistryWindowEvent: denied === "window" ? reject : () => {},
      assertRegistryOwner: denied === "owner" ? reject : () => {},
      applyDesktopDeveloperCandidate: async () => { executed = true; } });
    await assert.rejects(handlers.get("desktop:developer-apply-candidate")({}, { projectId: "project-1", executionMode: "trusted-local" }));
    assert.equal(executed, false);
  }
});

test("enforces the registry window guard before forwarding", async () => {
  const error = new Error("wrong window");
  const handlers = new Map();
  const calls = [];
  registerDesktopRegistryIpc({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    assertRegistryWindowEvent: () => { throw error; },
    assertRegistryOwner: () => {},
    listRegistrySources: async () => calls.push("listRegistrySources"),
    chooseDesktopLocalRegistryFolder: async () => calls.push("chooseDesktopLocalRegistryFolder"),
    addDesktopRegistrySource: async () => calls.push("addDesktopRegistrySource"),
    removeDesktopRegistrySource: async () => calls.push("removeDesktopRegistrySource"),
    inspectDesktopRegistrySource: async () => calls.push("inspectDesktopRegistrySource"),
    stageDesktopRegistryRelease: async () => calls.push("stageDesktopRegistryRelease"),
    enableDesktopRegistryStage: async () => calls.push("enableDesktopRegistryStage"),
    listDesktopRegistryStages: async () => calls.push("listDesktopRegistryStages"),
    listDesktopDeveloperProjects: async () => calls.push("listDesktopDeveloperProjects"),
    chooseDesktopDeveloperProjectFolder: async () => calls.push("chooseDesktopDeveloperProjectFolder"),
    connectDesktopDeveloperProject: async () => calls.push("connectDesktopDeveloperProject"),
    inspectDesktopDeveloperProject: async () => calls.push("inspectDesktopDeveloperProject"),
    runDesktopDeveloperGates: async () => calls.push("runDesktopDeveloperGates"),
    applyDesktopDeveloperCandidate: async () => calls.push("applyDesktopDeveloperCandidate"),
    rollbackDesktopDeveloperProject: async () => calls.push("rollbackDesktopDeveloperProject"),
    reloadDesktopDeveloperUi: async () => calls.push("reloadDesktopDeveloperUi"),
    restartDesktopDeveloperWorker: async () => calls.push("restartDesktopDeveloperWorker"),
    listDesktopPluginPreviewDiagnostics: async () => calls.push("listDesktopPluginPreviewDiagnostics"),
    clearDesktopPluginPreviewDiagnostics: async () => calls.push("clearDesktopPluginPreviewDiagnostics"),
    publicDesktopPluginPreviewState: () => ({}),
    updateDesktopPluginPreviewEnvironment: async () => calls.push("updateDesktopPluginPreviewEnvironment"),
    removeDesktopDeveloperProject: async () => calls.push("removeDesktopDeveloperProject"),
  });
  await assert.rejects(() => handlers.get("desktop:registry-list-sources")({}), (actual) => actual === error);
  assert.deepEqual(calls, []);
});

test("rejects package reveal from other windows and without Host authority", async () => {
  for (const rejectedGuard of ["window", "owner"]) {
    const handlers = new Map();
    let revealed = false;
    registerDesktopRegistryIpc({
      ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
      assertRegistryWindowEvent: () => { if (rejectedGuard === "window") throw new Error("Wrong window"); },
      assertRegistryOwner: () => { if (rejectedGuard === "owner") throw new Error("Host required"); },
      revealDesktopDeveloperPackage: async () => { revealed = true; },
    });
    await assert.rejects(handlers.get("desktop:developer-reveal-package")({}, { projectId: "project-1" }));
    assert.equal(revealed, false);
  }
});
