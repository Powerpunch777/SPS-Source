import { promises as fs } from "node:fs";
import path from "node:path";

export async function chooseLocalAgentWorkingDirectory({ assertOwner, dialog, parentWindow, fsApi = fs }) {
  assertOwner();
  const selection = await dialog.showOpenDialog(parentWindow, {
    title: "Choose Agent default working folder", properties: ["openDirectory"],
  });
  assertOwner();
  if (selection.canceled) return null;
  if (!Array.isArray(selection.filePaths) || selection.filePaths.length !== 1) throw new Error("Select one local folder.");
  const selected = selection.filePaths[0];
  if (typeof selected !== "string" || selected.length > 32_000 || !path.isAbsolute(selected) || /[\u0000-\u001f\u007f]/.test(selected)
    || (process.platform === "win32" && !/^[a-z]:[\\/]/i.test(selected))) {
    throw new Error("Select a local absolute folder.");
  }
  const stats = await fsApi.lstat(selected);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("Select a real local directory.");
  const cwd = await fsApi.realpath(selected);
  if (!path.isAbsolute(cwd) || (process.platform === "win32" && !/^[a-z]:[\\/]/i.test(cwd))) {
    throw new Error("Select a local absolute folder.");
  }
  assertOwner();
  return { cwd };
}

export function registerDesktopAgentDirectoryIpc({ ipcMain, assertLocalOwnerWorkspace, chooseDirectory }) {
  ipcMain.handle("desktop:workspace-choose-agent-directory", async event => {
    assertLocalOwnerWorkspace(event, "Agent folder selection");
    return await chooseDirectory();
  });
}
