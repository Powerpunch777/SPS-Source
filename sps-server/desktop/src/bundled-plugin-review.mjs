import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { inspectPluginDirectory, packagePluginDirectory } from "@sonparkserver/plugin-sdk/authoring/plugin-package-v1.mjs";
import { stageSpsPluginArchive } from "./registry-staging.mjs";

function restoredRecord(records, pluginId) {
  return records.find(record => record.pluginKey === pluginId
    && record.status === "uninstalled" && record.packagePath === null);
}

async function inspectBundle(bundle) {
  const root = await fs.lstat(bundle.directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Current app bundle is not a plain directory.");
  const inspection = await inspectPluginDirectory(bundle.directory);
  if (!inspection.valid || !inspection.source) throw new Error("Current app bundle failed static package verification.");
  const metadata = inspection.source.staticManifest;
  const pkg = JSON.parse(await fs.readFile(path.join(bundle.directory, "package.json"), "utf8"));
  if (metadata.plugin.id !== bundle.pluginId || pkg.spsPlugin?.id !== bundle.pluginId) {
    throw new Error("Current app bundle identity does not match its configured identity.");
  }
  return {
    pluginId: bundle.pluginId, version: metadata.plugin.version,
    packageName: inspection.source.package.name,
    capabilities: [...metadata.capabilities],
    manifestSha256: metadata.runtime.manifestSha256,
  };
}

/** Reads only current-app package files. It never imports executable manifests. */
export async function listRestoredBundledPluginReviews({ bundles, records }) {
  const reviews = [];
  for (const bundle of bundles) {
    if (restoredRecord(records, bundle.pluginId)) reviews.push(await inspectBundle(bundle));
  }
  return reviews;
}

/** Explicit staging, not approval. Existing Registry confirmation starts code. */
export async function stageRestoredBundledPluginReview({ bundles, records, pluginId, vaultRoot, registerStage, assertCurrent }) {
  const bundle = bundles.find(candidate => candidate.pluginId === pluginId);
  if (!bundle || !restoredRecord(records, pluginId)) throw new Error("This current app bundle is not waiting for new Host review.");
  assertCurrent();
  await inspectBundle(bundle);
  assertCurrent();
  const archives = path.join(vaultRoot, "registry-staging", "bundle-review-archives");
  await fs.mkdir(archives, { recursive: true, mode: 0o700 });
  const owned = path.join(archives, randomUUID());
  await fs.mkdir(owned, { mode: 0o700 });
  const archive = path.join(owned, "bundle.spsplugin");
  try {
    await packagePluginDirectory({ sourceDirectory: bundle.directory, archivePath: archive });
    assertCurrent();
    const result = await stageSpsPluginArchive({
      vaultRoot, archivePath: archive,
      // Local app provenance is not a publisher signature or old-Host approval.
      source: { kind: "local", registryId: "io.sps.current-app-bundles", releaseLocator: `bundled:${pluginId}` },
      registerStage: async body => { assertCurrent(); return registerStage(body); },
    });
    assertCurrent();
    if (!result.staged) throw new Error("Current app bundle could not be staged for Host review.");
    return result;
  } finally {
    await fs.rm(archive, { force: true });
    await fs.rmdir(owned);
  }
}
