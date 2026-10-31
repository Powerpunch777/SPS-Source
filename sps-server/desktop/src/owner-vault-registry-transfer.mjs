import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { validateStaticPluginManifest } from "@sonparkserver/plugin-sdk/registry/static-package-manifest-v1.mjs";

const INDEX_RELATIVE_PATH = "registry-staging/registry-stages.json";
const PACKAGES_RELATIVE_PATH = "registry-staging/packages";
const PORTABLE_PACKAGES_ROOT = "packages";
const STAGE_FIELDS = new Set([
  "stageId", "pluginId", "version", "packageName", "packageRoot", "artifactSha256",
  "staticManifest", "source", "status", "review", "stagedAt",
]);

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeBundlePath(value) {
  return value.split(path.sep).join("/");
}

function assertRegularUnlinkedFile(stat, target) {
  if (!stat.isFile() || stat.isSymbolicLink() || (Number.isInteger(stat.nlink) && stat.nlink !== 1)) {
    throw new Error(`SPS Registry transfer requires regular, unlinked files: ${target}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function expectedStageId(stage) {
  return sha256(`${stage.pluginId}\n${stage.version}\n${stage.artifactSha256}`).slice(0, 32);
}

function parseIndex(text) {
  let index;
  try {
    index = JSON.parse(text);
  } catch {
    throw new Error("SPS Registry staging index is not valid JSON.");
  }
  if (!Array.isArray(index)) throw new Error("SPS Registry staging index must be an array.");
  return index;
}

function safeRelativePackagePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")
    || value.includes("\0") || value.includes(":") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return null;
  const parts = value.split("/");
  if (parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) return null;
  if (parts[0] !== PORTABLE_PACKAGES_ROOT) return null;
  return parts.slice(1).join(path.sep);
}

function assertStageShape(stage) {
  if (!stage || typeof stage !== "object" || Array.isArray(stage)
    || Object.keys(stage).some((key) => !STAGE_FIELDS.has(key))
    || typeof stage.stageId !== "string" || !/^[a-f0-9]{32}$/.test(stage.stageId)
    || typeof stage.pluginId !== "string" || !stage.pluginId.trim() || stage.pluginId.length > 128
    || typeof stage.version !== "string" || !stage.version.trim() || stage.version.length > 128
    || typeof stage.packageName !== "string" || !stage.packageName.trim() || stage.packageName.length > 214
    || typeof stage.packageRoot !== "string" || !stage.packageRoot.trim()
    || typeof stage.artifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(stage.artifactSha256)
    || !stage.staticManifest || typeof stage.staticManifest !== "object" || Array.isArray(stage.staticManifest)
    || !stage.source || typeof stage.source !== "object" || Array.isArray(stage.source)
    || typeof stage.source.registryId !== "string" || !stage.source.registryId.trim() || stage.source.registryId.length > 128
    || !["local", "git", "official"].includes(stage.source.kind)
    || typeof stage.source.releaseLocator !== "string" || !stage.source.releaseLocator.trim() || stage.source.releaseLocator.length > 2048
    || !["staged", "review_pending", "registered"].includes(stage.status)
    || (stage.review !== null && (!stage.review || typeof stage.review !== "object" || Array.isArray(stage.review)))
    || typeof stage.stagedAt !== "string" || stage.stagedAt.length > 64
    || !Number.isFinite(Date.parse(stage.stagedAt)) || new Date(stage.stagedAt).toISOString() !== stage.stagedAt
    || stage.stageId !== expectedStageId(stage)
    || stage.staticManifest.plugin?.id !== stage.pluginId
    || stage.staticManifest.plugin?.version !== stage.version) {
    throw new Error("SPS Registry staging index contains an invalid stage record.");
  }
  const validation = validateStaticPluginManifest(stage.staticManifest);
  if (!validation.valid) throw new Error(`SPS Registry stage static manifest is invalid: ${validation.errors.join(" ")}`);
}

function portableStage(stage, packageRoot) {
  return {
    stageId: stage.stageId,
    pluginId: stage.pluginId,
    version: stage.version,
    packageName: stage.packageName,
    packageRoot,
    artifactSha256: stage.artifactSha256,
    staticManifest: {
      schemaVersion: stage.staticManifest.schemaVersion,
      plugin: {
        id: stage.staticManifest.plugin.id,
        version: stage.staticManifest.plugin.version,
        apiVersion: stage.staticManifest.plugin.apiVersion,
      },
      runtime: {
        manifestEntry: stage.staticManifest.runtime.manifestEntry,
        manifestSha256: stage.staticManifest.runtime.manifestSha256,
      },
      capabilities: [...stage.staticManifest.capabilities],
      permissionsDigest: stage.staticManifest.permissionsDigest,
    },
    source: {
      registryId: "sps.owner.transfer",
      kind: "local",
      releaseLocator: `restored-transfer/${stage.stageId}`,
    },
    status: "staged",
    review: null,
    stagedAt: stage.stagedAt,
  };
}

function assertPortableStage(stage) {
  assertStageShape(stage);
  if (stage.status !== "staged" || stage.review !== null
    || stage.source.registryId !== "sps.owner.transfer" || stage.source.kind !== "local"
    || stage.source.releaseLocator !== `restored-transfer/${stage.stageId}`
    || Object.keys(stage.source).length !== 3) {
    throw new Error("SPS Registry transfer index contains a non-portable or trusted stage.");
  }
}

async function lstatPathIfPresent(target, fsApi) {
  try {
    return await fsApi.lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertVaultPath(vaultRoot, relativePath, expectedKind, fsApi, { optional = false } = {}) {
  const root = path.resolve(vaultRoot);
  const rootStat = await lstatPathIfPresent(root, fsApi);
  if (!rootStat) {
    if (optional) return null;
    throw new Error(`SPS Registry Owner Vault does not exist: ${root}`);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("SPS Registry transfer refuses an unsafe Owner Vault root.");
  const realRoot = await fsApi.realpath(root);
  let current = root;
  const components = relativePath ? relativePath.split(/[\\/]/) : [];
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    const stat = await lstatPathIfPresent(current, fsApi);
    if (!stat) {
      if (optional) return null;
      throw new Error(`SPS Registry transfer path does not exist: ${current}`);
    }
    if (stat.isSymbolicLink()) throw new Error(`SPS Registry transfer refuses symbolic links or reparse points: ${current}`);
    if (index < components.length - 1 && !stat.isDirectory()) throw new Error(`SPS Registry transfer path is not a directory: ${current}`);
    const realCurrent = await fsApi.realpath(current);
    if (!inside(realRoot, realCurrent)) throw new Error("SPS Registry path escapes the current Owner Vault.");
    if (index === components.length - 1) {
      if (expectedKind === "directory" && !stat.isDirectory()) throw new Error(`SPS Registry path is not a directory: ${current}`);
      if (expectedKind === "file") assertRegularUnlinkedFile(stat, current);
    }
  }
  return { path: current, stat: components.length ? await fsApi.lstat(current) : rootStat, realRoot };
}

async function collectTreeFiles(root, fsApi, relative = "") {
  const target = relative ? path.join(root, relative) : root;
  const stat = await fsApi.lstat(target);
  if (stat.isSymbolicLink()) throw new Error(`SPS Registry transfer refuses symbolic links or reparse points: ${target}`);
  if (!stat.isDirectory()) throw new Error(`SPS Registry package path is not a directory: ${target}`);
  const files = [];
  for (const entry of await fsApi.readdir(target, { withFileTypes: true })) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    const childPath = path.join(root, childRelative);
    const childStat = await fsApi.lstat(childPath);
    if (childStat.isSymbolicLink()) throw new Error(`SPS Registry transfer refuses symbolic links or reparse points: ${childPath}`);
    if (childStat.isDirectory()) {
      files.push(...await collectTreeFiles(root, fsApi, childRelative));
    } else {
      assertRegularUnlinkedFile(childStat, childPath);
      files.push(childRelative);
    }
  }
  return files;
}

async function makeInventory(bundleRoot, fsApi) {
  const inventory = [];
  for (const relativePath of [PACKAGES_RELATIVE_PATH, INDEX_RELATIVE_PATH]) {
    const target = path.join(bundleRoot, relativePath);
    const stat = await lstatPathIfPresent(target, fsApi);
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error(`SPS Registry transfer refuses symbolic links or reparse points: ${target}`);
    if (relativePath === INDEX_RELATIVE_PATH) {
      assertRegularUnlinkedFile(stat, target);
      const bytes = await fsApi.readFile(target);
      inventory.push({ path: relativePath, sizeBytes: bytes.length, sha256: sha256(bytes) });
      continue;
    }
    for (const file of await collectTreeFiles(target, fsApi)) {
      const filePath = path.join(target, file);
      const fileStat = await fsApi.lstat(filePath);
      assertRegularUnlinkedFile(fileStat, filePath);
      const bytes = await fsApi.readFile(filePath);
      inventory.push({
        path: normalizeBundlePath(path.join(relativePath, file)),
        sizeBytes: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }
  return inventory.sort((left, right) => codepointCompare(left.path, right.path));
}

async function assertOwnedPackageRoot(vaultRoot, packageRoot, fsApi) {
  const packagesPath = await assertVaultPath(vaultRoot, PACKAGES_RELATIVE_PATH, "directory", fsApi);
  const packagesRoot = packagesPath.path;
  const candidate = path.resolve(packageRoot);
  const relative = path.relative(packagesRoot, candidate);
  if (!relative || !inside(packagesRoot, candidate) || relative.split(path.sep).some((part) => !part || part === "." || part === "..")) {
    throw new Error("SPS Registry stage packageRoot is outside the current Owner Vault package directory.");
  }
  let current = packagesRoot;
  for (const component of relative.split(path.sep)) {
    if (!(await fsApi.readdir(current)).includes(component)) throw new Error("SPS Registry stage packageRoot uses a path alias.");
    current = path.join(current, component);
    const stat = await fsApi.lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`SPS Registry transfer refuses symbolic links or reparse points: ${current}`);
    if (!stat.isDirectory()) throw new Error("SPS Registry stage packageRoot is not a directory.");
    if (!inside(packagesPath.realRoot, await fsApi.realpath(current))) {
      throw new Error("SPS Registry stage packageRoot escapes the current Owner Vault package directory.");
    }
  }
  return { candidate, relative, portable: `${PORTABLE_PACKAGES_ROOT}/${normalizeBundlePath(relative)}` };
}

export async function exportSpsOwnerVaultRegistryTransfer({ vaultRoot, bundleRoot, fsApi = fs } = {}) {
  if (!vaultRoot || !bundleRoot) throw new Error("SPS Registry transfer paths are required.");
  const packagesSource = await assertVaultPath(vaultRoot, PACKAGES_RELATIVE_PATH, "directory", fsApi, { optional: true });
  const indexSource = await assertVaultPath(vaultRoot, INDEX_RELATIVE_PATH, "file", fsApi, { optional: true });
  let hasPackages = false;
  if (packagesSource) {
    await collectTreeFiles(packagesSource.path, fsApi);
    await fsApi.cp(packagesSource.path, path.join(path.resolve(bundleRoot), PACKAGES_RELATIVE_PATH), {
      recursive: true,
      errorOnExist: true,
    });
    hasPackages = true;
  }

  let hasIndex = false;
  if (indexSource) {
    const stages = parseIndex(await fsApi.readFile(indexSource.path, "utf8"));
    const stageIds = new Set();
    const portableStages = [];
    for (const stage of stages) {
      assertStageShape(stage);
      if (stageIds.has(stage.stageId)) throw new Error("SPS Registry staging index contains duplicate stage ids.");
      stageIds.add(stage.stageId);
      const owned = await assertOwnedPackageRoot(vaultRoot, stage.packageRoot, fsApi);
      if (!hasPackages) throw new Error("SPS Registry stage package directory is missing.");
      portableStages.push(portableStage(stage, owned.portable));
    }
    const portableIndexPath = path.join(path.resolve(bundleRoot), INDEX_RELATIVE_PATH);
    await fsApi.mkdir(path.dirname(portableIndexPath), { recursive: true });
    await fsApi.writeFile(portableIndexPath, `${JSON.stringify(portableStages, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    hasIndex = true;
  }

  return {
    included: [
      ...(hasPackages ? [PACKAGES_RELATIVE_PATH] : []),
      ...(hasIndex ? [INDEX_RELATIVE_PATH] : []),
    ],
    inventory: await makeInventory(path.resolve(bundleRoot), fsApi),
  };
}

export async function inspectSpsOwnerVaultRegistryTransfer({ bundleRoot, inventory, fsApi = fs } = {}) {
  if (!Array.isArray(inventory) || inventory.some((entry) => !entry || typeof entry !== "object"
    || typeof entry.path !== "string" || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0
    || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256))) {
    throw new Error("SPS transfer has an invalid Registry file inventory.");
  }
  const expectedPaths = new Set();
  for (const entry of inventory) {
    if ((!entry.path.startsWith(`${PACKAGES_RELATIVE_PATH}/`) && entry.path !== INDEX_RELATIVE_PATH)
      || entry.path.includes("\\") || entry.path.includes("\0") || entry.path.includes(":")
      || entry.path.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("SPS transfer has an invalid Registry inventory path.");
    }
    const key = entry.path.toLowerCase();
    if (expectedPaths.has(key)) throw new Error("SPS transfer has a duplicate Registry inventory path.");
    expectedPaths.add(key);
  }
  const expectedInventory = [...inventory].sort((left, right) => codepointCompare(left.path, right.path));
  const actual = await makeInventory(path.resolve(bundleRoot), fsApi);
  if (actual.length !== expectedInventory.length || actual.some((entry, index) => {
    const expected = expectedInventory[index];
    return !expected || entry.path !== expected.path || entry.sizeBytes !== expected.sizeBytes || entry.sha256 !== expected.sha256;
  })) throw new Error("SPS transfer Registry package or index checksum does not match its manifest.");

  if (expectedPaths.has(INDEX_RELATIVE_PATH.toLowerCase())) {
    const stages = parseIndex(await fsApi.readFile(path.join(path.resolve(bundleRoot), INDEX_RELATIVE_PATH), "utf8"));
    const stageIds = new Set();
    for (const stage of stages) {
      assertPortableStage(stage);
      if (stageIds.has(stage.stageId)) throw new Error("SPS Registry staging index contains duplicate stage ids.");
      stageIds.add(stage.stageId);
      const relative = safeRelativePackagePath(stage.packageRoot);
      if (!relative) throw new Error("SPS transfer Registry packageRoot is not a safe portable path.");
      const packagesRoot = path.resolve(path.join(path.resolve(bundleRoot), PACKAGES_RELATIVE_PATH));
      const target = path.resolve(packagesRoot, relative);
      if (!inside(packagesRoot, target)) throw new Error("SPS transfer Registry packageRoot escapes its package directory.");
      const stat = await fsApi.lstat(target);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("SPS transfer Registry packageRoot is not a regular directory.");
      if (!inside(await fsApi.realpath(packagesRoot), await fsApi.realpath(target))) {
        throw new Error("SPS transfer Registry packageRoot escapes its package directory.");
      }
    }
  }
  return actual;
}

export async function rebaseRestoredRegistryStages({ vaultRoot, destinationVaultRoot, fsApi = fs } = {}) {
  if (!vaultRoot || !destinationVaultRoot) throw new Error("SPS Registry restore rebase paths are required.");
  const indexEntry = await assertVaultPath(vaultRoot, INDEX_RELATIVE_PATH, "file", fsApi, { optional: true });
  if (!indexEntry) return { indexPath: path.join(path.resolve(vaultRoot), INDEX_RELATIVE_PATH), stages: 0 };

  const stages = parseIndex(await fsApi.readFile(indexEntry.path, "utf8"));
  const packagesEntry = stages.length
    ? await assertVaultPath(vaultRoot, PACKAGES_RELATIVE_PATH, "directory", fsApi)
    : null;
  const rebased = [];
  for (const stage of stages) {
    assertPortableStage(stage);
    const relative = safeRelativePackagePath(stage.packageRoot);
    if (!relative) throw new Error("SPS Registry restored packageRoot is not a safe portable path.");
    const sourcePath = path.resolve(packagesEntry.path, relative);
    if (!inside(packagesEntry.path, sourcePath)) throw new Error("SPS Registry restored packageRoot escapes its package directory.");
    let current = packagesEntry.path;
    for (const component of relative.split(path.sep)) {
      if (!(await fsApi.readdir(current)).includes(component)) throw new Error("SPS Registry restored packageRoot uses a path alias.");
      current = path.join(current, component);
      const stat = await fsApi.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`SPS Registry transfer refuses symbolic links or reparse points: ${current}`);
      if (!stat.isDirectory() || !inside(packagesEntry.realRoot, await fsApi.realpath(current))) {
        throw new Error("SPS Registry restored package is not contained in its staging Vault.");
      }
    }
    await collectTreeFiles(sourcePath, fsApi);
    rebased.push({ ...stage, packageRoot: path.join(path.resolve(destinationVaultRoot), PACKAGES_RELATIVE_PATH, relative) });
  }
  await fsApi.writeFile(indexEntry.path, `${JSON.stringify(rebased, null, 2)}\n`, "utf8");
  return { indexPath: indexEntry.path, stages: rebased.length };
}
