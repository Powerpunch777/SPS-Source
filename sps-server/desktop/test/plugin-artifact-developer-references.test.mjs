import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { link, mkdtemp, mkdir, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  developerProjectStoreLayout,
  readDeveloperProjectArtifactReferences,
  saveDeveloperProjects,
} from "../src/developer-project-store.mjs";

const projectId = "dev-11111111-1111-4111-8111-111111111111";
const fingerprint = (char) => char.repeat(64);
const outputs = {
  manifestSha256: fingerprint("1"),
  workerSha256: fingerprint("2"),
  uiSha256: null,
};
const outputFingerprint = createHash("sha256")
  .update(JSON.stringify([outputs.manifestSha256, outputs.workerSha256, outputs.uiSha256]), "utf8")
  .digest("hex");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-developer-artifact-refs-"));
  const vaultRoot = path.join(root, "vault");
  const sourcePath = path.join(root, "source");
  await mkdir(sourcePath);
  return { root, vaultRoot, sourcePath };
}

function state(sourcePath, { lastKnownGood = false } = {}) {
  const candidate = {
    sourceFingerprint: fingerprint("a"),
    outputFingerprint,
    outputs,
    createdAt: "2026-07-31T00:00:00.000Z",
    gates: Object.fromEntries(["build", "validate", "test"].map((name) => [name, { success: true, diagnosticCount: 0 }])),
  };
  return {
    schemaVersion: 1,
    projects: [{
      id: projectId,
      displayName: "Example",
      sourcePath,
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
      candidate,
      ...(lastKnownGood ? {
        lastKnownGood: {
          ...candidate,
          buildId: "build-22222222-2222-4222-8222-222222222222",
          deployment: {
            stageId: "d".repeat(32),
            pluginId: "local.example-plugin",
            version: "1.0.0",
            artifactSha256: fingerprint("e"),
            archiveRelativePath: `developer-mode/builds/${fingerprint("e")}.spsplugin`,
          },
        },
      } : {}),
    }],
  };
}

test("captures immutable index, source, and last-known-good references without inventing candidate archives", async (t) => {
  const { root, vaultRoot, sourcePath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await saveDeveloperProjects({ vaultRoot, state: state(sourcePath, { lastKnownGood: true }) });

  const captured = await readDeveloperProjectArtifactReferences({ vaultRoot });
  const layout = developerProjectStoreLayout(vaultRoot);
  assert.deepEqual(captured.references, [
    { source: "desktop-developer-index", ownerId: "projects", state: "retained", path: layout.projectsPath, kind: "file" },
    { source: "desktop-developer-source", ownerId: projectId, state: "retained", path: sourcePath, kind: "directory" },
    {
      source: "desktop-developer-build",
      ownerId: projectId,
      state: "last-known-good",
      path: path.join(vaultRoot, "developer-mode", "builds", `${fingerprint("e")}.spsplugin`),
      kind: "file",
    },
  ]);
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.references), true);
  assert.ok(captured.references.every(Object.isFrozen));
  assert.throws(() => captured.references.push({}), TypeError);
  assert.equal(await captured.assertCurrent(), true);
});

test("accepts one leading BOM and CRLF canonical JSON, then detects byte changes", async (t) => {
  const { root, vaultRoot, sourcePath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const layout = developerProjectStoreLayout(vaultRoot);
  await mkdir(layout.root, { recursive: true });
  const canonical = `${JSON.stringify(state(sourcePath), null, 2)}\n`;
  await writeFile(layout.projectsPath, `\uFEFF${canonical.replace(/\n/g, "\r\n")}`, "utf8");
  const captured = await readDeveloperProjectArtifactReferences({ vaultRoot });
  assert.equal(await captured.assertCurrent(), true);
  await writeFile(layout.projectsPath, canonical, "utf8");
  await assert.rejects(captured.assertCurrent(), /changed/i);
});

test("returns the metadata reference for a missing index and detects its later appearance", async (t) => {
  const { root, vaultRoot } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const captured = await readDeveloperProjectArtifactReferences({ vaultRoot });
  assert.equal(captured.references.length, 1);
  assert.equal(captured.references[0].ownerId, "projects");
  assert.equal(await captured.assertCurrent(), true);
  const layout = developerProjectStoreLayout(vaultRoot);
  await mkdir(layout.root, { recursive: true });
  await writeFile(layout.projectsPath, `${JSON.stringify({ schemaVersion: 1, projects: [] }, null, 2)}\n`, "utf8");
  await assert.rejects(captured.assertCurrent(), /changed/i);
});

test("rejects unknown fields, invalid UTF-8, linked parents, and linked files without touching outside data", async (t) => {
  const { root, vaultRoot, sourcePath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const layout = developerProjectStoreLayout(vaultRoot);
  await mkdir(layout.root, { recursive: true });
  const valid = `${JSON.stringify(state(sourcePath), null, 2)}\n`;
  await writeFile(layout.projectsPath, valid.replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "unknown": true,'), "utf8");
  await assert.rejects(readDeveloperProjectArtifactReferences({ vaultRoot }), /canonical/i);
  await writeFile(layout.projectsPath, Buffer.from([0xc3, 0x28]));
  await assert.rejects(readDeveloperProjectArtifactReferences({ vaultRoot }), /UTF-8/i);

  const outside = path.join(root, "outside.json");
  const sentinel = "outside sentinel";
  await writeFile(outside, sentinel, "utf8");
  await rm(layout.projectsPath);
  try {
    await symlink(outside, layout.projectsPath, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error?.code)) return t.skip(`File symlink creation unavailable: ${error.code}`);
    throw error;
  }
  await assert.rejects(readDeveloperProjectArtifactReferences({ vaultRoot }), /unavailable|parent/i);
  assert.equal(await fs.readFile(outside, "utf8"), sentinel);

  const linkedVault = path.join(root, "linked-vault");
  await symlink(vaultRoot, linkedVault, "junction");
  await assert.rejects(readDeveloperProjectArtifactReferences({ vaultRoot: linkedVault }), /parent/i);
  assert.equal(await fs.readFile(outside, "utf8"), sentinel);
});

test("duplicate escaped keys, double BOM, UTF16 and oversize metadata cannot hide retained paths", async t => {
  const { root, vaultRoot, sourcePath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const layout = developerProjectStoreLayout(vaultRoot);
  await mkdir(layout.root, { recursive: true });
  const valid = `${JSON.stringify(state(sourcePath), null, 2)}\n`;
  for (const bytes of [
    Buffer.from(valid.replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,')),
    Buffer.from(valid.replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVers\\u0069on": 1,')),
    Buffer.from(`\uFEFF\uFEFF${valid}`), Buffer.from(valid, "utf16le"), Buffer.alloc(512 * 1024 + 1, 32),
  ]) {
    await writeFile(layout.projectsPath, bytes);
    await assert.rejects(readDeveloperProjectArtifactReferences({ vaultRoot }));
  }
});

test("identical bytes at a replacement file and hardlinks remain unavailable", async t => {
  const { root, vaultRoot, sourcePath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await saveDeveloperProjects({ vaultRoot, state: state(sourcePath) });
  const layout = developerProjectStoreLayout(vaultRoot);
  const initial = await readDeveloperProjectArtifactReferences({ vaultRoot });
  const original = await fs.readFile(layout.projectsPath);
  await rename(layout.projectsPath, path.join(root, "old.json"));
  await writeFile(layout.projectsPath, original);
  await assert.rejects(initial.assertCurrent(), /changed/i);
  const unlinked = await readDeveloperProjectArtifactReferences({ vaultRoot });
  await link(layout.projectsPath, path.join(root, "alias.json"));
  await assert.rejects(unlinked.assertCurrent(), /unavailable/i);
  await assert.rejects(readDeveloperProjectArtifactReferences({ vaultRoot }), /unavailable/i);
});

test("metadata mutation is detected even when the JSON bytes do not change", async t => {
  const { root, vaultRoot, sourcePath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await saveDeveloperProjects({ vaultRoot, state: state(sourcePath) });
  const captured = await readDeveloperProjectArtifactReferences({ vaultRoot });
  await utimes(developerProjectStoreLayout(vaultRoot).projectsPath, new Date(), new Date("2030-01-01T00:00:00Z"));
  await assert.rejects(captured.assertCurrent(), /changed/i);
});
