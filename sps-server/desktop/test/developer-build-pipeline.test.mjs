import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createDeveloperCandidateFromGateReports,
  developmentOutputFingerprint,
  inspectDeveloperSourceTuple,
  stageDeveloperCandidate,
} from "../src/developer-build-pipeline.mjs";

const SOURCE = "a".repeat(64);
const MANIFEST = "b".repeat(64);
const WORKER = "c".repeat(64);
const UI = "d".repeat(64);
const PROJECT_ID = "dev-11111111-1111-4111-8111-111111111111";

function report(command, success = true, overrides = {}) {
  return {
    command,
    success,
    result: {
      command,
      sourceFingerprint: SOURCE,
      manifestSha256: MANIFEST,
      workerSha256: WORKER,
      uiSha256: UI,
      diagnostics: success ? [] : [{ code: "FAIL" }],
      ...overrides,
    },
  };
}

function reports() {
  return ["build", "validate", "test"].map((command) => report(command));
}

test("creates one promotable candidate only from a stable three-gate tuple", () => {
  const candidate = createDeveloperCandidateFromGateReports(reports());
  assert.equal(candidate.sourceFingerprint, SOURCE);
  assert.equal(candidate.outputFingerprint, developmentOutputFingerprint(reports()[0].result));
  assert.deepEqual(Object.keys(candidate.gates), ["build", "validate", "test"]);
  assert.equal(candidate.gates.test.success, true);

  const changed = reports();
  changed[2] = report("test", true, { workerSha256: "e".repeat(64) });
  assert.throws(
    () => createDeveloperCandidateFromGateReports(changed),
    /changed while the development gates were running/i,
  );
  assert.throws(
    () => createDeveloperCandidateFromGateReports([report("build"), report("build"), report("test")]),
    /incomplete or duplicated/i,
  );
});

test("can report an unbuilt source without inventing an output fingerprint", async () => {
  const state = await inspectDeveloperSourceTuple("C:\\external-plugin", {
    fingerprintSource: async () => ({ fingerprint: SOURCE }),
    fingerprintOutputs: async () => { throw new Error("missing dist/worker.js"); },
    allowMissingOutputs: true,
  });
  assert.deepEqual(state, {
    sourceFingerprint: SOURCE,
    outputFingerprint: null,
    outputAvailable: false,
  });
});

test("packages a stable candidate into Owner Vault staging and removes the temporary archive", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-development-stage-"));
  const sourceDirectory = path.join(root, "source");
  const vaultRoot = path.join(root, "vault");
  await mkdir(sourceDirectory);
  const candidate = createDeveloperCandidateFromGateReports(reports());
  let stagedInput;
  try {
    const staged = await stageDeveloperCandidate({
      vaultRoot,
      projectId: PROJECT_ID,
      sourceDirectory,
      candidate: { ...candidate, createdAt: "2026-07-31T00:00:00.000Z" },
      randomId: () => "22222222-2222-4222-8222-222222222222",
      fingerprintSource: async () => ({ fingerprint: SOURCE }),
      fingerprintOutputs: async () => ({ manifestSha256: MANIFEST, workerSha256: WORKER, uiSha256: UI }),
      packagePlugin: async ({ archivePath }) => writeFile(archivePath, "archive", "utf8"),
      stageArchive: async (input) => {
        stagedInput = input;
        return {
          staged: true,
          artifact: { sha256: "f".repeat(64), sizeBytes: 7 },
          stage: { stageId: "f".repeat(32) },
        };
      },
    });
    assert.equal(staged.staged, true);
    assert.equal(
      staged.developmentArchiveRelativePath,
      "developer-mode/builds/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.spsplugin",
    );
    assert.equal(stagedInput.source.registryId, "sps.desktop.development");
    assert.match(stagedInput.source.releaseLocator, /^developer\/dev-/);
    await assert.rejects(() => import("node:fs/promises").then(({ stat }) => stat(stagedInput.archivePath)), /ENOENT/);
    const archived = path.join(vaultRoot, staged.developmentArchiveRelativePath);
    assert.equal(await import("node:fs/promises").then(({ readFile }) => readFile(archived, "utf8")), "archive");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not stage a failed or changed candidate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-development-stage-"));
  const sourceDirectory = path.join(root, "source");
  const vaultRoot = path.join(root, "vault");
  await mkdir(sourceDirectory);
  const failed = createDeveloperCandidateFromGateReports([
    report("build"),
    report("validate", false),
    report("test"),
  ]);
  let staged = false;
  try {
    await assert.rejects(() => stageDeveloperCandidate({
      vaultRoot,
      projectId: PROJECT_ID,
      sourceDirectory,
      candidate: { ...failed, createdAt: "2026-07-31T00:00:00.000Z" },
      stageArchive: async () => { staged = true; },
    }), /passed build, validate, and test/i);
    assert.equal(staged, false);

    const valid = createDeveloperCandidateFromGateReports(reports());
    await assert.rejects(() => stageDeveloperCandidate({
      vaultRoot,
      projectId: PROJECT_ID,
      sourceDirectory,
      candidate: { ...valid, createdAt: "2026-07-31T00:00:00.000Z" },
      fingerprintSource: async () => ({ fingerprint: "9".repeat(64) }),
      fingerprintOutputs: async () => ({ manifestSha256: MANIFEST, workerSha256: WORKER, uiSha256: UI }),
      stageArchive: async () => { staged = true; },
    }), /changed after validation/i);
    assert.equal(staged, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a source mutation during packaging and never calls staging", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-development-stage-"));
  const sourceDirectory = path.join(root, "source");
  const vaultRoot = path.join(root, "vault");
  await mkdir(sourceDirectory);
  const candidate = createDeveloperCandidateFromGateReports(reports());
  let sourceCalls = 0;
  let staged = false;
  try {
    await assert.rejects(() => stageDeveloperCandidate({
      vaultRoot,
      projectId: PROJECT_ID,
      sourceDirectory,
      candidate: { ...candidate, createdAt: "2026-07-31T00:00:00.000Z" },
      randomId: () => "22222222-2222-4222-8222-222222222222",
      fingerprintSource: async () => ({ fingerprint: ++sourceCalls === 1 ? SOURCE : "9".repeat(64) }),
      fingerprintOutputs: async () => ({ manifestSha256: MANIFEST, workerSha256: WORKER, uiSha256: UI }),
      packagePlugin: async ({ archivePath }) => writeFile(archivePath, "archive", "utf8"),
      stageArchive: async () => { staged = true; },
    }), /changed while SPS was packaging/i);
    assert.equal(staged, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
