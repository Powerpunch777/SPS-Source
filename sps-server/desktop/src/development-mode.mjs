import { lstatSync, mkdirSync, realpathSync, watch } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

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
