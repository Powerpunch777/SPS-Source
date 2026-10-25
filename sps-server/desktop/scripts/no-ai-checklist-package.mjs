import { copyFile, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPluginWorker } from "@sonparkserver/plugin-sdk/authoring/worker-bundle-v1.mjs";
import { defineSpsPluginManifest } from "@sonparkserver/plugin-sdk/manifest";
import { defineSpsUiContributions } from "@sonparkserver/plugin-sdk/ui";

const fixtureRoot = new URL("../test/fixtures/no-ai-checklist/", import.meta.url);
const sdkRoot = path.resolve(import.meta.dirname, "../node_modules/@sonparkserver/plugin-sdk");
export const CHECKLIST_PLUGIN_KEY = "local.no-ai-checklist";
export const CHECKLIST_PACKAGE_CAPABILITIES = Object.freeze([
  "plugin.state.read", "plugin.state.write", "events.emit", "events.subscribe", "jobs.schedule",
]);

export function checklistManifest({ id = CHECKLIST_PLUGIN_KEY, withUi = true, omitCapability, runtimeDiscovery = false } = {}) {
  const ui = withUi ? defineSpsUiContributions({ entrypoint: "./dist/ui", contributions: [
    { surface: "page", id: "checklist", label: "Checklist", routePath: id === CHECKLIST_PLUGIN_KEY ? "no-ai-checklist" : id.replaceAll(".", "-"), exportName: "ChecklistPage" },
  ] }) : {};
  return defineSpsPluginManifest({
    id, apiVersion: 1, version: "0.1.0", displayName: "No-AI checklist reference",
    description: "Temporary No-AI Workspace acceptance fixture.", author: "SPS", categories: ["automation"],
    ...ui,
    capabilities: [...CHECKLIST_PACKAGE_CAPABILITIES, ...(ui.capabilities ?? []), ...(runtimeDiscovery ? ["sps.runtimes.read"] : [])].filter(value => value !== omitCapability),
    entrypoints: { worker: "./dist/worker.js", ...(ui.entrypoints ?? {}) },
    companyActivation: { defaultEnabled: false },
    sps: { contractVersion: "2.0", primitives: runtimeDiscovery ? ["runtimes.list"] : [] },
    jobs: [{ jobKey: "checklist-audit", displayName: "Checklist audit", scope: "workspace" }],
  });
}

// Creates disposable authoring output only; no installation or registry mutation.
export async function createChecklistPackage(directory, options = {}) {
  const manifest = checklistManifest(options);
  await mkdir(path.join(directory, "src"), { recursive: true });
  await mkdir(path.join(directory, "dist"), { recursive: true });
  const sdkLink = path.join(directory, "node_modules", "@sonparkserver", "plugin-sdk");
  await mkdir(path.dirname(sdkLink), { recursive: true });
  await symlink(sdkRoot, sdkLink, process.platform === "win32" ? "junction" : "dir");
  await copyFile(new URL("worker.mjs", fixtureRoot), path.join(directory, "src", "checklist.mjs"));
  await writeFile(path.join(directory, "src", "worker.mjs"), [
    'import { defineSpsPlugin, runSpsWorker } from "@sonparkserver/plugin-sdk/worker";',
    'import { defineSpsPlatformContract } from "@sonparkserver/plugin-sdk/platform";',
    ...(options.runtimeDiscovery ? ['import { createSpsRuntimeClient } from "@sonparkserver/plugin-sdk/runtime";'] : []),
    'import { createChecklistPlugin } from "./checklist.mjs";',
    "const plugin = createChecklistPlugin();",
    ...(options.runtimeDiscovery ? [
      "let runtime;",
      "const original = plugin.handlers.platform;",
      "const platform = defineSpsPlatformContract({ ...original, data: [...original.data, { key: 'runtime-connections', handler: params => runtime.runtimes.list(params.companyId) }] });",
      "runSpsWorker(defineSpsPlugin({ ...plugin.handlers, initialize(context) { runtime = createSpsRuntimeClient(context.spsTransport); }, platform }));",
    ] : options.probeScope ? [
      "const original = plugin.handlers.platform;",
      "const platform = defineSpsPlatformContract({ ...original, data: [...original.data, { key: 'scope-probe',",
      "  handler: (params, context) => context.state.get({ scopeKind: 'company', scopeId: params.targetCompanyId, namespace: 'no-ai-checklist', stateKey: 'items' }) }],",
      ...(options.probeJobCompanyId ? [
        `  jobs: [{ jobKey: 'checklist-audit', handler: (_job, context) => context.state.get({ scopeKind: 'company', scopeId: ${JSON.stringify(options.probeJobCompanyId)}, namespace: 'no-ai-checklist', stateKey: 'items' }) }],`,
      ] : []),
      "});",
      "runSpsWorker(defineSpsPlugin({ ...plugin.handlers, platform }));",
    ] : ["runSpsWorker(plugin);"]),
  ].join("\n"));
  await writeFile(path.join(directory, "package.json"), `${JSON.stringify({
    name: `@sps-test/${manifest.id.replaceAll(".", "-")}`, version: manifest.version, private: true, type: "module",
    files: ["dist"], spsPlugin: { manifest: "./dist/manifest.js", worker: "./dist/worker.js" },
  }, null, 2)}\n`);
  await writeFile(path.join(directory, "dist", "manifest.js"), `export default ${JSON.stringify(manifest, null, 2)};\n`);
  if (options.withUi !== false) {
    await mkdir(path.join(directory, "dist", "ui"));
    await copyFile(new URL("ui.mjs", fixtureRoot), path.join(directory, "dist", "ui", "index.js"));
  }
  await buildPluginWorker({ sourceDirectory: directory });
  return { directory, manifest };
}
