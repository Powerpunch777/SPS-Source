import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { checklistManifest, createChecklistPackage } from "../scripts/no-ai-checklist-package.mjs";

test("No-AI reference declares only optional UI, scoped state, events and Jobs", () => {
  const manifest = checklistManifest();
  assert.deepEqual(manifest.capabilities, ["plugin.state.read", "plugin.state.write", "events.emit", "events.subscribe", "jobs.schedule", "ui.page.register"]);
  assert.equal(manifest.companyActivation.defaultEnabled, false);
  assert.equal(manifest.jobs[0].scope, "workspace");
  assert.equal(manifest.jobs[0].schedule, undefined);
  assert.equal(manifest.ui.slots[0].routePath, "no-ai-checklist");
  assert.equal(manifest.tools, undefined);
  assert.equal(manifest.agentPlatform, undefined);
});

test("UI-less variant has no UI entrypoint or UI capabilities", () => {
  const manifest = checklistManifest({ withUi: false });
  assert.equal(manifest.ui, undefined);
  assert.equal(manifest.entrypoints.ui, undefined);
  assert.ok(!manifest.capabilities.some(value => value.startsWith("ui.")));
});

test("checklist bridge diagnostic exposes fixed codes without raw error details", async () => {
  const source = (await readFile(new URL("./fixtures/no-ai-checklist/ui.mjs", import.meta.url), "utf8"))
    .replace(/^import .*$/gm, "").replace("export function ChecklistPage", "function ChecklistPage");
  for (const code of ["WORKER_UNAVAILABLE", "TIMEOUT", "private-path-or-credential"]) {
    const sandbox = {
      h: (tag, props, ...children) => ({ tag, props, children }),
      useEffect() {},
      useState: initial => [initial, () => {}],
      useHostContext: () => ({ companyId: "fixture-workspace" }),
      usePluginAction: () => async () => {},
      usePluginData: () => ({ loading: false, data: null, error: { code, message: "private diagnostic message" } }),
    };
    const page = runInNewContext(`${source}\nChecklistPage()`, sandbox);
    const alert = page.children.find(child => child?.props?.role === "alert");
    assert.ok(alert);
    assert.equal(alert.props["data-checklist-bridge-error"], code === "private-path-or-credential" ? "OTHER" : code);
    assert.equal(alert.children[0], "The checklist could not be loaded. Try refreshing.");
    assert.doesNotMatch(JSON.stringify(page), /private diagnostic message|private-path-or-credential/);
  }
});

test("runtime inspection opts into existing read-only discovery without execution authority", () => {
  const manifest = checklistManifest({ withUi: false, runtimeDiscovery: true });
  assert.ok(manifest.capabilities.includes("sps.runtimes.read"));
  assert.deepEqual(manifest.sps.primitives, ["runtimes.list"]);
  assert.ok(!manifest.capabilities.some(value => /dispatch|executionGrants|secrets|agent\.sessions/.test(value)));
});

test("negative variants remove the actual Host capability without bypassing the Worker", () => {
  assert.ok(!checklistManifest({ omitCapability: "plugin.state.write" }).capabilities.includes("plugin.state.write"));
  assert.ok(checklistManifest({ omitCapability: "plugin.state.write" }).capabilities.includes("plugin.state.read"));
});

test("Host support negative fixture can initialize without receiving Runtime permission", () => {
  const manifest = checklistManifest({ withUi: false, runtimeDiscovery: true, omitCapability: "sps.runtimes.read" });
  assert.ok(!manifest.capabilities.includes("sps.runtimes.read"));
  assert.deepEqual(manifest.sps.primitives, []);
});

test("Agent descriptor inspection is an explicit read-only opt-in and can deny agents.read", () => {
  const granted = checklistManifest({ withUi: false, runtimeDiscovery: true, agentDiscovery: true });
  const denied = checklistManifest({ withUi: false, runtimeDiscovery: true, agentDiscovery: true, omitCapability: "agents.read" });
  assert.ok(granted.capabilities.includes("agents.read"));
  assert.ok(!denied.capabilities.includes("agents.read"));
  assert.ok(!granted.capabilities.some(value => /agent.sessions|agents.invoke/.test(value)));
});

test("model fixture is an explicit opt-in, separate from the No-AI reference", async () => {
  const base = checklistManifest({ withUi: false });
  assert.ok(!base.capabilities.some(value => value.startsWith("sps.models.")));
  const granted = checklistManifest({ withUi: false, modelRequests: true });
  for (const capability of ["sps.models.read", "sps.models.submit", "sps.models.cancel", "sps.executions.read"]) {
    assert.ok(granted.capabilities.includes(capability));
  }
  assert.ok(!granted.capabilities.some(value => /secrets|agents.invoke|agent.sessions|executionGrants/.test(value)));
  const acceptance = await readFile(new URL("../scripts/model-request-acceptance.mjs", import.meta.url), "utf8");
  for (const proof of ["127.0.0.1", "model-connections", "model-submit", "model-run", "model-cancel", "model-history", "withheld", "configured"]) {
    assert.ok(acceptance.includes(proof), `Missing model acceptance boundary: ${proof}`);
  }
  assert.doesNotMatch(acceptance, /execFile|spawn\(/);
});

test("public authoring bundler creates a self-contained temporary reference package", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-no-ai-package-test-"));
  try {
    const { manifest } = await createChecklistPackage(root);
    const [worker, ui, meta] = await Promise.all([
      readFile(path.join(root, "dist/worker.js"), "utf8"),
      readFile(path.join(root, "dist/ui/index.js"), "utf8"),
      readFile(path.join(root, "package.json"), "utf8"),
    ]);
    assert.equal(manifest.id, "local.no-ai-checklist");
    assert.match(worker, /Verify|checklist|createChecklistPlugin/);
    assert.doesNotMatch(worker, /from ["']@sonparkserver\/plugin-sdk/);
    assert.match(ui, /@sonparkserver\/plugin-sdk\/ui\/bridge/);
    assert.equal(JSON.parse(meta).spsPlugin.worker, "./dist/worker.js");
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("sps-no-ai-package-test-"));
    await rm(root, { recursive: true, force: true });
  }
});

test("No-AI Electron acceptance is opt-in, source-only, and never enters the Agent fixture", async () => {
  const script = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(packageJson.scripts["test:e2e:no-ai-checklist"], /--no-ai-checklist/);
  assert.match(script, /noAiChecklist && !sourceElectron/);
  assert.match(script, /if \(noAiChecklist\) \{[\s\S]*?runNoAiChecklistAcceptance\([\s\S]*?\} else \{\s*\/\/ This fixture uses only an isolated/);
  const closer = script.slice(script.indexOf("async function closeDesktopForRestart()"), script.indexOf("const setupTarget"));
  assert.ok(closer.indexOf('once(child, "exit")') < closer.indexOf('requestBrowserShutdown()'), "Observe process exit before closing CDP");
  assert.match(closer, /assert.equal\(child.exitCode, 0/);
  assert.doesNotMatch(closer, /taskkill/);
  const acceptance = await readFile(new URL("../scripts/no-ai-checklist-acceptance.mjs", import.meta.url), "utf8");
  for (const step of ["await restart({ companyPrefix: company.issuePrefix, pluginId: plugin.id })", "await openRecovery()", "scope-probe", "denied-read", "denied-write", "jobs/${job.id}/trigger", "Page.reload"]) {
    assert.ok(acceptance.includes(step), `Missing acceptance boundary: ${step}`);
  }
});

test("waits for Native recovery renderer readiness before refreshing devices", async () => {
  const script = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");
  const descriptionStart = script.indexOf("async function describePage(cdp)");
  const descriptionEnd = script.indexOf("\nasync function click", descriptionStart);
  const description = script.slice(descriptionStart, descriptionEnd);
  for (const state of [
    'hostBusy: statusRegion.getAttribute("aria-busy") === "true"',
    'hostMessage: document.querySelector("#status-message")?.textContent?.trim() ?? null',
    'devicesBusy: devicesStatus?.getAttribute("aria-busy") === "true"',
    'devicesMessage: devicesStatus?.textContent?.trim() ?? null',
    'refreshDisabled: refreshButton ? refreshButton.disabled : null',
  ]) {
    assert.ok(description.includes(state), `Native recovery readiness snapshot is missing ${state}`);
  }

  const recoveryStart = script.indexOf("openRecovery: async () => {");
  const waitAt = script.indexOf("await waitForPage(setupCdp, page => page.nativeManagement?.hostBusy === false", recoveryStart);
  const clickAt = script.indexOf('await click(setupCdp, "#refresh-native-devices", "Refresh Native device management without Agent or Plugin dependencies")', recoveryStart);
  assert.ok(recoveryStart >= 0 && waitAt > recoveryStart && clickAt > waitAt,
    "Wait for loaded Native recovery state before the existing Refresh click");
  const readinessWait = script.slice(waitAt, clickAt);
  for (const requirement of [
    'page.nativeManagement.hostMessage === "Current local desktop status."',
    'page.nativeManagement.devicesBusy === false',
    'page.nativeManagement.devicesMessage === "Prepare Host identity first"',
    'page.nativeManagement.refreshDisabled === false',
  ]) {
    assert.ok(readinessWait.includes(requirement), `Native recovery wait must require ${requirement}`);
  }
  assert.equal((readinessWait.match(/await waitForPage\(/g) || []).length, 1, "Use one bounded readiness wait, not retries");
  assert.match(script, /async function waitForPage\(cdp, predicate, description, timeoutMs = 45_000\)/,
    "Keep the existing page-wait deadline");
});

test("No-AI restart reopens the exact reference UI even when startup restores another Workspace", async () => {
  const script = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");
  const acceptance = await readFile(new URL("../scripts/no-ai-checklist-acceptance.mjs", import.meta.url), "utf8");
  assert.ok(acceptance.includes("await restart({ companyPrefix: company.issuePrefix, pluginId: plugin.id })"));
  const restart = script.slice(script.indexOf("restart: async ({ companyPrefix, pluginId })"), script.indexOf("openRecovery: async () => {"));
  assert.ok(restart.includes("const expectedPath = `/${companyPrefix}/plugins/${pluginId}`"));
  assert.ok(restart.indexOf('command("Page.navigate", { url: expectedUrl })') < restart.indexOf("await waitForPage(workspaceCdp"));
  assert.ok(restart.includes("const expectedUrl = new URL(expectedPath, restartedTarget.url).href"));
  assert.doesNotMatch(restart, /evaluate\(`location\.assign/);
  const predicate = restart.match(/await waitForPage\(workspaceCdp, (page => [^\n]+),/);
  assert.ok(predicate);
  const expectedPath = "/REF/plugins/fixture-id";
  const expectedUrl = `http://127.0.0.1:31310${expectedPath}`;
  const ready = runInNewContext(`(${predicate[1]})`, { expectedUrl });
  assert.equal(ready({ route: "about:blank", checklistReady: false }), false);
  assert.equal(ready({ route: "http://127.0.0.1:31310/MOD", body: "Model request fixture", checklistReady: false }), false);
  assert.equal(ready({ route: `http://127.0.0.1:31310${expectedPath}`, checklistReady: false }), false);
  assert.equal(ready({ route: "http://127.0.0.1:31310/OTHER/plugins/fixture-id", checklistReady: true }), false);
  assert.equal(ready({ route: `http://127.0.0.1:31310${expectedPath}`, body: "custom localized title", checklistReady: true }), true);
  assert.ok(script.includes('checklistReady: document.querySelector(\'[data-testid="checklist-jobs"]\')?.textContent === "Jobs: 1"'));
  for (const gate of ["Host restart lost checklist data/event/Job state", "No-AI reference must not dispatch Agent work", "await openRecovery()"])
    assert.ok(acceptance.includes(gate), `Preserve existing acceptance gate ${gate}`);
});

test("Windows verification requires the No-AI source Electron acceptance", async () => {
  const workflow = await readFile(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url), "utf8");
  const step = workflow.slice(workflow.indexOf("- name: Run No-AI Workspace source Desktop E2E"));
  assert.ok(step.startsWith("- name: Run No-AI"));
  const sourceStep = step.split(/\r?\n\s+- name:/)[0];
  assert.match(sourceStep, /timeout-minutes: 20/);
  assert.match(sourceStep, /shell: powershell/);
  assert.match(sourceStep, /SPS_DESKTOP_E2E_SOURCE: "1"/);
  assert.match(sourceStep, /run: \.\\scripts\\run-windows-ci-e2e\.ps1 -Mode runtime-discovery/);
  assert.doesNotMatch(sourceStep, /continue-on-error|if:/);
});

test("runtime discovery extends the No-AI path and uses the signed simulated Node protocol", async () => {
  const script = await readFile(new URL("../scripts/runtime-discovery-acceptance.mjs", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(packageJson.scripts["test:e2e:runtime-discovery"], /--runtime-discovery/);
  for (const contract of ["createSignedHeartbeat", '"recently_seen"', '"execution_grant_required"', '"inactive"', "read(secondCompany.id)", "credentialStatus", "host-api-support", "deniedSupport", "assert.rejects"]) {
    assert.ok(script.includes(contract), `Missing runtime acceptance case ${contract}`);
  }
  assert.doesNotMatch(script, /\.runs\.dispatch|execFile|spawn\(/);
});
