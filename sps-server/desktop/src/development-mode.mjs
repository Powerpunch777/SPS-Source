import { lstatSync, mkdirSync, realpathSync, statSync, watch } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// The Node launcher knows its executable. Electron's process.execPath instead
// points at Electron, so do not infer the development Host binary from it.
export function resolveDesktopDevelopmentNodeCommand({ packaged, command } = {}) {
  if (packaged || command === undefined) return undefined;
  if (typeof command !== "string" || command.length === 0 || command.length > 32_768
    || /[\u0000-\u001f\u007f]/.test(command) || !path.isAbsolute(command)
    || path.resolve(command) !== command) {
    throw new Error("The development Node launcher must provide an absolute executable file path.");
  }
  try {
    const actual = realpathSync(command);
    if (!statSync(actual).isFile()) throw new Error("Not a file.");
    return actual;
  } catch {
    throw new Error("The development Node launcher executable is unavailable.");
  }
}

export function resolveDesktopDevelopment({ packaged, enabled, desktopRoot, vaultBase, e2e = false }) {
  if (!enabled) return null;
  if (packaged || e2e) throw new Error("Desktop development mode requires an unpackaged, non-E2E app.");
  const root = realpathSync(desktopRoot);
  const profile = path.join(root, ".dev-profile");
  mkdirSync(profile, { recursive: true });
  if (lstatSync(profile).isSymbolicLink() || realpathSync(profile) !== profile) {
    throw new Error("Desktop development profile must not redirect to another directory.");
  }
  const workspaceId = createHash("sha256").update(root).digest("hex").slice(0, 16);
  const vaultRoot = vaultBase ? path.join(vaultBase, "SPS-Development", workspaceId, "owner-vault") : null;
  return { profile, vaultRoot, uiMiddleware: "true" };
}

export function watchDevelopmentSurfaces({ desktopRoot, windows, log = console.log }) {
  const watchers = [];
  let timer;
  const directories = [
    path.join(desktopRoot, "renderer"),
    ...["sps-room-chat", "sps-plugin-discovery", "sps-memory"].map(name => path.resolve(desktopRoot, "..", name, "dist")),
  ];
  for (const directory of directories) {
    watchers.push(watch(directory, { recursive: true }, (_event, filename) => {
      if (!/\.(?:css|html|js|map)$/.test(String(filename))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const window of windows()) {
          if (!window.isDestroyed()) window.webContents.reloadIgnoringCache();
        }
        log("[SPS dev] Refreshed renderer/plugin surfaces.");
      }, 450);
    }));
  }
  return () => { clearTimeout(timer); watchers.forEach(watcher => watcher.close()); };
}
