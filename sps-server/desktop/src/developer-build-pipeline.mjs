import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import {
  fingerprintDevelopmentBuildOutputs,
  fingerprintDevelopmentSource,
} from "@sonparkserver/plugin-sdk/authoring/development-build-v1.mjs";
import { packagePluginDirectory } from "@sonparkserver/plugin-sdk/authoring/plugin-package-v1.mjs";
import { createSpsPluginConformanceReportV1 } from "@sonparkserver/plugin-sdk/conformance/v1.mjs";
import { isDeveloperCandidatePromotable } from "./developer-project-store.mjs";

const COMMANDS = Object.freeze(["build", "validate", "test"]);
const PROJECT_ID = /^dev-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function assertHash(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

async function sha256File(filePath, createReadStreamImpl = createReadStream) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStreamImpl(filePath, { flags: "r" })) hash.update(chunk);
  return hash.digest("hex");
}

function outputTuple(result) {
  return {
    manifestSha256: assertHash(result.manifestSha256, "Development manifest fingerprint"),
    workerSha256: assertHash(result.workerSha256, "Development worker fingerprint"),
    uiSha256: result.uiSha256 === null ? null : assertHash(result.uiSha256, "Development UI fingerprint"),
  };
}

export function developmentOutputFingerprint(value) {
  const tuple = outputTuple(value);
  return createHash("sha256")
    .update(JSON.stringify([tuple.manifestSha256, tuple.workerSha256, tuple.uiSha256]), "utf8")
    .digest("hex");
}

export function createDeveloperCandidateFromGateReports(reports) {
  if (!Array.isArray(reports) || reports.length !== COMMANDS.length) {
    throw new Error("Build, validate, and test reports are required.");
  }
  const byCommand = new Map(reports.map((report) => [report?.command, report]));
  if (byCommand.size !== COMMANDS.length || COMMANDS.some((command) => !byCommand.has(command))) {
    throw new Error("Development gate reports are incomplete or duplicated.");
  }

  let sourceFingerprint = null;
  let outputFingerprint = null;
  let outputs = null;
  const gates = {};
  for (const command of COMMANDS) {
    const report = byCommand.get(command);
    if (!report?.result || report.result.command !== command || typeof report.success !== "boolean") {
      throw new Error(`Development ${command} report is invalid.`);
    }
    const nextSource = assertHash(report.result.sourceFingerprint, `Development ${command} source fingerprint`);
    const nextOutputs = outputTuple(report.result);
    const nextOutput = developmentOutputFingerprint(nextOutputs);
    sourceFingerprint ??= nextSource;
    outputFingerprint ??= nextOutput;
    outputs ??= nextOutputs;
    if (sourceFingerprint !== nextSource || outputFingerprint !== nextOutput) {
      throw new Error("Plugin source or build output changed while the development gates were running.");
    }
    gates[command] = {
      sourceFingerprint,
      outputFingerprint,
      success: report.success,
      diagnosticCount: Array.isArray(report.result.diagnostics) ? report.result.diagnostics.length : 0,
    };
  }
  return { sourceFingerprint, outputFingerprint, outputs, gates };
}

/**
 * Creates release-review evidence from the three deterministic Developer Mode
 * gates. It deliberately reads only the public package identity; no path or
 * command output becomes part of the persisted candidate.
 */
export async function createDeveloperConformanceEvidence({ sourceDirectory, reports, fsApi = fs } = {}) {
  if (!Array.isArray(reports) || reports.length !== COMMANDS.length) throw new Error("Build, validate, and test reports are required.");
  let manifest;
  try {
    const raw = await fsApi.readFile(path.join(path.resolve(sourceDirectory ?? ""), "sps-plugin.json"), "utf8");
    if (Buffer.byteLength(raw, "utf8") > 64 * 1024) throw new Error("too large");
    manifest = JSON.parse(raw);
  } catch {
    throw new Error("Plugin identity could not be read for conformance evidence.");
  }
  const pluginId = manifest?.plugin?.id;
  const pluginVersion = manifest?.plugin?.version;
  const diagnostics = [];
  const checks = reports.map((report) => {
    const command = report?.command;
    if (!COMMANDS.includes(command)) throw new Error("Development gate reports are incomplete or duplicated.");
    for (const [index, diagnostic] of (report.result?.diagnostics ?? []).entries()) {
      diagnostics.push({
        id: `desktop.${command}.${index}`,
        origin: "desktop",
        category: command === "validate" ? "manifest" : "worker",
        level: report.success ? "warn" : "error",
        code: /^[A-Z][A-Z0-9_]{1,119}$/.test(diagnostic?.code ?? "") ? diagnostic.code : `DEVELOPER_${command.toUpperCase()}_FAILED`,
        message: typeof diagnostic?.message === "string" ? diagnostic.message : `Plugin ${command} gate reported a failure.`,
        occurredAt: report.result?.completedAt,
        details: { gate: command },
      });
    }
    return {
      id: `developer.${command}`,
      status: report.success ? "passed" : "failed",
      summary: report.success ? `Plugin ${command} gate passed.` : `Plugin ${command} gate did not pass.`,
    };
  });
  return JSON.parse(JSON.stringify(createSpsPluginConformanceReportV1({
    pluginId,
    pluginVersion,
    generatedAt: reports.at(-1)?.result?.completedAt,
    checks,
    diagnostics,
    metadata: { evidence: "desktop-development-gates-v1" },
  })));
}

export async function inspectDeveloperSourceTuple(sourceDirectory, {
  fingerprintSource = fingerprintDevelopmentSource,
  fingerprintOutputs = fingerprintDevelopmentBuildOutputs,
  allowMissingOutputs = false,
} = {}) {
  const source = await fingerprintSource({ sourceDirectory });
  let outputs;
  try {
    outputs = await fingerprintOutputs({ sourceDirectory });
  } catch (error) {
    if (!allowMissingOutputs) throw error;
    return {
      sourceFingerprint: assertHash(source.fingerprint, "Current source fingerprint"),
      outputFingerprint: null,
      outputAvailable: false,
    };
  }
  return {
    sourceFingerprint: assertHash(source.fingerprint, "Current source fingerprint"),
    outputFingerprint: developmentOutputFingerprint(outputs),
    outputAvailable: true,
  };
}

/**
 * Packages and stages a promotable build without replacing the active plugin.
 * The source tuple is checked before and after packaging to close the
 * build-to-stage race. The temporary archive remains inside the Owner Vault.
 */
export async function stageDeveloperCandidate({
  vaultRoot,
  projectId,
  sourceDirectory,
  candidate,
  stageArchive,
  fsApi = fs,
  randomId = randomUUID,
  fingerprintSource = fingerprintDevelopmentSource,
  fingerprintOutputs = fingerprintDevelopmentBuildOutputs,
  packagePlugin = packagePluginDirectory,
} = {}) {
  if (typeof vaultRoot !== "string" || vaultRoot.length === 0) throw new Error("Owner Vault root is required.");
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) throw new Error("Developer project id is invalid.");
  if (typeof stageArchive !== "function") throw new Error("Developer Registry staging callback is required.");
  if (!isDeveloperCandidatePromotable({ ...candidate, createdAt: new Date().toISOString() })) {
    throw new Error("Only a development candidate that passed build, validate, and test can be staged.");
  }
  const expected = {
    sourceFingerprint: assertHash(candidate.sourceFingerprint, "Candidate source fingerprint"),
    outputFingerprint: assertHash(candidate.outputFingerprint, "Candidate output fingerprint"),
  };
  const before = await inspectDeveloperSourceTuple(sourceDirectory, { fingerprintSource, fingerprintOutputs });
  if (before.sourceFingerprint !== expected.sourceFingerprint || before.outputFingerprint !== expected.outputFingerprint) {
    throw new Error("Plugin source changed after validation. Run the development gates again.");
  }

  const developerRoot = path.join(path.resolve(vaultRoot), "developer-mode");
  const stagingRoot = path.join(developerRoot, "staging");
  const buildsRoot = path.join(developerRoot, "builds");
  await Promise.all([
    fsApi.mkdir(stagingRoot, { recursive: true, mode: 0o700 }),
    fsApi.mkdir(buildsRoot, { recursive: true, mode: 0o700 }),
  ]);
  const temporaryId = randomId();
  if (typeof temporaryId !== "string" || !/^[0-9a-f-]{36}$/i.test(temporaryId)) {
    throw new Error("Developer staging id must be a UUID.");
  }
  const archivePath = path.join(stagingRoot, `${projectId}-${temporaryId}.spsplugin`);
  try {
    await packagePlugin({ sourceDirectory, archivePath });
    const after = await inspectDeveloperSourceTuple(sourceDirectory, { fingerprintSource, fingerprintOutputs });
    if (after.sourceFingerprint !== expected.sourceFingerprint || after.outputFingerprint !== expected.outputFingerprint) {
      throw new Error("Plugin source changed while SPS was packaging it. The candidate was not staged.");
    }
    const staged = await stageArchive({
      archivePath,
      source: {
        registryId: "sps.desktop.development",
        kind: "local",
        releaseLocator: `developer/${projectId}/${expected.outputFingerprint.slice(0, 16)}.spsplugin`,
      },
    });
    if (!staged?.staged || !SHA256.test(staged.artifact?.sha256 ?? "")) return staged;
    const immutableArchivePath = path.join(buildsRoot, `${staged.artifact.sha256}.spsplugin`);
    try {
      await fsApi.rename(archivePath, immutableArchivePath);
    } catch (error) {
      if (!["EEXIST", "EPERM"].includes(error?.code)) throw error;
      const existing = await fsApi.lstat(immutableArchivePath);
      if (!existing.isFile() || existing.isSymbolicLink() || await sha256File(immutableArchivePath) !== staged.artifact.sha256) {
        throw new Error("The immutable development build archive is invalid.");
      }
    }
    await fsApi.chmod(immutableArchivePath, 0o600);
    return {
      ...staged,
      developmentArchiveRelativePath: `developer-mode/builds/${staged.artifact.sha256}.spsplugin`,
    };
  } finally {
    await fsApi.rm(archivePath, { force: true }).catch(() => {});
  }
}
