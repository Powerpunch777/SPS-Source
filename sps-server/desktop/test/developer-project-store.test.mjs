import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSpsPluginConformanceReportV1 } from "@sonparkserver/plugin-sdk/conformance/v1.mjs";
import {
  connectDeveloperProject,
  DEVELOPER_PROJECT_STORE_SCHEMA_VERSION,
  developerProjectStoreLayout,
  isDeveloperCandidatePromotable,
  loadDeveloperProjects,
  promoteDeveloperCandidate,
  publicDeveloperProject,
  recordDeveloperCandidate,
  removeDeveloperProject,
  rollbackDeveloperProject,
  saveDeveloperProjects,
} from "../src/developer-project-store.mjs";

const SOURCE_FINGERPRINT = "a".repeat(64);
const OTHER_OUTPUT_FINGERPRINT = "c".repeat(64);
const OUTPUTS = Object.freeze({
  manifestSha256: "1".repeat(64),
  workerSha256: "2".repeat(64),
  uiSha256: "3".repeat(64),
});
const OUTPUT_FINGERPRINT = createHash("sha256")
  .update(JSON.stringify([OUTPUTS.manifestSha256, OUTPUTS.workerSha256, OUTPUTS.uiSha256]), "utf8")
  .digest("hex");
const FIXED_PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const FIXED_BUILD_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-07-31T00:00:00.000Z";
const DEPLOYMENT = Object.freeze({
  stageId: "d".repeat(32),
  pluginId: "local.example-plugin",
  version: "0.1.0",
  artifactSha256: "e".repeat(64),
  archiveRelativePath: `developer-mode/builds/${"e".repeat(64)}.spsplugin`,
});

function candidate({ build = true, validate = true, test: testGate = true, outputFingerprint = OUTPUT_FINGERPRINT } = {}) {
  const gate = (success) => ({ sourceFingerprint: SOURCE_FINGERPRINT, outputFingerprint, success, diagnosticCount: success ? 0 : 2 });
  return {
    sourceFingerprint: SOURCE_FINGERPRINT,
    outputFingerprint,
    outputs: { ...OUTPUTS },
    gates: { build: gate(build), validate: gate(validate), test: gate(testGate) },
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-developer-project-store-"));
  const vaultRoot = path.join(root, "owner-vault");
  const sourceRoot = path.join(root, "external-plugin");
  await mkdir(sourceRoot, { recursive: true });
  return { root, vaultRoot, sourceRoot };
}

function ids() {
  const values = [FIXED_PROJECT_ID, FIXED_BUILD_ID];
  return () => values.shift() ?? "33333333-3333-4333-8333-333333333333";
}

async function connect(input) {
  return await connectDeveloperProject({ ...input, now: () => NOW, randomId: ids() });
}

test("connects an external source through a canonical path and survives a restart", async () => {
  const { root, vaultRoot, sourceRoot } = await fixture();
  try {
    const project = await connect({ vaultRoot, sourcePath: sourceRoot, displayName: "Weather Plugin" });
    assert.equal(project.id, `dev-${FIXED_PROJECT_ID}`);
    assert.equal(project.sourcePath, await fs.realpath(sourceRoot));
    const restored = await loadDeveloperProjects({ vaultRoot });
    assert.equal(restored.schemaVersion, DEVELOPER_PROJECT_STORE_SCHEMA_VERSION);
    assert.deepEqual(restored.projects, [project]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects non-absolute paths, path escapes, duplicate canonical paths, and symlink roots", async () => {
  const { root, vaultRoot, sourceRoot } = await fixture();
  try {
    await assert.rejects(() => connect({ vaultRoot, sourcePath: "../external-plugin" }), /absolute/i);
    await assert.rejects(() => connect({ vaultRoot, sourcePath: path.join(sourceRoot, "..", "missing") }), /existing directory/i);
    await connect({ vaultRoot, sourcePath: sourceRoot });
    await assert.rejects(() => connect({ vaultRoot, sourcePath: path.join(sourceRoot, ".") }), /already connected/i);

    const linkPath = path.join(root, "linked-plugin");
    await symlink(sourceRoot, linkPath, "junction");
    await assert.rejects(() => connect({ vaultRoot, sourcePath: linkPath }), /symbolic link or junction/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed for oversized or malformed persisted state", async () => {
  const { root, vaultRoot } = await fixture();
  try {
    const layout = developerProjectStoreLayout(vaultRoot);
    await mkdir(layout.root, { recursive: true });
    await writeFile(layout.projectsPath, "{".padEnd(512 * 1024 + 1, "x"), "utf8");
    await assert.rejects(() => loadDeveloperProjects({ vaultRoot }), /unavailable|size limit/i);
    await writeFile(layout.projectsPath, "{not-json}", "utf8");
    await assert.rejects(() => loadDeveloperProjects({ vaultRoot }), /not valid JSON/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps failed candidates separate from the last known good build", async () => {
  const { root, vaultRoot, sourceRoot } = await fixture();
  try {
    const project = await connect({ vaultRoot, sourcePath: sourceRoot });
    await recordDeveloperCandidate({ vaultRoot, projectId: project.id, candidate: candidate(), now: () => NOW, randomId: ids() });
    const promoted = await promoteDeveloperCandidate({
      vaultRoot,
      projectId: project.id,
      deployment: DEPLOYMENT,
      buildId: "build-123e4567-e89b-12d3-a456-426614174000",
      now: () => NOW,
      randomId: ids(),
    });
    assert.equal(promoted.buildId, "build-123e4567-e89b-12d3-a456-426614174000");
    assert.deepEqual(promoted.deployment, DEPLOYMENT);

    await recordDeveloperCandidate({ vaultRoot, projectId: project.id, candidate: candidate({ test: false }), now: () => "2026-07-31T00:01:00.000Z", randomId: ids() });
    await assert.rejects(
      () => promoteDeveloperCandidate({
        vaultRoot,
        projectId: project.id,
        deployment: DEPLOYMENT,
        now: () => NOW,
        randomId: ids(),
      }),
      /not promotable/i,
    );
    const restored = await loadDeveloperProjects({ vaultRoot });
    assert.equal(restored.projects[0].candidate.gates.test.success, false);
    assert.deepEqual(await rollbackDeveloperProject({ vaultRoot, projectId: project.id }), promoted);
    assert.equal(
      "archiveRelativePath" in publicDeveloperProject(restored.projects[0]).lastKnownGood.deployment,
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persists safe conformance evidence with the checked development candidate", async () => {
  const { root, vaultRoot, sourceRoot } = await fixture();
  try {
    const project = await connect({ vaultRoot, sourcePath: sourceRoot });
    const conformance = createSpsPluginConformanceReportV1({
      pluginId: "local.example-plugin",
      pluginVersion: "0.1.0",
      generatedAt: NOW,
      checks: [
        { id: "developer.build", status: "passed", summary: "Plugin build gate passed." },
        { id: "developer.validate", status: "passed", summary: "Plugin validate gate passed." },
        { id: "developer.test", status: "passed", summary: "Plugin test gate passed." },
      ],
      metadata: { evidence: "desktop-development-gates-v1" },
    });
    await recordDeveloperCandidate({
      vaultRoot,
      projectId: project.id,
      candidate: { ...candidate(), conformance },
      now: () => NOW,
      randomId: ids(),
    });
    const restored = await loadDeveloperProjects({ vaultRoot });
    assert.equal(restored.projects[0].candidate.conformance.schemaVersion, "sps-plugin-conformance/v1");
    assert.equal(restored.projects[0].candidate.conformance.status, "passed");
    assert.equal(JSON.stringify(restored.projects[0].candidate.conformance).includes("sourcePath"), false);
    assert.equal(JSON.stringify(publicDeveloperProject(restored.projects[0])).includes("sourcePath"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires every gate to report the same candidate tuple before promotion", async () => {
  const { root, vaultRoot, sourceRoot } = await fixture();
  try {
    const project = await connect({ vaultRoot, sourcePath: sourceRoot });
    const mismatched = candidate();
    mismatched.gates.test.outputFingerprint = OTHER_OUTPUT_FINGERPRINT;
    await assert.rejects(
      () => recordDeveloperCandidate({ vaultRoot, projectId: project.id, candidate: mismatched, now: () => NOW, randomId: ids() }),
      /does not match the candidate fingerprint tuple/i,
    );
    assert.equal(isDeveloperCandidatePromotable({ ...candidate(), createdAt: NOW }), true);
    assert.equal(isDeveloperCandidatePromotable({ ...candidate({ validate: false }), createdAt: NOW }), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("redacts the external absolute source path from public views", async () => {
  const { root, vaultRoot, sourceRoot } = await fixture();
  try {
    const project = await connect({ vaultRoot, sourcePath: sourceRoot, sourceLabel: "Shared plugin folder" });
    const publicProject = publicDeveloperProject(project);
    assert.equal("sourcePath" in publicProject, false);
    assert.equal(publicProject.sourceLabel, "Shared plugin folder");
    assert.doesNotMatch(JSON.stringify(publicProject), new RegExp(sourceRoot.replace(/\\/g, "\\\\")));
    await assert.rejects(
      () => connect({ vaultRoot: path.join(root, "second-vault"), sourcePath: sourceRoot, sourceLabel: "C:\\private\\plugin" }),
      /cannot contain a filesystem path/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires an immutable staged deployment before promotion", async () => {
  const { root, vaultRoot, sourceRoot } = await fixture();
  try {
    const project = await connect({ vaultRoot, sourcePath: sourceRoot });
    await recordDeveloperCandidate({ vaultRoot, projectId: project.id, candidate: candidate(), now: () => NOW, randomId: ids() });
    await assert.rejects(
      () => promoteDeveloperCandidate({ vaultRoot, projectId: project.id, now: () => NOW, randomId: ids() }),
      /deployment is required/i,
    );
    await assert.rejects(
      () => promoteDeveloperCandidate({
        vaultRoot,
        projectId: project.id,
        deployment: { ...DEPLOYMENT, stageId: "../escape" },
        now: () => NOW,
        randomId: ids(),
      }),
      /stage id is invalid/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writes atomically with a private temporary file and removes only state metadata", async () => {
  const { root, vaultRoot, sourceRoot } = await fixture();
  try {
    const project = await connect({ vaultRoot, sourcePath: sourceRoot });
    const operations = [];
    const fsApi = {
      ...fs,
      async writeFile(filePath, value, options) {
        operations.push({ type: "write", filePath, options });
        return await fs.writeFile(filePath, value, options);
      },
      async rename(from, to) {
        operations.push({ type: "rename", from, to });
        return await fs.rename(from, to);
      },
    };
    const removed = await removeDeveloperProject({ vaultRoot, projectId: project.id, fsApi, randomId: () => FIXED_PROJECT_ID });
    assert.equal(removed.sourcePath, await fs.realpath(sourceRoot));
    assert.equal(await fs.stat(sourceRoot).then((stats) => stats.isDirectory()), true);
    assert.equal(operations[0].options.mode, 0o600);
    assert.equal(operations[0].options.flag, "wx");
    assert.equal(operations[1].type, "rename");
    const files = await readdir(developerProjectStoreLayout(vaultRoot).root);
    assert.deepEqual(files, ["projects.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a state whose metadata grows past the persisted limit before it can be saved", async () => {
  const { root, vaultRoot } = await fixture();
  try {
    await assert.rejects(
      () => saveDeveloperProjects({
        vaultRoot,
        state: { schemaVersion: DEVELOPER_PROJECT_STORE_SCHEMA_VERSION, projects: Array.from({ length: 65 }, () => ({})) },
      }),
      /limit exceeded/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a temporary file identifier that could escape the Owner Vault", async () => {
  const { root, vaultRoot } = await fixture();
  try {
    await assert.rejects(
      () => saveDeveloperProjects({
        vaultRoot,
        state: { schemaVersion: DEVELOPER_PROJECT_STORE_SCHEMA_VERSION, projects: [] },
        randomId: () => "../escape",
      }),
      /temporary id must be a UUID/i,
    );
    assert.equal(await fs.stat(path.join(root, "escape")).then(() => true).catch(() => false), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
