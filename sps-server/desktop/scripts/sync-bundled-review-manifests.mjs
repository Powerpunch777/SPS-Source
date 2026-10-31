import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  calculateStaticCapabilitiesDigest,
  validateStaticPluginManifest,
} from "@sonparkserver/plugin-sdk/registry/static-package-manifest-v1.mjs";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const BUNDLED_REVIEW_MANIFESTS = Object.freeze([
  Object.freeze({ directory: "sps-default-memory", packageName: "sps-default-memory", pluginId: "sps.default-memory" }),
  Object.freeze({ directory: "sps-plugin-discovery", packageName: "sps-plugin-discovery", pluginId: "sps.plugin-discovery" }),
]);

const manifestEntry = "dist/manifest.js";

export function createStaticManifest({ packageJson, runtimeManifest, manifestBytes, expectedPluginId }) {
  const declaration = packageJson?.spsPlugin;
  if (!declaration || declaration.id !== expectedPluginId || declaration.manifest !== `./${manifestEntry}`) {
    throw new Error(`Package must declare ${expectedPluginId} and ${manifestEntry}.`);
  }
  if (runtimeManifest?.id !== declaration.id || runtimeManifest?.version !== packageJson.version) {
    throw new Error("Runtime manifest id/version must match the declarative package metadata.");
  }
  if (runtimeManifest?.apiVersion === undefined || !Array.isArray(runtimeManifest.capabilities)) {
    throw new Error("Runtime manifest must declare apiVersion and capabilities.");
  }
  if (!Buffer.isBuffer(manifestBytes)) throw new Error("Raw runtime manifest bytes are required.");

  const staticManifest = {
    schemaVersion: 1,
    plugin: {
      id: declaration.id,
      version: packageJson.version,
      apiVersion: String(runtimeManifest.apiVersion),
    },
    runtime: {
      manifestEntry,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    },
    capabilities: runtimeManifest.capabilities,
    permissionsDigest: calculateStaticCapabilitiesDigest(runtimeManifest.capabilities),
  };
  const validation = validateStaticPluginManifest(staticManifest);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  return staticManifest;
}

export function assertManifestCurrent(actual, expected, label = "Static plugin manifest") {
  const actualText = typeof actual === "string" ? actual : `${JSON.stringify(actual, null, 2)}\n`;
  const expectedText = `${JSON.stringify(expected, null, 2)}\n`;
  if (actualText !== expectedText) throw new Error(`${label} is stale; run sync-bundled-review-manifests.mjs.`);
}

async function buildExpectedManifest(bundle) {
  const bundleRoot = resolve(desktopRoot, "..", bundle.directory);
  const packageJson = JSON.parse(await readFile(resolve(bundleRoot, "package.json"), "utf8"));
  if (packageJson.name !== bundle.packageName) throw new Error(`Unexpected package name for ${bundle.directory}.`);

  const runtimePath = resolve(bundleRoot, manifestEntry);
  const manifestBytes = await readFile(runtimePath);
  const runtimeModuleUrl = pathToFileURL(runtimePath);
  runtimeModuleUrl.searchParams.set("build-review-manifest", `${Date.now()}-${Math.random()}`);
  const runtimeManifest = (await import(runtimeModuleUrl.href)).default;
  return createStaticManifest({ packageJson, runtimeManifest, manifestBytes, expectedPluginId: bundle.pluginId });
}

export async function syncBundledReviewManifests({ check = false } = {}) {
  for (const bundle of BUNDLED_REVIEW_MANIFESTS) {
    const bundleRoot = resolve(desktopRoot, "..", bundle.directory);
    const outputPath = resolve(bundleRoot, "sps-plugin.json");
    const expected = await buildExpectedManifest(bundle);
    if (check) {
      const current = await readFile(outputPath, "utf8");
      assertManifestCurrent(current, expected, `${bundle.directory}/sps-plugin.json`);
    } else {
      await writeFile(outputPath, `${JSON.stringify(expected, null, 2)}\n`, "utf8");
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const check = process.argv.slice(2).includes("--check");
  if (process.argv.slice(2).some((arg) => arg !== "--check")) {
    throw new Error("Usage: node sync-bundled-review-manifests.mjs [--check]");
  }
  await syncBundledReviewManifests({ check });
  console.log(check ? "Bundled review manifests are current." : "Synchronized bundled review manifests.");
}
