import { lstatSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveSpsE2eUserDataDirectory({
  enabled = process.env.SPS_DESKTOP_E2E === "1",
  configured = process.env.SPS_DESKTOP_E2E_USER_DATA_DIR,
  temporaryDirectory = os.tmpdir(),
} = {}) {
  if (!enabled) return null;

  const requested = String(configured ?? "").trim();
  if (!requested) {
    throw new Error("SPS_DESKTOP_E2E_USER_DATA_DIR is required whenever SPS_DESKTOP_E2E=1.");
  }

  let temporaryRoot;
  let target;
  try {
    temporaryRoot = realpathSync.native(path.resolve(temporaryDirectory));
    target = realpathSync.native(path.resolve(requested));
  } catch (error) {
    throw new Error("SPS Desktop E2E user data must already exist below the operating-system temp folder.", { cause: error });
  }

  const stats = lstatSync(path.resolve(requested));
  const relative = path.relative(temporaryRoot, target);
  if (
    stats.isSymbolicLink()
    || !stats.isDirectory()
    || !relative
    || relative.startsWith("..")
    || path.isAbsolute(relative)
  ) {
    throw new Error("SPS Desktop E2E user data must be a real isolated directory below the operating-system temp folder.");
  }
  return target;
}
