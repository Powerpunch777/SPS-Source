import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveDeveloperPackageArtifact } from "../src/developer-package-artifact.mjs";

const BUILD_ID = "build-11111111-1111-4111-8111-111111111111";
const LINK_UNAVAILABLE_CODES = new Set(["EACCES", "EINVAL", "EPERM", "ENOTSUP", "UNKNOWN"]);

async function fixture(content = Buffer.from("verified developer package archive")) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-developer-artifact-"));
  const vaultRoot = path.join(root, "OwnerVault");
  const buildsPath = path.join(vaultRoot, "developer-mode", "builds");
  await mkdir(buildsPath, { recursive: true });
  const sha256 = createHash("sha256").update(content).digest("hex");
  const archiveRelativePath = `developer-mode/builds/${sha256}.spsplugin`;
  const archivePath = path.join(vaultRoot, ...archiveRelativePath.split("/"));
  await writeFile(archivePath, content);
  const build = {
    buildId: BUILD_ID,
    deployment: { artifactSha256: sha256, archiveRelativePath },
  };
  return { root, vaultRoot, buildsPath, archivePath, content, build, sha256, archiveRelativePath };
}

async function withFixture(run, content) {
  const current = await fixture(content);
  try {
    await run(current);
  } finally {
    await rm(current.root, { recursive: true, force: true });
  }
}

async function createDirectoryLinkOrSkip(t, target, linkPath) {
  try {
    await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (LINK_UNAVAILABLE_CODES.has(error.code)) {
      t.skip(`Directory symlinks/junctions are unavailable: ${error.code}`);
      return false;
    }
    throw error;
  }
  return true;
}

test("resolves a nonempty archive only after streaming and verifying its SHA-256", async () => {
  await withFixture(async ({ vaultRoot, build, archivePath, sha256, content }) => {
    const result = await resolveDeveloperPackageArtifact({ vaultRoot, build });
    assert.deepEqual(result, {
      archivePath,
      fileName: `${sha256}.spsplugin`,
      sha256,
      sizeBytes: content.length,
      buildId: BUILD_ID,
    });
  });
});

test("rejects stale fingerprints and archive paths that differ from the exact expected path", async () => {
  await withFixture(async ({ vaultRoot, build, archivePath, sha256 }) => {
    await writeFile(archivePath, "stale bytes with the original recorded digest");
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build }), /fingerprint does not match/);
    await assert.rejects(resolveDeveloperPackageArtifact({
      vaultRoot,
      build: { ...build, deployment: { ...build.deployment, artifactSha256: "0".repeat(64) } },
    }), /path does not match/);
    await assert.rejects(resolveDeveloperPackageArtifact({
      vaultRoot,
      build: { ...build, deployment: { ...build.deployment, archiveRelativePath: `developer-mode/builds/../${sha256}.spsplugin` } },
    }), /path does not match/);
    await assert.rejects(resolveDeveloperPackageArtifact({
      vaultRoot,
      build: { ...build, deployment: { ...build.deployment, archiveRelativePath: `developer-mode/builds/${sha256.toUpperCase()}.spsplugin` } },
    }), /path does not match/);
  });
});

test("rejects malformed build IDs and non-lowercase or malformed fingerprints", async () => {
  await withFixture(async ({ vaultRoot, build, sha256 }) => {
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build: { ...build, buildId: "build-not-a-uuid" } }), /build ID/);
    await assert.rejects(resolveDeveloperPackageArtifact({
      vaultRoot,
      build: { ...build, deployment: { ...build.deployment, artifactSha256: sha256.toUpperCase() } },
    }), /fingerprint/);
    await assert.rejects(resolveDeveloperPackageArtifact({
      vaultRoot,
      build: { ...build, deployment: { ...build.deployment, artifactSha256: "f".repeat(63) } },
    }), /fingerprint/);
  });
});

test("rejects a missing vault root or missing artifact parents", async () => {
  await withFixture(async ({ root, vaultRoot, build }) => {
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot: path.join(root, "missing"), build }));
    await rm(path.join(vaultRoot, "developer-mode", "builds"), { recursive: true });
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build }));
  });
});

test("rejects empty artifacts and directories in place of regular files", async () => {
  await withFixture(async ({ vaultRoot, archivePath, build }) => {
    await writeFile(archivePath, Buffer.alloc(0));
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build }), /must not be empty/);
    await rm(archivePath);
    await mkdir(archivePath);
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build }), /regular file/);
  });
});

test("rejects artifacts larger than 512 MiB before reading their contents", async () => {
  await withFixture(async ({ vaultRoot, archivePath, build }) => {
    const file = await fs.open(archivePath, "r+");
    try {
      await file.truncate(512 * 1024 * 1024 + 1);
    } finally {
      await file.close();
    }
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build }), /exceeds 512 MiB/);
  });
});

test("rejects a symlink or junction used as the artifact file", async t => {
  await withFixture(async ({ root, vaultRoot, archivePath, build }) => {
    const targetPath = path.join(root, "outside.spsplugin");
    await writeFile(targetPath, "outside target");
    await rm(archivePath);
    try {
      await symlink(targetPath, archivePath, "file");
    } catch (error) {
      if (LINK_UNAVAILABLE_CODES.has(error.code)) {
        t.skip(`File symlinks are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build }), /regular file/);
  });
});

test("rejects symlinked or junctioned artifact parents, including an escaping builds directory", async t => {
  await withFixture(async ({ root, vaultRoot, buildsPath, archivePath, build }) => {
    const outsideBuilds = path.join(root, "outside-builds");
    await mkdir(outsideBuilds);
    await writeFile(path.join(outsideBuilds, path.basename(archivePath)), "outside target");
    await rm(buildsPath, { recursive: true });
    if (!await createDirectoryLinkOrSkip(t, outsideBuilds, buildsPath)) return;
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build }), /real directory|escapes/);
  });
});

test("rejects a symlinked or junctioned developer-mode parent", async t => {
  await withFixture(async ({ root, vaultRoot, archivePath, build }) => {
    const outsideDeveloperMode = path.join(root, "outside-developer-mode");
    const outsideBuilds = path.join(outsideDeveloperMode, "builds");
    await mkdir(outsideBuilds, { recursive: true });
    await writeFile(path.join(outsideBuilds, path.basename(archivePath)), "outside target");
    await rm(path.join(vaultRoot, "developer-mode"), { recursive: true });
    if (!await createDirectoryLinkOrSkip(t, outsideDeveloperMode, path.join(vaultRoot, "developer-mode"))) return;
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot, build }), /real directory|escapes/);
  });
});

test("rejects a vault root that is itself a symlink or junction", async t => {
  await withFixture(async ({ root, vaultRoot, build }) => {
    const rootAlias = path.join(root, "vault-alias");
    if (!await createDirectoryLinkOrSkip(t, vaultRoot, rootAlias)) return;
    await assert.rejects(resolveDeveloperPackageArtifact({ vaultRoot: rootAlias, build }), /real directory/);
  });
});
