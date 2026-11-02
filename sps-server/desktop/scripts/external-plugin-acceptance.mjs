import { lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Explicit, trusted development-operator code, never an app/Plugin runtime API.
export async function loadExternalPluginAcceptance({ enabled, modulePath, sourceOnly }) {
  if (!enabled && !modulePath) return null;
  if (!enabled || !sourceOnly || typeof modulePath !== "string" || !path.isAbsolute(modulePath)
    || path.extname(modulePath) !== ".mjs") {
    throw new Error("External Plugin acceptance requires explicit source-only mode and an absolute .mjs operator module.");
  }
  const stat = await lstat(modulePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 128 * 1024) {
    throw new Error("External Plugin acceptance must be a bounded regular operator file.");
  }
  const loaded = await import(pathToFileURL(modulePath).href);
  if (typeof loaded.runAcceptance !== "function") throw new Error("External Plugin operator must export runAcceptance.");
  return loaded.runAcceptance;
}

export async function waitForPluginAcceptanceSelector(cdp, selector, deadline) {
  if (typeof selector !== "string" || !selector || !Number.isFinite(deadline)) {
    throw new Error("External Plugin readiness requires a selector and the original document deadline.");
  }
  while (Date.now() < deadline) {
    if (await cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`) === true) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Restarted external Plugin UI did not become ready.");
}
