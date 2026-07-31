import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createSpsPluginConformanceReportV1 } from "@sonparkserver/plugin-sdk/conformance/v1.mjs";

export const DEVELOPER_PROJECT_STORE_SCHEMA_VERSION = 1;
export const MAX_DEVELOPER_PROJECTS = 64;
export const MAX_DEVELOPER_PROJECT_STORE_BYTES = 512 * 1024;

const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_SOURCE_LABEL_LENGTH = 120;
const MAX_DIAGNOSTIC_COUNT = 100;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGE_ID_PATTERN = /^[a-f0-9]{32}$/;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const DEVELOPMENT_ARCHIVE_PATTERN = /^developer-mode\/builds\/[a-f0-9]{64}\.spsplugin$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, label, { min = 1, max = 512 } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || value.includes("\0")) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function assertTimestamp(value, label) {
  assertString(value, label, { min: 20, max: 40 });
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function assertFingerprint(value, label) {
  if (typeof value !== "string" || !FINGERPRINT_PATTERN.test(value)) throw new Error(`${label} must be a SHA-256 fingerprint.`);
  return value.toLowerCase();
}

function assertProjectId(value) {
  assertString(value, "Developer project id", { min: 5, max: 48 });
  if (!value.startsWith("dev-") || !UUID_PATTERN.test(value.slice(4))) throw new Error("Developer project id is invalid.");
  return value;
}

function assertBuildId(value) {
  assertString(value, "Last known good build id", { min: 42, max: 42 });
  if (!value.startsWith("build-") || !UUID_PATTERN.test(value.slice(6))) {
    throw new Error("Last known good build id is invalid.");
  }
  return value.toLowerCase();
}

function nextUuid(randomId, label) {
  const value = randomId();
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID.`);
  return value.toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedPathKey(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function developerModeDirectory(vaultRoot) {
  if (typeof vaultRoot !== "string" || vaultRoot.length === 0) throw new Error("Owner Vault root is required.");
  return path.join(path.resolve(vaultRoot), "developer-mode");
}

export function developerProjectStoreLayout(vaultRoot) {
  const root = developerModeDirectory(vaultRoot);
  return {
    root,
    projectsPath: path.join(root, "projects.json"),
  };
}

function assertGateSummary(value, label) {
  if (!isPlainObject(value) || typeof value.success !== "boolean") throw new Error(`${label} result is invalid.`);
  if (!Number.isInteger(value.diagnosticCount) || value.diagnosticCount < 0 || value.diagnosticCount > MAX_DIAGNOSTIC_COUNT) {
    throw new Error(`${label} diagnostic count is invalid.`);
  }
  return { success: value.success, diagnosticCount: value.diagnosticCount };
}

function assertPersistedCandidate(value, label = "Candidate") {
  if (!isPlainObject(value)) throw new Error(`${label} is invalid.`);
  const sourceFingerprint = assertFingerprint(value.sourceFingerprint, `${label} source fingerprint`);
  const outputFingerprint = assertFingerprint(value.outputFingerprint, `${label} output fingerprint`);
  if (!isPlainObject(value.outputs)) throw new Error(`${label} output components are invalid.`);
  const outputs = {
    manifestSha256: assertFingerprint(value.outputs.manifestSha256, `${label} manifest fingerprint`),
    workerSha256: assertFingerprint(value.outputs.workerSha256, `${label} worker fingerprint`),
    uiSha256: value.outputs.uiSha256 === null
      ? null
      : assertFingerprint(value.outputs.uiSha256, `${label} UI fingerprint`),
  };
  const calculatedOutputFingerprint = createHash("sha256")
    .update(JSON.stringify([outputs.manifestSha256, outputs.workerSha256, outputs.uiSha256]), "utf8")
    .digest("hex");
  if (calculatedOutputFingerprint !== outputFingerprint) {
    throw new Error(`${label} output components do not match its output fingerprint.`);
  }
  const createdAt = assertTimestamp(value.createdAt, `${label} createdAt`);
  if (!isPlainObject(value.gates)) throw new Error(`${label} gates are invalid.`);
  const conformance = value.conformance == null ? undefined : normalizeConformanceEvidence(value.conformance);
  return {
    sourceFingerprint,
    outputFingerprint,
    outputs,
    createdAt,
    gates: {
      build: assertGateSummary(value.gates.build, "Build"),
      validate: assertGateSummary(value.gates.validate, "Validate"),
      test: assertGateSummary(value.gates.test, "Test"),
    },
    ...(conformance ? { conformance } : {}),
  };
}

function normalizeConformanceEvidence(value) {
  if (!isPlainObject(value)) throw new Error("Candidate conformance evidence is invalid.");
  try {
    return JSON.parse(JSON.stringify(createSpsPluginConformanceReportV1({
      pluginId: value.pluginId,
      pluginVersion: value.pluginVersion,
      generatedAt: value.generatedAt,
      checks: value.checks,
      diagnostics: value.diagnostics,
      metadata: value.metadata,
    })));
  } catch {
    throw new Error("Candidate conformance evidence is invalid.");
  }
}

function assertPersistedLastKnownGood(value) {
  if (!isPlainObject(value)) throw new Error("Last known good build is invalid.");
  const candidate = assertPersistedCandidate(value, "Last known good build");
  const buildId = assertBuildId(value.buildId);
  if (!isPlainObject(value.deployment)) throw new Error("Last known good deployment is invalid.");
  const stageId = assertString(value.deployment.stageId, "Last known good stage id", { min: 32, max: 32 });
  if (!STAGE_ID_PATTERN.test(stageId)) throw new Error("Last known good stage id is invalid.");
  const pluginId = assertString(value.deployment.pluginId, "Last known good plugin id", { min: 3, max: 128 });
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Last known good plugin id is invalid.");
  const version = assertString(value.deployment.version, "Last known good plugin version", { min: 1, max: 128 });
  if (/\s/.test(version)) throw new Error("Last known good plugin version is invalid.");
  const archiveRelativePath = assertString(
    value.deployment.archiveRelativePath,
    "Last known good archive reference",
    { min: 1, max: 160 },
  );
  if (!DEVELOPMENT_ARCHIVE_PATTERN.test(archiveRelativePath)) {
    throw new Error("Last known good archive reference is invalid.");
  }
  return {
    ...candidate,
    buildId,
    deployment: {
      stageId,
      pluginId,
      version,
      artifactSha256: assertFingerprint(value.deployment.artifactSha256, "Last known good artifact fingerprint"),
      archiveRelativePath,
    },
  };
}

function assertStoredProject(value) {
  if (!isPlainObject(value)) throw new Error("Developer project is invalid.");
  const id = assertProjectId(value.id);
  const displayName = assertString(value.displayName, "Developer project display name", { min: 1, max: MAX_DISPLAY_NAME_LENGTH });
  const sourcePath = assertString(value.sourcePath, "Developer project source path", { min: 1, max: 32_000 });
  if (!path.isAbsolute(sourcePath)) throw new Error("Developer project source path must be absolute.");
  const createdAt = assertTimestamp(value.createdAt, "Developer project createdAt");
  const updatedAt = assertTimestamp(value.updatedAt, "Developer project updatedAt");
  const sourceLabel = value.sourceLabel == null
    ? undefined
    : assertSourceLabel(value.sourceLabel);
  const candidate = value.candidate == null ? undefined : assertPersistedCandidate(value.candidate);
  const lastKnownGood = value.lastKnownGood == null ? undefined : assertPersistedLastKnownGood(value.lastKnownGood);
  return {
    id,
    displayName,
    sourcePath,
    createdAt,
    updatedAt,
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(candidate ? { candidate } : {}),
    ...(lastKnownGood ? { lastKnownGood } : {}),
  };
}

function assertSourceLabel(value) {
  const label = assertString(value, "Developer project source label", { min: 1, max: MAX_SOURCE_LABEL_LENGTH });
  if (/[\\/:]/.test(label) || path.isAbsolute(label)) {
    throw new Error("Developer project source label cannot contain a filesystem path.");
  }
  return label;
}

function normalizeDeploymentInput(value) {
  if (!isPlainObject(value)) throw new Error("Developer deployment is required.");
  const stageId = assertString(value.stageId, "Developer deployment stage id", { min: 32, max: 32 });
  if (!STAGE_ID_PATTERN.test(stageId)) throw new Error("Developer deployment stage id is invalid.");
  const pluginId = assertString(value.pluginId, "Developer deployment plugin id", { min: 3, max: 128 });
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Developer deployment plugin id is invalid.");
  const version = assertString(value.version, "Developer deployment plugin version", { min: 1, max: 128 });
  if (/\s/.test(version)) throw new Error("Developer deployment plugin version is invalid.");
  const archiveRelativePath = assertString(
    value.archiveRelativePath,
    "Developer deployment archive reference",
    { min: 1, max: 160 },
  );
  if (!DEVELOPMENT_ARCHIVE_PATTERN.test(archiveRelativePath)) {
    throw new Error("Developer deployment archive reference is invalid.");
  }
  return {
    stageId,
    pluginId,
    version,
    artifactSha256: assertFingerprint(value.artifactSha256, "Developer deployment artifact fingerprint"),
    archiveRelativePath,
  };
}

function assertState(value) {
  if (!isPlainObject(value) || value.schemaVersion !== DEVELOPER_PROJECT_STORE_SCHEMA_VERSION || !Array.isArray(value.projects)) {
    throw new Error("Developer project state is invalid.");
  }
  if (value.projects.length > MAX_DEVELOPER_PROJECTS) throw new Error("Developer project limit exceeded.");
  const ids = new Set();
  const sourcePaths = new Set();
  const projects = value.projects.map((project) => {
    const normalized = assertStoredProject(project);
    const sourcePathKey = normalizedPathKey(normalized.sourcePath);
    if (ids.has(normalized.id)) throw new Error(`Duplicate developer project id: ${normalized.id}.`);
    if (sourcePaths.has(sourcePathKey)) throw new Error(`Duplicate developer project source path: ${normalized.sourcePath}.`);
    ids.add(normalized.id);
    sourcePaths.add(sourcePathKey);
    return normalized;
  });
  return { schemaVersion: DEVELOPER_PROJECT_STORE_SCHEMA_VERSION, projects };
}

function emptyState() {
  return { schemaVersion: DEVELOPER_PROJECT_STORE_SCHEMA_VERSION, projects: [] };
}

async function canonicalizeSourceDirectory(sourcePath, fsApi) {
  assertString(sourcePath, "Developer project source path", { min: 1, max: 32_000 });
  if (!path.isAbsolute(sourcePath)) throw new Error("Developer project source path must be absolute.");
  const resolved = path.resolve(sourcePath);
  let sourceStats;
  try {
    sourceStats = await fsApi.lstat(resolved);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      throw new Error("Developer project source path must be an existing directory.");
    }
    throw error;
  }
  if (sourceStats.isSymbolicLink()) throw new Error("Developer project source root cannot be a symbolic link or junction.");
  if (!sourceStats.isDirectory()) throw new Error("Developer project source path must be an existing directory.");
  const canonical = await fsApi.realpath(resolved);
  const canonicalStats = await fsApi.lstat(canonical);
  if (canonicalStats.isSymbolicLink() || !canonicalStats.isDirectory()) {
    throw new Error("Developer project source root cannot be a symbolic link or junction.");
  }
  return canonical;
}

function compactGateInput(value, label, sourceFingerprint, outputFingerprint) {
  if (!isPlainObject(value)) throw new Error(`${label} result is invalid.`);
  if (assertFingerprint(value.sourceFingerprint, `${label} source fingerprint`) !== sourceFingerprint
    || assertFingerprint(value.outputFingerprint, `${label} output fingerprint`) !== outputFingerprint) {
    throw new Error(`${label} result does not match the candidate fingerprint tuple.`);
  }
  return assertGateSummary(value, label);
}

function normalizeCandidateInput(value, now) {
  if (!isPlainObject(value)) throw new Error("Candidate is invalid.");
  const sourceFingerprint = assertFingerprint(value.sourceFingerprint, "Candidate source fingerprint");
  const outputFingerprint = assertFingerprint(value.outputFingerprint, "Candidate output fingerprint");
  if (!isPlainObject(value.outputs)) throw new Error("Candidate output components are invalid.");
  const outputs = {
    manifestSha256: assertFingerprint(value.outputs.manifestSha256, "Candidate manifest fingerprint"),
    workerSha256: assertFingerprint(value.outputs.workerSha256, "Candidate worker fingerprint"),
    uiSha256: value.outputs.uiSha256 === null
      ? null
      : assertFingerprint(value.outputs.uiSha256, "Candidate UI fingerprint"),
  };
  const calculatedOutputFingerprint = createHash("sha256")
    .update(JSON.stringify([outputs.manifestSha256, outputs.workerSha256, outputs.uiSha256]), "utf8")
    .digest("hex");
  if (calculatedOutputFingerprint !== outputFingerprint) {
    throw new Error("Candidate output components do not match its output fingerprint.");
  }
  if (!isPlainObject(value.gates)) throw new Error("Candidate gates are invalid.");
  const conformance = value.conformance == null ? undefined : normalizeConformanceEvidence(value.conformance);
  return {
    sourceFingerprint,
    outputFingerprint,
    outputs,
    createdAt: now(),
    gates: {
      build: compactGateInput(value.gates.build, "Build", sourceFingerprint, outputFingerprint),
      validate: compactGateInput(value.gates.validate, "Validate", sourceFingerprint, outputFingerprint),
      test: compactGateInput(value.gates.test, "Test", sourceFingerprint, outputFingerprint),
    },
    ...(conformance ? { conformance } : {}),
  };
}

export function isDeveloperCandidatePromotable(candidate) {
  try {
    const validated = assertPersistedCandidate(candidate);
    return validated.gates.build.success && validated.gates.validate.success && validated.gates.test.success;
  } catch {
    return false;
  }
}

export function publicDeveloperProject(project) {
  const normalized = assertStoredProject(project);
  const { sourcePath: _sourcePath, ...safe } = normalized;
  return {
    ...clone(safe),
    sourceLabel: normalized.sourceLabel ?? path.basename(normalized.sourcePath),
    candidate: normalized.candidate ? {
      ...clone(normalized.candidate),
      promotable: isDeveloperCandidatePromotable(normalized.candidate),
    } : null,
    lastKnownGood: normalized.lastKnownGood ? {
      ...clone(normalized.lastKnownGood),
      deployment: {
        stageId: normalized.lastKnownGood.deployment.stageId,
        pluginId: normalized.lastKnownGood.deployment.pluginId,
        version: normalized.lastKnownGood.deployment.version,
        artifactSha256: normalized.lastKnownGood.deployment.artifactSha256,
      },
    } : null,
  };
}

export function publicDeveloperProjectState(state) {
  const normalized = assertState(state);
  return {
    schemaVersion: normalized.schemaVersion,
    projects: normalized.projects.map((project) => publicDeveloperProject(project)),
  };
}

export async function loadDeveloperProjects({ vaultRoot, fsApi = fs } = {}) {
  const layout = developerProjectStoreLayout(vaultRoot);
  try {
    const stats = await fsApi.lstat(layout.projectsPath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_DEVELOPER_PROJECT_STORE_BYTES) {
      throw new Error("Developer project state is unavailable.");
    }
    const raw = await fsApi.readFile(layout.projectsPath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_DEVELOPER_PROJECT_STORE_BYTES) {
      throw new Error("Developer project state exceeds the size limit.");
    }
    return assertState(JSON.parse(raw.replace(/^\uFEFF/, "")));
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState();
    if (error instanceof SyntaxError) throw new Error("Developer project state is not valid JSON.");
    throw error;
  }
}

export async function saveDeveloperProjects({ vaultRoot, state, fsApi = fs, randomId = randomUUID } = {}) {
  const normalized = assertState(state);
  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_DEVELOPER_PROJECT_STORE_BYTES) {
    throw new Error("Developer project state exceeds the size limit.");
  }
  const layout = developerProjectStoreLayout(vaultRoot);
  const temporaryPath = path.join(layout.root, `.projects-${nextUuid(randomId, "Developer project temporary id")}.json`);
  await fsApi.mkdir(layout.root, { recursive: true, mode: 0o700 });
  try {
    await fsApi.writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fsApi.rename(temporaryPath, layout.projectsPath);
  } finally {
    await fsApi.rm(temporaryPath, { force: true }).catch(() => {});
  }
  return normalized;
}

export async function connectDeveloperProject({ vaultRoot, sourcePath, displayName, sourceLabel, fsApi = fs, now = () => new Date().toISOString(), randomId = randomUUID } = {}) {
  const canonicalSourcePath = await canonicalizeSourceDirectory(sourcePath, fsApi);
  const normalizedDisplayName = assertString(displayName ?? path.basename(canonicalSourcePath), "Developer project display name", { min: 1, max: MAX_DISPLAY_NAME_LENGTH });
  const normalizedSourceLabel = sourceLabel == null ? undefined : assertSourceLabel(sourceLabel);
  const state = await loadDeveloperProjects({ vaultRoot, fsApi });
  if (state.projects.length >= MAX_DEVELOPER_PROJECTS) throw new Error("Developer project limit reached.");
  if (state.projects.some((project) => normalizedPathKey(project.sourcePath) === normalizedPathKey(canonicalSourcePath))) {
    throw new Error("This external plugin project is already connected.");
  }
  const timestamp = now();
  assertTimestamp(timestamp, "Developer project timestamp");
  const project = {
    id: `dev-${nextUuid(randomId, "Developer project id")}`,
    displayName: normalizedDisplayName,
    sourcePath: canonicalSourcePath,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(normalizedSourceLabel ? { sourceLabel: normalizedSourceLabel } : {}),
  };
  assertStoredProject(project);
  state.projects.push(project);
  await saveDeveloperProjects({ vaultRoot, state, fsApi, randomId });
  return clone(project);
}

export async function recordDeveloperCandidate({ vaultRoot, projectId, candidate, fsApi = fs, now = () => new Date().toISOString(), randomId = randomUUID } = {}) {
  const id = assertProjectId(projectId);
  const normalizedCandidate = normalizeCandidateInput(candidate, now);
  const state = await loadDeveloperProjects({ vaultRoot, fsApi });
  const project = state.projects.find((entry) => entry.id === id);
  if (!project) throw new Error(`Developer project ${id} was not found.`);
  project.candidate = normalizedCandidate;
  project.updatedAt = now();
  assertTimestamp(project.updatedAt, "Developer project timestamp");
  await saveDeveloperProjects({ vaultRoot, state, fsApi, randomId });
  return clone(project);
}

export async function promoteDeveloperCandidate({
  vaultRoot,
  projectId,
  deployment,
  buildId,
  fsApi = fs,
  now = () => new Date().toISOString(),
  randomId = randomUUID,
} = {}) {
  const id = assertProjectId(projectId);
  const normalizedDeployment = normalizeDeploymentInput(deployment);
  const state = await loadDeveloperProjects({ vaultRoot, fsApi });
  const project = state.projects.find((entry) => entry.id === id);
  if (!project) throw new Error(`Developer project ${id} was not found.`);
  if (!isDeveloperCandidatePromotable(project.candidate)) {
    throw new Error("Developer project candidate is not promotable. Build, validate, and test must all succeed for the same fingerprint tuple.");
  }
  const createdAt = now();
  assertTimestamp(createdAt, "Last known good build timestamp");
  project.lastKnownGood = {
    ...clone(project.candidate),
    buildId: buildId == null
      ? `build-${nextUuid(randomId, "Last known good build id")}`
      : assertBuildId(buildId),
    createdAt,
    deployment: normalizedDeployment,
  };
  project.updatedAt = createdAt;
  await saveDeveloperProjects({ vaultRoot, state, fsApi, randomId });
  return clone(project.lastKnownGood);
}

export async function rollbackDeveloperProject({ vaultRoot, projectId, fsApi = fs } = {}) {
  const id = assertProjectId(projectId);
  const state = await loadDeveloperProjects({ vaultRoot, fsApi });
  const project = state.projects.find((entry) => entry.id === id);
  if (!project) throw new Error(`Developer project ${id} was not found.`);
  if (!project.lastKnownGood) throw new Error("Developer project has no last known good build to roll back to.");
  return clone(project.lastKnownGood);
}

export async function removeDeveloperProject({ vaultRoot, projectId, fsApi = fs, randomId = randomUUID } = {}) {
  const id = assertProjectId(projectId);
  const state = await loadDeveloperProjects({ vaultRoot, fsApi });
  const index = state.projects.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error(`Developer project ${id} was not found.`);
  const [removed] = state.projects.splice(index, 1);
  await saveDeveloperProjects({ vaultRoot, state, fsApi, randomId });
  return clone(removed);
}
