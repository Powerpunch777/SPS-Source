import assert from "node:assert/strict";
import test from "node:test";
import { createDiscoveryAuthoringService, discoveryAuthoringState } from "../dist/authoring.js";

function harness({ now } = {}) {
  const values = new Map();
  const key = (input) => `${input.scopeKind}:${input.scopeId}:${input.namespace}:${input.stateKey}`;
  const ctx = {
    state: {
      async get(input) { return structuredClone(values.get(key(input)) ?? null); },
      async set(input, value) { values.set(key(input), structuredClone(value)); },
    },
  };
  let index = 0;
  const service = createDiscoveryAuthoringService(ctx, {
    now: now ?? (() => new Date(Date.UTC(2026, 6, 31, 12, 0, 0, index++)).toISOString()),
  });
  return { service, values };
}

test("keeps append-only authoring evidence scoped to one Workspace", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({
    goal: "Build a neutral team workflow plugin.",
    displayName: "Team Workflow",
    pluginId: "local.team-workflow",
  }, run);
  assert.match(created.id, /^spsas_/);
  assert.equal(created.events.length, 1);
  assert.equal(created.events[0].type, "project");

  await service.runStep({
    authoringSessionId: created.id,
    objective: "Create the manifest and worker.",
    status: "passed",
    evidence: [{ kind: "workspace_file", ref: "src/manifest.js", label: "Manifest" }],
  }, run);
  const verified = await service.inspectBuild({
    authoringSessionId: created.id,
    status: "passed",
    summary: "Build, validation, and tests passed in the Agent workspace.",
    evidence: [{ kind: "test", ref: "test-run-01", digest: "a".repeat(64) }],
  }, run);
  assert.equal(verified.events.length, 3);
  assert.deepEqual(verified.events.map((event) => event.type), ["project", "authoring", "build"]);
  assert.equal(verified.status, "verified");
  assert.equal((await service.load("workspace-b")).length, 0);
});

test("serializes concurrent authoring events without losing evidence", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({ goal: "Build a plugin.", pluginId: "local.concurrent" }, run);
  await Promise.all([
    service.runStep({
      authoringSessionId: created.id,
      objective: "Write the worker.",
      status: "passed",
      evidence: [{ kind: "workspace_file", ref: "src/worker.js" }],
    }, run),
    service.runStep({
      authoringSessionId: created.id,
      objective: "Write the UI.",
      status: "passed",
      evidence: [{ kind: "workspace_file", ref: "src/ui.js" }],
    }, run),
  ]);
  const [session] = await service.load("workspace-a");
  assert.deepEqual(session.events.map((event) => event.summary), [
    "Create a separate plugin project for SPS Plugin.",
    "Write the worker.",
    "Write the UI.",
  ]);
});

test("rejects absolute, URL, and parent-traversal evidence references", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({ goal: "Build a plugin.", pluginId: "local.safe-plugin" }, run);
  for (const ref of ["C:\\Users\\owner\\secret.txt", "../secret.txt", "https://example.test/log", "file:///tmp/log"]) {
    await assert.rejects(() => service.runStep({
      authoringSessionId: created.id,
      objective: "Attach evidence.",
      status: "passed",
      evidence: [{ kind: "workspace_file", ref }],
    }, run), /opaque ID or project-relative reference/);
  }
  assert.equal((await service.load("workspace-a"))[0].events.length, 1);
});

test("records an isolated Preview request without applying lifecycle", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({ goal: "Build a plugin.", pluginId: "local.preview-plugin" }, run);
  const preview = await service.requestPreview({ authoringSessionId: created.id }, run);
  assert.equal(preview.events.at(-1).status, "requested");
  assert.equal(preview.status, "drafting");
  assert.deepEqual(preview.events.map((event) => event.type), ["project", "preview"]);
});

test("records package creation only after a Builder project has package evidence", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({ goal: "Build a package.", pluginId: "local.package-plugin", projectRef: "plugins/local-package-plugin" }, run);
  await service.inspectBuild({
    authoringSessionId: created.id,
    status: "passed",
    summary: "Build and tests passed.",
    evidence: [{ kind: "test", ref: "build-run-02" }],
  }, run);
  const packaged = await service.createPackage({
    authoringSessionId: created.id,
    packageRef: "artifacts/local-package-plugin.spsplugin",
    packageVersion: "0.1.0",
    evidence: [{ kind: "test", ref: "test-run-02", digest: "b".repeat(64) }],
  }, run);
  assert.equal(packaged.status, "packaged");
  assert.equal(packaged.events.at(-1).type, "package");
  assert.equal(packaged.events.at(-1).status, "passed");
  assert.equal(packaged.projectRef, "plugins/local-package-plugin");
  assert.deepEqual(packaged.events.at(-1).evidence.map((item) => item.kind), ["test", "package"]);
});

test("rejects package creation before a passed build inspection", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({ goal: "Build a gated package.", pluginId: "local.gated-plugin" }, run);
  await assert.rejects(() => service.createPackage({
    authoringSessionId: created.id,
    packageRef: "artifacts/gated-plugin.spsplugin",
    evidence: [],
  }, run), /passed latest build inspection is required/);
});

test("rejects package creation when the latest build inspection failed", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({ goal: "Build a current package.", pluginId: "local.current-package" }, run);
  await service.inspectBuild({
    authoringSessionId: created.id,
    status: "passed",
    summary: "Initial build passed.",
    evidence: [{ kind: "test", ref: "test-run-passed" }],
  }, run);
  await service.inspectBuild({
    authoringSessionId: created.id,
    status: "failed",
    summary: "Current build failed.",
    evidence: [{ kind: "test", ref: "test-run-failed" }],
  }, run);
  await assert.rejects(() => service.createPackage({
    authoringSessionId: created.id,
    packageRef: "artifacts/current-package.spsplugin",
    evidence: [],
  }, run), /passed latest build inspection is required/);
  assert.equal((await service.load("workspace-a"))[0].events.at(-1).status, "failed");
});

test("requires a build inspection after authoring even when event timestamps match", async () => {
  const { service } = harness({ now: () => "2026-07-31T12:00:00.000Z" });
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({ goal: "Build a current package.", pluginId: "local.fresh-build" }, run);
  await service.inspectBuild({
    authoringSessionId: created.id,
    status: "passed",
    summary: "Initial build passed.",
    evidence: [{ kind: "test", ref: "initial-build" }],
  }, run);
  await service.runStep({
    authoringSessionId: created.id,
    objective: "Change the plugin after the build.",
    status: "passed",
    evidence: [{ kind: "workspace_file", ref: "src/worker.js" }],
  }, run);

  await assert.rejects(() => service.createPackage({
    authoringSessionId: created.id,
    packageRef: "artifacts/fresh-build.spsplugin",
    evidence: [],
  }, run), /new authoring step.*rerun build inspection/i);
  assert.equal((await service.load("workspace-a"))[0].events.length, 3);

  await service.inspectBuild({
    authoringSessionId: created.id,
    status: "passed",
    summary: "Build passed after the latest authoring step.",
    evidence: [{ kind: "test", ref: "fresh-build" }],
  }, run);
  const preview = await service.requestPreview({ authoringSessionId: created.id }, run);
  assert.equal(preview.events.at(-1).type, "preview");
  assert.equal(preview.events.at(-1).status, "requested");

  const packaged = await service.createPackage({
    authoringSessionId: created.id,
    packageRef: "artifacts/fresh-build.spsplugin",
    evidence: [],
  }, run);
  assert.equal(packaged.events.at(-1).type, "package");
  assert.equal(packaged.status, "packaged");
  assert.ok(packaged.events.every((event) => event.at === "2026-07-31T12:00:00.000Z"));
});

test("authoring in another project does not invalidate a passed build", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const builtProject = await service.createProject({ goal: "Build the first plugin.", pluginId: "local.first-plugin" }, run);
  await service.inspectBuild({ authoringSessionId: builtProject.id, status: "passed" }, run);

  const otherProject = await service.createProject({ goal: "Build a second plugin.", pluginId: "local.second-plugin" }, run);
  await service.runStep({
    authoringSessionId: otherProject.id,
    objective: "Continue work on the second plugin.",
    status: "running",
  }, run);

  const packaged = await service.createPackage({
    authoringSessionId: builtProject.id,
    packageRef: "artifacts/first-plugin.spsplugin",
    evidence: [],
  }, run);
  assert.equal(packaged.status, "packaged");
});

test("never drops old events when the append-only ledger reaches its limit", async () => {
  const { service } = harness();
  const run = { companyId: "workspace-a", runId: "run-a" };
  const created = await service.createProject({ goal: "Fill the ledger.", pluginId: "local.full-ledger" }, run);
  for (let index = 1; index < discoveryAuthoringState.maxEvents; index += 1) {
    await service.runStep({
      authoringSessionId: created.id,
      objective: `Evidence ${index}`,
      status: "passed",
      evidence: [{ kind: "run", ref: `run-${index}` }],
    }, run);
  }
  await assert.rejects(() => service.runStep({
    authoringSessionId: created.id,
    objective: "Overflow",
    status: "passed",
    evidence: [{ kind: "run", ref: "run-overflow" }],
  }, run), /ledger is full/);
  const [session] = await service.load("workspace-a");
  assert.equal(session.events.length, discoveryAuthoringState.maxEvents);
  assert.equal(session.events[0].type, "project");
});

test("exports stable authoring state metadata", () => {
  assert.deepEqual(discoveryAuthoringState, {
    namespace: "discovery",
    stateKey: "authoring-sessions",
    maxSessions: 24,
    maxEvents: 120,
  });
});
