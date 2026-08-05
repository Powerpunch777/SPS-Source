import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_REVISION = /^[0-9a-f]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const PROFILE_VERSION = /^\d+\.\d+$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${filePath} is not valid JSON.`);
    throw error;
  }
}

async function gitOutput(repositoryRoot, args) {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", `safe.directory=${repositoryRoot}`, "-C", repositoryRoot, ...args],
    { encoding: "utf8", windowsHide: true },
  );
  return stdout.trim();
}

async function gitDiffHasChanges(repositoryRoot, args) {
  try {
    await gitOutput(repositoryRoot, args);
    return false;
  } catch (error) {
    if (error?.code === 1) return true;
    throw error;
  }
}

// Windows may materialize a tracked LF file with CRLF line endings. A release
// must reject real source changes, but not fail only because Git's checkout
// conversion made an otherwise identical public SDK look modified.
async function gitWorkingTreeIsDirty(repositoryRoot) {
  const [unstaged, staged, untracked] = await Promise.all([
    gitDiffHasChanges(repositoryRoot, ["diff", "--quiet", "--ignore-space-at-eol"]),
    gitDiffHasChanges(repositoryRoot, ["diff", "--cached", "--quiet", "--ignore-space-at-eol"]),
    gitOutput(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return unstaged || staged || untracked.length > 0;
}

export function validateSpsSupportMatrix(matrix) {
  const errors = [];
  const candidate = matrix?.candidate;
  if (matrix?.schemaVersion !== 1) errors.push("Support matrix schemaVersion must be 1.");
  if (!isPlainObject(candidate)) return [...errors, "Support matrix candidate is required."];
  if (candidate.status !== "development-candidate") errors.push("Support matrix candidate status must be development-candidate.");
  if (!SEMVER.test(candidate.desktopVersion ?? "")) errors.push("Support matrix desktopVersion must be SemVer.");
  if (candidate.core?.repository !== "Powerpunch777/SPS-Core") errors.push("Support matrix must use the official SPS Core repository.");
  if (!GIT_REVISION.test(candidate.core?.revision ?? "")) errors.push("Support matrix core revision must be a full Git revision.");
  if (candidate.pluginSdk?.repository !== "Powerpunch777/sps-plugin-sdk") {
    errors.push("Support matrix must use the official SPS Plugin SDK repository.");
  }
  if (!GIT_REVISION.test(candidate.pluginSdk?.revision ?? "")) {
    errors.push("Support matrix plugin SDK revision must be a full Git revision.");
  }
  if (candidate.pluginSdk?.package !== "@sonparkserver/plugin-sdk") {
    errors.push("Support matrix plugin SDK package is invalid.");
  }
  if (!SEMVER.test(candidate.pluginSdk?.version ?? "")) {
    errors.push("Support matrix plugin SDK version must be SemVer.");
  }
  if (!PROFILE_VERSION.test(candidate.extensionProfile?.version ?? "")) errors.push("Support matrix default extension profile version is invalid.");
  if (!Number.isSafeInteger(candidate.extensionProfile?.pluginApi) || candidate.extensionProfile.pluginApi < 1) {
    errors.push("Support matrix plugin API must be a positive integer.");
  }
  const extensionProfiles = Array.isArray(candidate.extensionProfiles)
    ? candidate.extensionProfiles
    : [candidate.extensionProfile?.version];
  if (extensionProfiles.length === 0 || extensionProfiles.some((version) => !PROFILE_VERSION.test(version ?? ""))) {
    errors.push("Support matrix extensionProfiles must contain valid profile versions.");
  }
  if (new Set(extensionProfiles).size !== extensionProfiles.length) {
    errors.push("Support matrix extensionProfiles must not contain duplicates.");
  }
  if (!extensionProfiles.includes(candidate.extensionProfile?.version)) {
    errors.push("Support matrix default extension profile must be included in extensionProfiles.");
  }
  if (candidate.update?.channel !== "latest") errors.push("The unified SPS Desktop must use the latest update channel.");
  if (candidate.update?.trust !== "official-release") errors.push("The SPS Desktop update trust must be official-release.");
  if (candidate.update?.repository !== "Powerpunch777/SPS-Desktop-Releases") {
    errors.push("The SPS Desktop update repository is invalid.");
  }
  if (!Array.isArray(candidate.platform?.operatingSystems) || candidate.platform.operatingSystems.length === 0) {
    errors.push("Support matrix operating systems are required.");
  }
  if (candidate.platform?.remoteTransport !== "tailscale") errors.push("The first SPS release requires Tailscale.");
  if (candidate.platform?.minimumRemoteTransportVersion !== "1.52.0") {
    errors.push("The first SPS release requires Tailscale 1.52.0 or later.");
  }
  if (!Array.isArray(candidate.bundledExtensions)) {
    errors.push("Support matrix bundledExtensions must be an array.");
  } else {
    const ids = new Set();
    for (const extension of candidate.bundledExtensions) {
      if (!extension?.id || ids.has(extension.id)) errors.push("Bundled extension ids must be unique and non-empty.");
      ids.add(extension?.id);
      if (!extension?.package) errors.push(`Bundled extension ${extension?.id ?? "unknown"} is missing its package name.`);
      if (!SEMVER.test(extension?.version ?? "")) errors.push(`Bundled extension ${extension?.id ?? "unknown"} has an invalid version.`);
      if (!PROFILE_VERSION.test(extension?.profile ?? "")) errors.push(`Bundled extension ${extension?.id ?? "unknown"} has an invalid profile version.`);
      if (!Number.isSafeInteger(extension?.pluginApi) || extension.pluginApi < 1) {
        errors.push(`Bundled extension ${extension?.id ?? "unknown"} has an invalid plugin API.`);
      }
    }
  }
  return errors;
}

export async function resolveSpsReleaseBaseline({
  workspaceRoot,
  desktopRoot,
  spsServerRoot,
  coreRoot,
  pluginSdkRoot = path.join(workspaceRoot, "external", "sps-plugin-sdk"),
  environment = process.env,
  builtAt = new Date().toISOString(),
} = {}) {
  const supportMatrixPath = path.join(spsServerRoot, "release", "support-matrix.json");
  const desktopPackagePath = path.join(desktopRoot, "package.json");
  const [matrix, desktopPackage, pluginSdkPackage] = await Promise.all([
    readJson(supportMatrixPath),
    readJson(desktopPackagePath),
    readJson(path.join(pluginSdkRoot, "package.json")),
  ]);
  const errors = validateSpsSupportMatrix(matrix);
  const candidate = matrix.candidate;

  if (desktopPackage.version !== candidate.desktopVersion) {
    errors.push(`Desktop package version ${desktopPackage.version} does not match support matrix ${candidate.desktopVersion}.`);
  }

  const trackedCore = await gitOutput(workspaceRoot, ["ls-files", "--stage", "--", "external/sps-core"]);
  const trackedCoreMatch = trackedCore.match(/^160000\s+([0-9a-f]{40})\s+\d+\s+external\/sps-core$/);
  if (!trackedCoreMatch) {
    errors.push("The SPS Core Git submodule pin could not be resolved.");
  } else if (trackedCoreMatch[1] !== candidate.core.revision) {
    errors.push(`Tracked SPS Core ${trackedCoreMatch[1]} does not match support matrix ${candidate.core.revision}.`);
  }

  let checkedOutCoreRevision = environment.SPS_CORE_REVISION?.trim() || "";
  if (!checkedOutCoreRevision) checkedOutCoreRevision = await gitOutput(coreRoot, ["rev-parse", "HEAD"]);
  if (checkedOutCoreRevision !== candidate.core.revision) {
    errors.push(`Checked-out SPS Core ${checkedOutCoreRevision || "unknown"} does not match support matrix ${candidate.core.revision}.`);
  }
  const coreDirty = await gitWorkingTreeIsDirty(coreRoot);
  if (coreDirty && environment.SPS_REQUIRE_CLEAN_RELEASE === "1") {
    errors.push("SPS Core contains uncommitted changes. Refusing to create an official release baseline.");
  }

  const trackedPluginSdk = await gitOutput(workspaceRoot, ["ls-files", "--stage", "--", "external/sps-plugin-sdk"]);
  const trackedPluginSdkMatch = trackedPluginSdk.match(/^160000\s+([0-9a-f]{40})\s+\d+\s+external\/sps-plugin-sdk$/);
  if (!trackedPluginSdkMatch) {
    errors.push("The SPS Plugin SDK Git submodule pin could not be resolved.");
  } else if (trackedPluginSdkMatch[1] !== candidate.pluginSdk.revision) {
    errors.push(`Tracked SPS Plugin SDK ${trackedPluginSdkMatch[1]} does not match support matrix ${candidate.pluginSdk.revision}.`);
  }

  let checkedOutPluginSdkRevision = environment.SPS_PLUGIN_SDK_REVISION?.trim() || "";
  if (!checkedOutPluginSdkRevision) checkedOutPluginSdkRevision = await gitOutput(pluginSdkRoot, ["rev-parse", "HEAD"]);
  if (checkedOutPluginSdkRevision !== candidate.pluginSdk.revision) {
    errors.push(`Checked-out SPS Plugin SDK ${checkedOutPluginSdkRevision || "unknown"} does not match support matrix ${candidate.pluginSdk.revision}.`);
  }
  if (pluginSdkPackage.name !== candidate.pluginSdk.package) {
    errors.push(`SPS Plugin SDK package ${pluginSdkPackage.name ?? "unknown"} does not match support matrix ${candidate.pluginSdk.package}.`);
  }
  if (pluginSdkPackage.version !== candidate.pluginSdk.version) {
    errors.push(`SPS Plugin SDK version ${pluginSdkPackage.version ?? "unknown"} does not match support matrix ${candidate.pluginSdk.version}.`);
  }
  const pluginSdkDirty = await gitWorkingTreeIsDirty(pluginSdkRoot);
  if (pluginSdkDirty && environment.SPS_REQUIRE_CLEAN_RELEASE === "1") {
    errors.push("SPS Plugin SDK contains uncommitted changes. Refusing to create an official release baseline.");
  }

  for (const extension of candidate.bundledExtensions) {
    const manifest = await readJson(path.join(spsServerRoot, extension.package, "package.json"));
    if (manifest.version !== extension.version) {
      errors.push(`${extension.package} version ${manifest.version} does not match support matrix ${extension.version}.`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));

  let sourceRevision = environment.SPS_SOURCE_REVISION?.trim() || environment.GITHUB_SHA?.trim() || "";
  if (!sourceRevision) sourceRevision = await gitOutput(workspaceRoot, ["rev-parse", "HEAD"]);
  requireValue(GIT_REVISION.test(sourceRevision), "SPS source revision must be a full Git revision.");
  const sourceDirty = await gitWorkingTreeIsDirty(workspaceRoot);
  if (sourceDirty && environment.SPS_REQUIRE_CLEAN_RELEASE === "1") {
    throw new Error("SPS source contains uncommitted changes. Refusing to create an official release baseline.");
  }
  const releaseStatus = environment.SPS_RELEASE_STATUS?.trim() || candidate.status;
  requireValue(
    releaseStatus === "development-candidate" || releaseStatus === "stable",
    "SPS release status must be development-candidate or stable.",
  );
  if (releaseStatus === "stable") {
    requireValue(environment.SPS_REQUIRE_CLEAN_RELEASE === "1", "A stable SPS baseline requires the clean-release gate.");
    requireValue(!sourceDirty, "A stable SPS baseline cannot include dirty SPS source.");
    requireValue(!coreDirty, "A stable SPS baseline cannot include a dirty Core.");
    requireValue(!pluginSdkDirty, "A stable SPS baseline cannot include a dirty Plugin SDK.");
  }

  return {
    schemaVersion: 1,
    product: "SPS Desktop",
    status: releaseStatus,
    desktopVersion: candidate.desktopVersion,
    sourceRevision,
    sourceDirty,
    core: { ...candidate.core, dirty: coreDirty },
    pluginSdk: { ...candidate.pluginSdk, dirty: pluginSdkDirty },
    extensionProfile: { ...candidate.extensionProfile },
    extensionProfiles: [...(candidate.extensionProfiles ?? [candidate.extensionProfile.version])],
    platform: {
      operatingSystems: [...candidate.platform.operatingSystems],
      remoteTransport: candidate.platform.remoteTransport,
      minimumRemoteTransportVersion: candidate.platform.minimumRemoteTransportVersion,
    },
    update: { ...candidate.update },
    bundledExtensions: candidate.bundledExtensions.map((extension) => ({ ...extension })),
    builtAt,
  };
}

export async function writeSpsReleaseBaseline({ outputPath, ...options } = {}) {
  const baseline = await resolveSpsReleaseBaseline(options);
  await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return baseline;
}
