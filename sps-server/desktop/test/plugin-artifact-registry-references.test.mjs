import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { link, mkdtemp, mkdir, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ownerVaultRegistrySourcesPath,
  readRegistrySourceArtifactReferences,
  saveRegistrySources,
} from "../src/registry-source-catalog.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-registry-artifact-refs-"));
  const vaultRoot = path.join(root, "vault");
  const localPath = path.join(root, "local-registry");
  await mkdir(localPath);
  return { root, vaultRoot, localPath };
}

function localSource(localPath) {
  return { id: "io.sps.local", kind: "local", displayName: "Local Registry", localPath };
}

async function writeCanonical(vaultRoot, sources = []) {
  const filePath = ownerVaultRegistrySourcesPath(vaultRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, sources }, null, 2)}\n`, "utf8");
  return filePath;
}

test("captures frozen metadata and local directory references; missing index appearance is detected", async (t) => {
  const { root, vaultRoot, localPath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const absent = await readRegistrySourceArtifactReferences({ vaultRoot });
  assert.equal(absent.references.length, 1);
  assert.equal(absent.references[0].path, ownerVaultRegistrySourcesPath(vaultRoot));
  assert.equal(await absent.assertCurrent(), true);
  await writeCanonical(vaultRoot, []);
  await assert.rejects(absent.assertCurrent(), /changed/i);

  await saveRegistrySources({ vaultRoot, sources: [localSource(localPath)] });
  const captured = await readRegistrySourceArtifactReferences({ vaultRoot });
  assert.deepEqual(captured.references.map(({ source, ownerId, path: itemPath, kind }) => ({ source, ownerId, path: itemPath, kind })), [
    { source: "desktop-registry-source-index", ownerId: "sources", path: ownerVaultRegistrySourcesPath(vaultRoot), kind: "file" },
    { source: "desktop-registry-source", ownerId: "io.sps.local", path: localPath, kind: "directory" },
  ]);
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.references), true);
  assert.ok(captured.references.every(Object.isFrozen));
  assert.equal(await captured.assertCurrent(), true);
  await rm(localPath, { recursive: true });
  await assert.rejects(captured.assertCurrent(), /unavailable|directory/i);
});

test("accepts writer JSON with one BOM, CRLF, and optional final LF", async (t) => {
  const { root, vaultRoot, localPath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const canonical = JSON.stringify({ schemaVersion: 1, sources: [localSource(localPath)] }, null, 2);
  const filePath = ownerVaultRegistrySourcesPath(vaultRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `\uFEFF${canonical.replace(/\n/g, "\r\n")}`, "utf8");
  const captured = await readRegistrySourceArtifactReferences({ vaultRoot });
  assert.equal(await captured.assertCurrent(), true);
});

test("same-directory short-name observations retain both ancestry identities, not lexical equality", async t => {
  const { root, vaultRoot, localPath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const alias = path.join(root, "SHORT~1");
  await writeCanonical(vaultRoot, [localSource(alias)]);
  const translate = value => value === alias ? localPath : value;
  const observed = [];
  const fsApi = { ...fs,
    async lstat(value, options) {
      observed.push(value);
      return fs.lstat(translate(value), options);
    },
    realpath: value => fs.realpath(translate(value)),
  };
  // An injected filesystem view models the OS's two names without creating a
  // symlink. The actual hosted Windows fixture also uses its real TEMP spelling.
  const captured = await readRegistrySourceArtifactReferences({ vaultRoot, fsApi });
  assert.equal(captured.references[1].path, alias);
  assert.equal(await captured.assertCurrent(), true);
  assert.ok(observed.includes(alias) && observed.includes(await fs.realpath(localPath)));
  await rename(localPath, path.join(root, "retained-original"));
  await mkdir(localPath);
  await assert.rejects(captured.assertCurrent(), /changed/i);
});

test("a canonical spelling pointing to another directory cannot masquerade as a short-name alias", async t => {
  const { root, vaultRoot, localPath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const other = path.join(root, "other");
  await mkdir(other);
  await writeCanonical(vaultRoot, [localSource(localPath)]);
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot, fsApi: { ...fs,
    realpath: value => fs.realpath(value === localPath ? other : value),
  } }), /changed/i);
});

test("rejects unknown fields, duplicate or escaped duplicate fields, malformed text, and noncanonical JSON", async (t) => {
  const { root, vaultRoot, localPath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = await writeCanonical(vaultRoot, [localSource(localPath)]);
  const canonical = `${JSON.stringify({ schemaVersion: 1, sources: [localSource(localPath)] }, null, 2)}\n`;
  const invalid = [
    canonical.replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "unexpected": true,'),
    canonical.replace('"id": "io.sps.local",', '"id": "io.sps.local",\n      "extra": true,'),
    canonical.replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,'),
    canonical.replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVers\\u0069on": 1,'),
    canonical.replace(/\n/g, "\r"),
  ];
  for (const value of invalid) {
    await writeFile(filePath, value, "utf8");
    await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }));
  }
  for (const bytes of [
    Buffer.from([0xc3, 0x28]),
    Buffer.from(`\uFEFF\uFEFF${canonical}`),
    Buffer.from(canonical.replace("Local Registry", "nul\\u0000text")),
    Buffer.from(canonical.replace("Local Registry", "\\uFFFD")),
  ]) {
    await writeFile(filePath, bytes);
    await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }));
  }
});

test("enforces the 1 MiB input and 4096-reference bounds", async (t) => {
  const { root, vaultRoot } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = await writeCanonical(vaultRoot);
  await writeFile(filePath, Buffer.alloc(1024 * 1024 + 1, 0x20));
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }));

  const sources = Array.from({ length: 4096 }, (_, index) => ({
    id: `io.sps.local${String(index).padStart(4, "0")}`,
    kind: "local",
    displayName: "Local Registry",
    localPath: path.join(root, `registry-${index}`),
  }));
  await writeCanonical(vaultRoot, sources);
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }), /reference limit/i);
});

test("rejects duplicate configured source IDs and unknown nested source fields", async (t) => {
  const { root, vaultRoot, localPath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = localSource(localPath);
  await writeCanonical(vaultRoot, [source, { ...source, displayName: "Second Registry" }]);
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }), /duplicate Registry source id/i);
  await writeCanonical(vaultRoot, [{ ...source, metadata: { note: "unexpected" } }]);
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }), /unknown fields/i);
});

test("distinguishes a missing parent from a non-directory parent and detects later appearance", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const missingVault = path.join(root, "not-created", "nested", "vault");
  const absent = await readRegistrySourceArtifactReferences({ vaultRoot: missingVault });
  assert.equal(absent.references.length, 1);
  assert.equal(await absent.assertCurrent(), true);
  await writeCanonical(missingVault);
  await assert.rejects(absent.assertCurrent(), /changed/i);

  const blocker = path.join(root, "regular-file");
  await writeFile(blocker, "not a directory");
  await assert.rejects(
    readRegistrySourceArtifactReferences({ vaultRoot: path.join(blocker, "vault") }),
    /parent is unavailable/i,
  );
});

test("assertCurrent detects same-byte index touches and replacement of a referenced local directory", async (t) => {
  const { root, vaultRoot, localPath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCanonical(vaultRoot, [localSource(localPath)]);
  const filePath = ownerVaultRegistrySourcesPath(vaultRoot);
  const indexCapture = await readRegistrySourceArtifactReferences({ vaultRoot });
  await utimes(filePath, new Date("2035-01-01T00:00:00Z"), new Date("2035-01-01T00:00:00Z"));
  await assert.rejects(indexCapture.assertCurrent(), /changed/i);

  const directoryCapture = await readRegistrySourceArtifactReferences({ vaultRoot });
  await rename(localPath, path.join(root, "original-local-registry"));
  await mkdir(localPath);
  await assert.rejects(directoryCapture.assertCurrent(), /directory changed/i);
});

test("rejects a junction in the sources.json parent chain", async (t) => {
  const { root, vaultRoot } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = path.join(root, "outside-registry-sources");
  await mkdir(outside);
  await writeFile(path.join(outside, "sources.json"), `${JSON.stringify({ schemaVersion: 1, sources: [] }, null, 2)}\n`);
  await mkdir(vaultRoot);
  try {
    await symlink(outside, path.join(vaultRoot, "registry-sources"), "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error?.code)) {
      return t.skip(`Directory junction creation unavailable: ${error.code}`);
    }
    throw error;
  }
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }), /parent is unavailable/i);
});

test("rejects remote sources, linked source paths, and hardlinked or replaced index files", async (t) => {
  const { root, vaultRoot, localPath } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = await writeCanonical(vaultRoot, [localSource(localPath)]);
  const bytes = await readFile(filePath);
  const remote = { id: "io.sps.remote", kind: "official", displayName: "Remote", indexUrl: "https://example.test", trustedRoot: { keyId: "ed25519:key", publicKey: "key" } };
  await writeCanonical(vaultRoot, [remote]);
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }));
  await writeCanonical(vaultRoot, [localSource(path.join(root, "missing"))]);
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }), /directory|ENOENT/i);

  const linked = path.join(root, "linked-registry");
  await symlink(localPath, linked, "junction");
  await writeCanonical(vaultRoot, [localSource(linked)]);
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }), /parent|directory|canonical/i);

  await writeCanonical(vaultRoot, [localSource(localPath)]);
  const captured = await readRegistrySourceArtifactReferences({ vaultRoot });
  await rename(filePath, path.join(root, "old-sources.json"));
  await writeFile(filePath, bytes);
  await assert.rejects(captured.assertCurrent(), /changed/i);

  const hardlinked = await readRegistrySourceArtifactReferences({ vaultRoot });
  await link(filePath, path.join(root, "alias-sources.json"));
  await assert.rejects(hardlinked.assertCurrent(), /unavailable/i);
  await assert.rejects(readRegistrySourceArtifactReferences({ vaultRoot }), /unavailable/i);
});
