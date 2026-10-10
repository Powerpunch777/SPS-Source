import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPluginTemplate } from "@sonparkserver/plugin-sdk/authoring/plugin-package-v1.mjs";
import {
  createDeveloperCandidateFromGateReports,
  stageDeveloperCandidate,
} from "../src/developer-build-pipeline.mjs";
import {
  createDeveloperCommandEnvironment,
  runSpsDeveloperCommand,
} from "../src/developer-command-runner.mjs";
import {
  cleanupPluginPreview,
  createPluginPreviewRuntime,
} from "../src/plugin-preview-runtime.mjs";
import { stageSpsPluginArchive } from "../src/registry-staging.mjs";
import { resolveSpsOwnerHostRuntime } from "../src/owner-host.mjs";
import {
  SPS_DESKTOP_ACCESS_HEADER,
  SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER,
  spsDesktopAccessEnvironment,
} from "../src/desktop-local-access.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const runtimeRoot = path.resolve(
  process.env.SPS_OWNER_HOST_RUNTIME_ROOT || path.join(desktopRoot, ".owner-host-runtime"),
);
const runtimeManifest = JSON.parse(
  await fs.readFile(path.join(runtimeRoot, "sps-owner-host-runtime.json"), "utf8"),
);
if (runtimeManifest.format < 8 || !runtimeManifest.pluginDeveloperKit?.cli) {
  throw new Error("The packaged SPS runtime does not include the Plugin Developer Kit.");
}

const temporaryRoot = path.join(os.tmpdir(), `sps-plugin-preview-smoke-${process.pid}-${Date.now()}`);
const ownerVault = path.join(temporaryRoot, "owner-vault");
const sourceDirectory = path.join(temporaryRoot, "external-plugin");
const productionMarker = path.join(ownerVault, "production-workspace", "marker.txt");
const projectId = `dev-${randomUUID()}`;
const buildId = `build-${randomUUID()}`;
const executionRuntimeRoot = process.platform === "win32"
  ? path.join(os.tmpdir(), `sps-plugin-preview-runtime-${process.pid}-${Date.now()}`)
  : runtimeRoot;
let preview = null;
let passed = false;

async function removeWithRetry(target, attempts = 30) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

async function previewRequest(pathname, { method = "GET", body, authenticated = true } = {}) {
  const headers = { accept: "application/json", origin: preview.url };
  if (authenticated) {
    headers[SPS_DESKTOP_ACCESS_HEADER] = preview.accessToken;
    headers[SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER] = preview.accessToken;
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  return await fetch(new URL(pathname, preview.url), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

async function previewJson(pathname, { method = "GET", body } = {}) {
  const response = await previewRequest(pathname, { method, body });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Preview request failed with ${response.status}.`);
  }
  return payload;
}

try {
  await fs.mkdir(path.dirname(productionMarker), { recursive: true });
  await fs.writeFile(productionMarker, "production-must-remain-untouched\n", "utf8");
  if (executionRuntimeRoot !== runtimeRoot) {
    await fs.symlink(runtimeRoot, executionRuntimeRoot, "junction");
  }

  const runtimeNode = path.join(
    executionRuntimeRoot,
    "bin",
    process.platform === "win32" ? "node.exe" : "node",
  );
  const sdkCliPath = path.join(executionRuntimeRoot, runtimeManifest.pluginDeveloperKit.cli);
  const packagedSdkRoot = path.dirname(path.dirname(sdkCliPath));
  await Promise.all([fs.access(runtimeNode), fs.access(sdkCliPath)]);

  await createPluginTemplate({
    directory: sourceDirectory,
    pluginId: "local.preview-smoke",
    packageName: "@sps/preview-smoke",
    displayName: "SPS Preview Smoke",
    version: "0.1.0",
  });
  const sdkLink = path.join(sourceDirectory, "node_modules", "@sonparkserver", "plugin-sdk");
  await fs.mkdir(path.dirname(sdkLink), { recursive: true });
  await fs.symlink(packagedSdkRoot, sdkLink, process.platform === "win32" ? "junction" : "dir");

  const reports = [];
  for (const command of ["build", "validate", "test"]) {
    reports.push(await runSpsDeveloperCommand({
      command,
      sourceDirectory,
      nodeCommand: runtimeNode,
      sdkCliPath,
    }));
  }
  assert.deepEqual(reports.map((report) => report.success), [true, true, true]);
  const candidate = createDeveloperCandidateFromGateReports(reports);

  preview = await createPluginPreviewRuntime({
    ownerVault,
    buildId,
    fetchImpl: fetch,
    spawn,
    baseEnvironment: createDeveloperCommandEnvironment(process.env),
    resolveRuntime: async (runtimePreview) => await resolveSpsOwnerHostRuntime({
      packagedRuntimeRoots: [executionRuntimeRoot],
      coreRoots: [],
      packagedNodeCommand: runtimeNode,
      configPath: runtimePreview.configPath,
      instanceId: `sps-preview-${runtimePreview.buildId.slice(6)}`,
      environment: {
        PAPERCLIP_HOME: runtimePreview.previewVault,
        PAPERCLIP_DB_BACKUP_DIR: runtimePreview.config.database.backup.dir,
        PAPERCLIP_STORAGE_LOCAL_DIR: runtimePreview.config.storage.localDisk.baseDir,
        PAPERCLIP_SECRETS_MASTER_KEY_FILE: runtimePreview.config.secrets.localEncrypted.keyFilePath,
        PAPERCLIP_PROJECTS_ROOT: path.join(runtimePreview.previewVault, "projects"),
        PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
        PAPERCLIP_HOST_VERSION: runtimeManifest.version,
        PAPERCLIP_TELEMETRY_DISABLED: "1",
        SPS_BASIC_MODE: "true",
        SPS_CORE_BASELINE_MODE: "true",
        SPS_WORKPLANE_MODE: "false",
        SPS_BUNDLED_PLUGIN_PATHS: "",
        SPS_BUNDLED_PLUGIN_REFRESH_PATHS: "",
        PAPERCLIP_BUNDLED_PLUGIN_PATHS: "",
        PAPERCLIP_AGENT_RUNTIME_PACKS_DIR: path.join(runtimePreview.previewVault, "agent-runtime-packs"),
        SPS_DESKTOP_PLUGIN_RUNTIME: "preview",
        ...spsDesktopAccessEnvironment(runtimePreview.accessToken),
      },
    }),
  });

  const started = await preview.manager.start();
  assert.equal(started.state, "running", started.lastError);
  assert.equal(started.owned, true);
  assert.equal(preview.buildId, buildId);
  assert.ok(preview.previewVault.startsWith(path.join(ownerVault, "developer-mode", "previews")));

  const anonymousApi = await previewRequest("/api/plugins", { authenticated: false });
  const anonymousPayload = await anonymousApi.json().catch(() => null);
  assert.equal(anonymousApi.status, 403);
  assert.equal(anonymousPayload?.code, "desktop_access_required");

  const anonymousUi = await previewRequest("/", { authenticated: false });
  assert.equal(anonymousUi.status, 403);
  const previewUi = await previewRequest("/");
  const previewHtml = await previewUi.text();
  assert.equal(previewUi.ok, true);
  assert.match(previewUi.headers.get("content-type") ?? "", /text\/html/);
  assert.match(previewHtml, /<title>SPS<\/title>/);

  const company = await previewJson("/api/companies", {
    method: "POST",
    body: {
      name: "SPS Isolated Preview",
      description: "Disposable plugin preview smoke Workspace.",
    },
  });
  assert.ok(company?.id);

  const staged = await stageDeveloperCandidate({
    vaultRoot: ownerVault,
    projectId,
    sourceDirectory,
    candidate,
    stageArchive: async ({ archivePath, source }) => await stageSpsPluginArchive({
      vaultRoot: preview.previewVault,
      archivePath,
      source,
      registerStage: async (body) => await previewJson("/api/plugins/registry/stages", {
        method: "POST",
        body,
      }),
    }),
  });
  assert.equal(staged.staged, true);
  assert.ok(staged.stage?.stageId);

  const enabled = await previewJson(
    `/api/plugins/registry/stages/${encodeURIComponent(staged.stage.stageId)}/enable`,
    { method: "POST", body: {} },
  );
  assert.equal(enabled.plugin?.manifestJson?.id, "local.preview-smoke");
  assert.equal(enabled.plugin?.status, "ready");

  const previewPlugins = await previewJson("/api/plugins");
  assert.ok(
    previewPlugins.some((plugin) => (
      plugin?.manifestJson?.id === "local.preview-smoke"
      && plugin?.status === "ready"
    )),
  );
  assert.equal(await fs.readFile(productionMarker, "utf8"), "production-must-remain-untouched\n");
  await assert.rejects(fs.access(path.join(ownerVault, "config.json")));

  console.log(
    `Isolated SPS plugin Preview smoke passed for ${buildId}; production Workspace sentinel remained untouched.`,
  );
  passed = true;
} finally {
  if (preview?.manager) await preview.manager.stop({ force: true }).catch(() => {});
  const keepFailed = !passed && process.env.SPS_PLUGIN_PREVIEW_SMOKE_KEEP === "1";
  if (preview && !keepFailed) {
    await cleanupPluginPreview({ ownerVault, buildId }).catch(() => {});
  }
  if (!keepFailed) await removeWithRetry(temporaryRoot).catch(() => {});
  else console.warn(`Preserved failed Preview smoke data at ${temporaryRoot}`);
  if (executionRuntimeRoot !== runtimeRoot) {
    await removeWithRetry(executionRuntimeRoot).catch(() => {});
  }
}
