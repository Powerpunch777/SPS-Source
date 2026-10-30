import assert from "node:assert/strict";
import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLifecycleRegistryFixture } from "./plugin-package-lifecycle-acceptance.mjs";
import { createChecklistPackage } from "./no-ai-checklist-package.mjs";

const pluginKey = "local.core-package-lifecycle";
const confirmation = "Apply this exact reviewed plugin version? SPS will import its runtime only after this confirmation. It may install, update, or roll back the current plugin version.";

export function isBundledRestoreReviewLogLine(line, pluginKey) {
  const message = "bundled plugin requires new Host review; skipping automatic import";
  try {
    const event = JSON.parse(line);
    return event.pluginKey === pluginKey && event.msg === message;
  } catch {
    // Core's file transport is pino-pretty singleLine with a JSON metadata
    // suffix, not JSONL. Parse that suffix rather than a loose key substring.
    const prefix = /^\[\d{2}:\d{2}:\d{2}\] INFO: /.exec(line);
    if (!prefix || !line.slice(prefix[0].length).startsWith(`${message} `)) return false;
    try {
      const metadata = JSON.parse(line.slice(prefix[0].length + message.length + 1));
      return metadata.pluginKey === pluginKey;
    } catch { return false; }
  }
}

// This former-Host local canary uses a current official bundle's identity to
// exercise the real automatic-refresh selector, not Memory provider features.
export async function seedBundledTransferReviewCanary({ workspace, fixture, api }) {
  await fixture.assertCurrent();
  const pluginKey = "sps.default-memory";
  assert.equal((await api(workspace, "/api/plugins")).some(row => row.pluginKey === pluginKey), false);
  const directory = path.join(fixture.directory, "former-host-bundled-id-canary");
  await createChecklistPackage(directory, { id: pluginKey, withUi: false });
  const manifestImportProbe = path.join(fixture.directory, "owned-bundled-review-manifest-import.txt");
  const entry = path.join(directory, "dist", "manifest.js");
  await writeFile(entry, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(manifestImportProbe)}, "former-host-import\\n");\n${await readFile(entry, "utf8")}`);
  // Explicit fixture setup through the existing authenticated Host install
  // API; no DB seed, permission patch or target-Host approval bypass.
  const installed = await api(workspace, "/api/plugins/install", {
    method: "POST", body: { packageName: directory, isLocalPath: true },
  });
  assert.equal(installed.pluginKey, pluginKey);
  assert.equal(installed.status, "ready");
  assert.equal((await lstat(manifestImportProbe)).isFile(), true);
  return { pluginId: installed.id, pluginKey, manifestImportProbe, logBoundary: 0 };
}

export async function assertBundledTransferReviewPending({ workspace, fixture, vaultRoot, evidence, api, waitFor, requireNewStartup = false }) {
  await fixture.assertCurrent();
  const file = path.join(vaultRoot, "logs", "server.log");
  const root = await realpath(fixture.directory);
  const canonical = await realpath(file);
  const relative = path.relative(root, canonical);
  assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  const boundary = requireNewStartup ? evidence.logBoundary : 0;
  const bytes = await waitFor(async () => {
    const metadata = await lstat(file);
    assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size <= 8 * 1024 * 1024);
    const content = await readFile(file);
    assert.ok(content.length <= 8 * 1024 * 1024 && content.length >= boundary);
    const rows = new TextDecoder("utf-8", { fatal: true }).decode(content.subarray(boundary)).split(/\r?\n/);
    const skipped = rows.some(line => isBundledRestoreReviewLogLine(line, evidence.pluginKey));
    return skipped ? content : null;
  }, "actual current official bundle's new-Host review barrier", 30_000);
  const record = await api(workspace, `/api/plugins/${evidence.pluginId}`);
  assert.equal(record.id, evidence.pluginId);
  assert.equal(record.pluginKey, evidence.pluginKey);
  assert.equal(record.status, "uninstalled");
  assert.equal(record.packagePath, null);
  await assert.rejects(lstat(evidence.manifestImportProbe), { code: "ENOENT" });
  evidence.logBoundary = bytes.length;
}

async function openRegistry(app, workspace, waitFor) {
  const opened = await workspace.evaluate(() => window.spsDesktopWorkspace.openPluginRegistries());
  assert.equal(opened?.opened, true);
  const page = await waitFor(async () => {
    for (const candidate of app.windows()) if ((await candidate.title()).startsWith("SPS Plugin Sources")) return candidate;
    return null;
  }, "actual Host Registry review window");
  await page.waitForSelector("#source-form");
  return page;
}

async function applyReviewedStage(registry, stageId, waitFor, targetPluginKey = pluginKey) {
  let handled = 0, dialogError;
  const onDialog = async dialog => {
    if (dialog.type() !== "confirm" || dialog.message() !== confirmation) {
      dialogError = new Error("Unexpected Registry confirmation during transfer acceptance.");
      await dialog.dismiss();
      return;
    }
    handled += 1;
    await dialog.accept();
  };
  registry.on("dialog", onDialog);
  try {
    await registry.locator(`.enable-stage[data-stage-id="${stageId}"]`).click();
    await waitFor(async () => {
      if (dialogError) throw dialogError;
      const notice = await registry.locator("#notice").textContent();
      if (await registry.locator("#notice").evaluate(element => element.classList.contains("error"))) {
        throw new Error(`Registry review failed: ${notice}`);
      }
      return notice === `${targetPluginKey} v0.1.0 is ready.`;
    }, "explicit exact-package Registry confirmation and activation");
    assert.equal(handled, 1);
  } finally { registry.off("dialog", onDialog); }
}

export async function approveRestoredCurrentAppBundle({ app, workspace, evidence, api, waitFor }) {
  const registry = await openRegistry(app, workspace, waitFor);
  try {
    const button = registry.locator(`.stage-bundled-review[data-plugin-id="${evidence.pluginKey}"]`);
    await button.waitFor();
    await button.click();
    const stage = await waitFor(async () => (await api(workspace, "/api/plugins/registry/stages"))
      .find(row => row.pluginId === evidence.pluginKey && row.source.registryId === "io.sps.current-app-bundles"),
    "actual current-app bundle static stage");
    assert.equal(stage.status, "staged");
    assert.equal(stage.review, null);
    assert.equal((await api(workspace, `/api/plugins/${evidence.pluginId}`)).status, "uninstalled");
    await assert.rejects(lstat(evidence.manifestImportProbe), { code: "ENOENT" });

    let cancelled = false, dialogError;
    registry.once("dialog", async dialog => {
      if (dialog.type() !== "confirm" || dialog.message() !== confirmation) dialogError = new Error("Unexpected bundle approval dialog.");
      await dialog.dismiss();
      cancelled = true;
    });
    await registry.locator(`.enable-stage[data-stage-id="${stage.stageId}"]`).click();
    await waitFor(() => { if (dialogError) throw dialogError; return cancelled; }, "declined current-app bundle approval");
    assert.equal((await api(workspace, `/api/plugins/${evidence.pluginId}`)).status, "uninstalled");
    await applyReviewedStage(registry, stage.stageId, waitFor, evidence.pluginKey);
    const record = await api(workspace, `/api/plugins/${evidence.pluginId}`);
    assert.equal(record.id, evidence.pluginId);
    assert.equal(record.status, "ready");
    assert.equal(record.manifestJson.id, evidence.pluginKey);
    assert.ok(record.manifestJson.capabilities.includes("memory.providers.register"));
    await assert.rejects(lstat(evidence.manifestImportProbe), { code: "ENOENT" });
    evidence.approved = true;
  } finally { await registry.close(); }
}

const requestData = (api, workspace, pluginId, companyId) => api(workspace, `/api/plugins/${pluginId}/data/checklist`, {
  method: "POST", body: { companyId },
}).then(response => response.data);

export async function seedReviewedTransferPlugin({ app, workspace, company, fixture, api, waitFor }) {
  await fixture.assertCurrent();
  const manifestImportProbe = path.join(fixture.directory, "owned-transfer-manifest-import.txt");
  const signed = await createLifecycleRegistryFixture(fixture.directory, { manifestImportProbe });
  await assert.rejects(lstat(manifestImportProbe), { code: "ENOENT" }, "Packing must not import fixture JavaScript");
  const registry = await openRegistry(app, workspace, waitFor);
  try {
    const details = registry.locator("#source-form").locator("..");
    await details.evaluate(element => { const details = element.closest("details"); if (details) details.open = true; });
    await registry.locator("#source-id").fill("local.core-lifecycle-fixture");
    await registry.locator("#source-name").fill("Transfer package fixture");
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async (...args) => {
        if (args.at(-1)?.title !== "Choose a local SPS Registry folder") throw new Error("Unexpected Registry folder dialog.");
        return { canceled: false, filePaths: [directory] };
      };
    }, signed.directory);
    await registry.locator("#choose-local-folder").click();
    await waitFor(async () => (await registry.locator("#local-path").inputValue()) === signed.directory,
      "Main-authorized Registry folder selection");
    await registry.locator("#source-form").evaluate(form => form.requestSubmit());
    const release = registry.locator(`.stage-release[data-plugin-id="${pluginKey}"][data-version="0.1.0"]`);
    await release.waitFor();
    await release.click();
    const stage = await waitFor(async () => (await api(workspace, "/api/plugins/registry/stages"))
      .find(row => row.pluginId === pluginKey && row.version === "0.1.0"), "source Registry static stage");
    assert.equal(stage.status, "staged");
    await assert.rejects(lstat(manifestImportProbe), { code: "ENOENT" }, "Staging must not import fixture JavaScript");
    await applyReviewedStage(registry, stage.stageId, waitFor);
  } finally { await registry.close(); }
  const plugin = (await api(workspace, "/api/plugins")).find(row => row.pluginKey === pluginKey);
  assert.equal(plugin?.status, "ready");
  assert.equal((await lstat(manifestImportProbe)).isFile(), true);
  const secondCompany = await api(workspace, "/api/companies", { method: "POST", body: { name: "Transfer plugin Workspace B" } });
  assert.ok(secondCompany.id && secondCompany.id !== company.id);
  const scopes = [company.id, secondCompany.id];
  for (const [index, companyId] of scopes.entries()) {
    await api(workspace, `/api/plugins/${plugin.id}/companies/${companyId}/activation`, { method: "PUT", body: { enabled: true } });
    await api(workspace, `/api/plugins/${plugin.id}/actions/checklist.add`, {
      method: "POST", body: { companyId, params: { text: `Retain distinct transfer Workspace ${index + 1}` } },
    });
  }
  const expected = [];
  for (const companyId of scopes) expected.push(await waitFor(async () => {
    const state = await requestData(api, workspace, plugin.id, companyId);
    return state.items?.length === 1 && state.eventCount === 1 ? state : null;
  }, "source durable scoped plugin state"));
  assert.notDeepEqual(expected[0].items, expected[1].items);
  return { pluginId: plugin.id, pluginKey, originalPackagePath: plugin.packagePath, scopes, expected, manifestImportProbe };
}

export async function resetTransferPluginImportProbe({ fixture, evidence }) {
  await fixture.assertCurrent();
  assert.equal(path.dirname(evidence.manifestImportProbe), await realpath(fixture.directory));
  const stat = await lstat(evidence.manifestImportProbe);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  await unlink(evidence.manifestImportProbe);
}

export async function reviewRestoredTransferPlugin({ app, workspace, fixture, vaultRoot, evidence, api, waitFor }) {
  await fixture.assertCurrent();
  const record = await api(workspace, `/api/plugins/${evidence.pluginId}`);
  assert.equal(record.status, "uninstalled", "Restored code must not inherit prior Host execution approval");
  assert.equal(record.packagePath, null);
  await assert.rejects(lstat(evidence.manifestImportProbe), { code: "ENOENT" }, "Restore/startup imported code before new-Host review");
  const stages = await api(workspace, "/api/plugins/registry/stages");
  const stage = stages.find(row => row.pluginId === pluginKey && row.version === "0.1.0");
  assert.equal(stage?.status, "staged");
  assert.equal(stage.review, null);
  assert.equal(Object.hasOwn(stage, "packageRoot"), false, "Public Registry responses must not expose a Host path");
  const ownedVault = await realpath(vaultRoot);
  const vaultRelative = path.relative(await realpath(fixture.directory), ownedVault);
  assert.ok(vaultRelative && vaultRelative !== ".." && !vaultRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(vaultRelative));
  const indexPath = path.join(ownedVault, "registry-staging", "registry-stages.json");
  const indexStat = await lstat(indexPath);
  assert.ok(indexStat.isFile() && !indexStat.isSymbolicLink() && indexStat.size <= 1024 * 1024);
  const savedStages = JSON.parse(await readFile(indexPath, "utf8"));
  const savedStage = savedStages.find(row => row.stageId === stage.stageId);
  assert.equal(savedStage?.status, "staged");
  const packageRoot = await realpath(savedStage.packageRoot);
  const managedRoot = await realpath(path.join(vaultRoot, "registry-staging", "packages"));
  const relative = path.relative(managedRoot, packageRoot);
  assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  assert.notEqual(packageRoot, await realpath(evidence.originalPackagePath));
  for (const file of ["package.json", "sps-plugin.json", "dist/manifest.js", "dist/worker.js"]) {
    assert.deepEqual(await readFile(path.join(packageRoot, file)), await readFile(path.join(evidence.originalPackagePath, file)));
  }
  const registry = await openRegistry(app, workspace, waitFor);
  try { await applyReviewedStage(registry, stage.stageId, waitFor); }
  finally { await registry.close(); }
  assert.equal((await lstat(evidence.manifestImportProbe)).isFile(), true, "Fixture code did not execute after explicit approval");
  const restored = await api(workspace, `/api/plugins/${evidence.pluginId}`);
  assert.equal(restored.status, "ready");
  assert.equal(await realpath(restored.packagePath), packageRoot);
  evidence.restoredPackagePath = packageRoot;
  await assertRestoredTransferPluginData({ workspace, evidence, api, waitFor });
}

export async function assertRestoredTransferPluginData({ workspace, evidence, api, waitFor }) {
  const record = await api(workspace, `/api/plugins/${evidence.pluginId}`);
  assert.equal(record.id, evidence.pluginId);
  assert.equal(record.status, "ready");
  assert.equal(await realpath(record.packagePath), evidence.restoredPackagePath);
  for (const [index, companyId] of evidence.scopes.entries()) {
    const data = await waitFor(async () => {
      const current = await requestData(api, workspace, evidence.pluginId, companyId);
      return current.items?.length === 1 ? current : null;
    }, "restored durable Workspace plugin data");
    assert.deepEqual(data, evidence.expected[index]);
  }
}
