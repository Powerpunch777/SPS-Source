import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
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
  assert.ok(closer.indexOf('once(child, "exit")') < closer.indexOf('.command("Browser.close")'), "Observe process exit before closing CDP");
  assert.match(closer, /assert.equal\(child.exitCode, 0/);
  assert.doesNotMatch(closer, /taskkill/);
  const acceptance = await readFile(new URL("../scripts/no-ai-checklist-acceptance.mjs", import.meta.url), "utf8");
  for (const step of ["await restart()", "await openRecovery()", "scope-probe", "denied-read", "denied-write", "jobs/${job.id}/trigger", "Page.reload"]) {
    assert.ok(acceptance.includes(step), `Missing acceptance boundary: ${step}`);
  }
});

test("Windows verification requires the No-AI source Electron acceptance", async () => {
  const workflow = await readFile(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url), "utf8");
  const step = workflow.slice(workflow.indexOf("- name: Run No-AI Workspace source Desktop E2E"));
  assert.ok(step.startsWith("- name: Run No-AI"));
  const sourceStep = step.split(/\r?\n\s+- name:/)[0];
  assert.match(sourceStep, /timeout-minutes: 18/);
  assert.match(sourceStep, /SPS_DESKTOP_E2E_SOURCE: "1"/);
  assert.match(sourceStep, /run: npm run test:e2e:runtime-discovery/);
  assert.doesNotMatch(sourceStep, /continue-on-error|if:/);
});

test("runtime discovery extends the No-AI path and uses the signed simulated Node protocol", async () => {
  const script = await readFile(new URL("../scripts/runtime-discovery-acceptance.mjs", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(packageJson.scripts["test:e2e:runtime-discovery"], /--runtime-discovery/);
  for (const contract of ["createSignedHeartbeat", '"recently_seen"', '"execution_grant_required"', '"inactive"', "read(secondCompany.id)", "credentialStatus"]) {
    assert.ok(script.includes(contract), `Missing runtime acceptance case ${contract}`);
  }
  assert.doesNotMatch(script, /\.runs\.dispatch|execFile|spawn\(/);
});
