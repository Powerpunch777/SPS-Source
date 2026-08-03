/**
 * Registers Registry and developer-preview IPC handlers.
 *
 * The handlers intentionally remain thin forwarding adapters. Keeping the
 * channel names here preserves the renderer contract while keeping the
 * composition root focused on application wiring.
 */
export function registerDesktopRegistryIpc({
  ipcMain,
  assertRegistryWindowEvent,
  assertRegistryOwner,
  listRegistrySources,
  chooseDesktopLocalRegistryFolder,
  addDesktopRegistrySource,
  removeDesktopRegistrySource,
  inspectDesktopRegistrySource,
  stageDesktopRegistryRelease,
  enableDesktopRegistryStage,
  listDesktopRegistryStages,
  listDesktopDeveloperProjects,
  chooseDesktopDeveloperProjectFolder,
  connectDesktopDeveloperProject,
  inspectDesktopDeveloperProject,
  runDesktopDeveloperGates,
  applyDesktopDeveloperCandidate,
  rollbackDesktopDeveloperProject,
  reloadDesktopDeveloperUi,
  restartDesktopDeveloperWorker,
  listDesktopPluginPreviewDiagnostics,
  clearDesktopPluginPreviewDiagnostics,
  publicDesktopPluginPreviewState,
  updateDesktopPluginPreviewEnvironment,
  removeDesktopDeveloperProject,
}) {
  const assertRegistryEvent = (event) => assertRegistryWindowEvent(event);

  ipcMain.handle("desktop:registry-list-sources", async (event) => {
    assertRegistryEvent(event);
    return await listRegistrySources();
  });
  ipcMain.handle("desktop:registry-choose-local-source", async (event) => {
    assertRegistryEvent(event);
    return await chooseDesktopLocalRegistryFolder();
  });
  ipcMain.handle("desktop:registry-add-source", async (event, input) => {
    assertRegistryEvent(event);
    return await addDesktopRegistrySource(input);
  });
  ipcMain.handle("desktop:registry-remove-source", async (event, input) => {
    assertRegistryEvent(event);
    return await removeDesktopRegistrySource(input?.sourceId);
  });
  ipcMain.handle("desktop:registry-inspect-source", async (event, input) => {
    assertRegistryEvent(event);
    return await inspectDesktopRegistrySource(input?.sourceId);
  });
  ipcMain.handle("desktop:registry-stage-release", async (event, input) => {
    assertRegistryEvent(event);
    return await stageDesktopRegistryRelease(input);
  });
  ipcMain.handle("desktop:registry-enable-stage", async (event, input) => {
    assertRegistryEvent(event);
    return await enableDesktopRegistryStage(input?.stageId);
  });
  ipcMain.handle("desktop:registry-list-stages", async (event) => {
    assertRegistryEvent(event);
    return await listDesktopRegistryStages();
  });

  ipcMain.handle("desktop:developer-list-projects", async (event) => {
    assertRegistryEvent(event);
    return await listDesktopDeveloperProjects();
  });
  ipcMain.handle("desktop:developer-choose-project-folder", async (event) => {
    assertRegistryEvent(event);
    return await chooseDesktopDeveloperProjectFolder();
  });
  ipcMain.handle("desktop:developer-connect-project", async (event, input) => {
    assertRegistryEvent(event);
    return await connectDesktopDeveloperProject(input);
  });
  ipcMain.handle("desktop:developer-inspect-project", async (event, input) => {
    assertRegistryEvent(event);
    return await inspectDesktopDeveloperProject(input?.projectId);
  });
  ipcMain.handle("desktop:developer-run-gates", async (event, input) => {
    assertRegistryEvent(event);
    return await runDesktopDeveloperGates(input?.projectId);
  });
  ipcMain.handle("desktop:developer-apply-candidate", async (event, input) => {
    assertRegistryEvent(event);
    return await applyDesktopDeveloperCandidate(input?.projectId);
  });
  ipcMain.handle("desktop:developer-rollback-project", async (event, input) => {
    assertRegistryEvent(event);
    return await rollbackDesktopDeveloperProject(input?.projectId);
  });
  ipcMain.handle("desktop:developer-reload-ui", async (event, input) => {
    assertRegistryEvent(event);
    return await reloadDesktopDeveloperUi(input?.projectId);
  });
  ipcMain.handle("desktop:developer-restart-worker", async (event, input) => {
    assertRegistryEvent(event);
    return await restartDesktopDeveloperWorker(input?.projectId);
  });
  ipcMain.handle("desktop:developer-list-preview-diagnostics", async (event, input) => {
    assertRegistryEvent(event);
    return await listDesktopPluginPreviewDiagnostics(input);
  });
  ipcMain.handle("desktop:developer-clear-preview-diagnostics", async (event) => {
    assertRegistryEvent(event);
    return await clearDesktopPluginPreviewDiagnostics();
  });
  ipcMain.handle("desktop:developer-preview-state", async (event) => {
    assertRegistryEvent(event);
    assertRegistryOwner();
    return publicDesktopPluginPreviewState();
  });
  ipcMain.handle("desktop:developer-update-preview-environment", async (event, input) => {
    assertRegistryEvent(event);
    return await updateDesktopPluginPreviewEnvironment(input);
  });
  ipcMain.handle("desktop:developer-remove-project", async (event, input) => {
    assertRegistryEvent(event);
    return await removeDesktopDeveloperProject(input?.projectId);
  });
}
