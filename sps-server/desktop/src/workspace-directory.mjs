import { promises as fs } from "node:fs";
import path from "node:path";

export async function requireSpsWorkspaceDirectory(value) {
  const workspacePath = String(value ?? "").trim();
  if (!workspacePath) return null;
  if (!path.isAbsolute(workspacePath)) {
    throw new Error("Choose an absolute folder path available to this computer");
  }

  let stats;
  try {
    stats = await fs.stat(workspacePath);
  } catch {
    throw new Error("The selected SPS project folder is not available to this computer");
  }
  if (!stats.isDirectory()) {
    throw new Error("The selected SPS project path must be a folder");
  }

  return path.resolve(workspacePath);
}
