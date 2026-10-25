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
  const acceptance = await readFile(new URL("../scripts/no-ai-checklist-acceptance.mjs", import.meta.url), "utf8");
  for (const step of ["await restart()", "await openRecovery()", "scope-probe", "denied-read", "denied-write", "jobs/${job.id}/trigger", "Page.reload"]) {
    assert.ok(acceptance.includes(step), `Missing acceptance boundary: ${step}`);
  }
});
