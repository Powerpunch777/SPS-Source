import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPluginWorker } from "@sonparkserver/plugin-sdk/authoring/worker-bundle-v1.mjs";
import { defineSpsPluginManifest } from "@sonparkserver/plugin-sdk/manifest";

export const RUNNER_RECOVERY_PLUGIN_KEY = "local.runner-recovery-reference";
export const RUNNER_RECOVERY_CAPABILITIES = Object.freeze([
  "sps.runtimes.read", "sps.executionGrants.read", "sps.executionGrants.write",
  "sps.runs.dispatch", "sps.runs.read", "sps.runs.cancel",
]);

// Disposable consumer of the public SDK, not a bundled product workflow.
export async function createRunnerRecoveryReferencePackage(directory) {
  if (!path.isAbsolute(directory)) throw new TypeError("Runner reference output must be an absolute path.");
  const manifest = defineSpsPluginManifest({
    id: RUNNER_RECOVERY_PLUGIN_KEY, apiVersion: 1, version: "0.1.0",
    displayName: "Runner recovery acceptance reference", author: "SPS",
    description: "Disposable technical Runner acceptance fixture. No AI or UI.", categories: ["automation"],
    capabilities: [...RUNNER_RECOVERY_CAPABILITIES], companyActivation: { defaultEnabled: false },
    entrypoints: { worker: "./dist/worker.js" },
    sps: { contractVersion: "2.0", primitives: ["runtimes.list", "runtimes.dispatch", "runs.observe", "runs.cancel"] },
  });
  await mkdir(path.join(directory, "src"), { recursive: true });
  await mkdir(path.join(directory, "dist"));
  const sdk = path.resolve(import.meta.dirname, "../node_modules/@sonparkserver/plugin-sdk");
  const link = path.join(directory, "node_modules", "@sonparkserver", "plugin-sdk");
  await mkdir(path.dirname(link), { recursive: true });
  await symlink(sdk, link, process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(directory, "src", "worker.mjs"), [
    'import { defineSpsPlugin, runSpsWorker } from "@sonparkserver/plugin-sdk/worker";',
    'import { defineSpsPlatformContract } from "@sonparkserver/plugin-sdk/platform";',
    'import { createSpsRuntimeClient } from "@sonparkserver/plugin-sdk/runtime";',
    "let runtime;",
    "const platform = defineSpsPlatformContract({",
    "  capabilities: [],",
    "  data: [",
    "    { key: 'runner-list', handler: p => runtime.runtimes.list(p.companyId) },",
    "    { key: 'grant-list', handler: p => runtime.executionGrants.list(p.companyId) },",
    "    { key: 'run-get', handler: p => runtime.runs.get(p.companyId, p.runId) },",
    "    { key: 'run-events', handler: p => runtime.runs.listEvents(p.companyId, p.runId) }],",
    "  actions: [",
    "    { key: 'grant-upsert', handler: p => runtime.executionGrants.upsert(p) },",
    "    { key: 'grant-revoke', handler: p => runtime.executionGrants.revoke(p.companyId, p.grantId) },",
    "    { key: 'run-dispatch', handler: p => runtime.runs.dispatch(p) },",
    "    { key: 'run-cancel', handler: p => runtime.runs.cancel(p.companyId, p.runId) }]",
    "});",
    "runSpsWorker(defineSpsPlugin({ initialize(c) { runtime = createSpsRuntimeClient(c.spsTransport); }, platform }));",
  ].join("\n"), { flag: "wx" });
  await writeFile(path.join(directory, "dist", "manifest.js"), `export default ${JSON.stringify(manifest)};\n`, { flag: "wx" });
  await writeFile(path.join(directory, "package.json"), `${JSON.stringify({
    name: "@sps-test/runner-recovery-reference", version: "0.1.0", private: true, type: "module", files: ["dist"],
    spsPlugin: { manifest: "./dist/manifest.js", worker: "./dist/worker.js" },
  })}\n`, { flag: "wx" });
  await buildPluginWorker({ sourceDirectory: directory });
  return { directory, manifest };
}
