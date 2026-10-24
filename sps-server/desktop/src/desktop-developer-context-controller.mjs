export function registerDesktopDeveloperContextIpc({
  ipcMain,
  assertLocalOwnerWorkspace,
  assertRegistryWindowEvent,
  assertRegistryOwner,
  getDesktopDeveloperContext,
  openDesktopDeveloperContext,
  checkDesktopDeveloperAgentFolder,
  getRegistryDeveloperContext,
  linkRegistryDeveloperContext,
  clearRegistryDeveloperContext,
}) {
  ipcMain.handle("desktop:workspace-developer-context-get", async (event, input) => {
    assertLocalOwnerWorkspace(event, "Developer project context");
    return await getDesktopDeveloperContext(input);
  });
  ipcMain.handle("desktop:workspace-developer-context-open", async (event, input) => {
    assertLocalOwnerWorkspace(event, "Developer project context");
    return await openDesktopDeveloperContext(input);
  });
  ipcMain.handle("desktop:workspace-developer-agent-folder-check", async (event, input) => {
    assertLocalOwnerWorkspace(event, "Developer Agent folder check");
    return await checkDesktopDeveloperAgentFolder(input);
  });

  ipcMain.handle("desktop:developer-context-get", async (event) => {
    assertRegistryWindowEvent(event);
    assertRegistryOwner();
    return await getRegistryDeveloperContext();
  });
  ipcMain.handle("desktop:developer-context-link", async (event, input) => {
    assertRegistryWindowEvent(event);
    assertRegistryOwner();
    return await linkRegistryDeveloperContext({
      projectId: input?.projectId,
      contextToken: input?.contextToken,
    });
  });
  ipcMain.handle("desktop:developer-context-clear", async (event, input) => {
    assertRegistryWindowEvent(event);
    assertRegistryOwner();
    return await clearRegistryDeveloperContext({ contextToken: input?.contextToken });
  });
}
