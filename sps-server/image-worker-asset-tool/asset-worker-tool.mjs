#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getProviderBalance, loadAssetSpec, listProviders, preflightAssetSpec, recoverPixelLabCharacter, recoverPixelLabTileset, runAssetSpec, validateAssetSpec, writePixelLabTilesetReceipt } from "./lib/asset-tool-core.mjs";
import { findLatestRunState, readRunState, readRunStateWithCanonicalId, runStatePath, shouldReuseRun, specFileFingerprint, waitForRunState, writeRunState } from "./lib/run-ledger.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RUNS_ROOT = path.resolve(process.env.PAPERCLIP_IMAGE_WORKER_RUNS_ROOT || path.join(os.homedir(), ".paperclip", "image-worker-runs"));

function usage() {
  return [
    "Paperclip Image Worker Asset Tool",
    "",
    "Commands:",
    "  providers",
    "  balance [--provider pixel_lab]",
    "  validate --spec <asset.spec.json> [--workspace <project-root>]",
    "  preflight --spec <asset.spec.json> [--workspace <project-root>]",
    "  run --spec <asset.spec.json> [--workspace <project-root>]",
    "  start --spec <asset.spec.json> [--workspace <project-root>] [--retry-failed true]",
    "  latest --spec <asset.spec.json> [--workspace <project-root>]",
    "  status --run-id <id>",
    "  wait --run-id <id> [--timeout-ms 300000] [--poll-ms 1000]",
    "  recover --run-id <id>",
    "  receipt --run-id <id>",
    "  recover-character --spec <asset.spec.json> --character-id <id> [--workspace <project-root>]",
    "",
    "API keys are read only from the Image Worker's environment:",
    "  PIXELLAB_API_KEY for provider pixel_lab",
    "  MESHY_API_KEY for provider meshy"
  ].join("\n");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function statePath(runId) {
  return runStatePath(RUNS_ROOT, runId);
}

function integerOption(options, name, defaultValue, { min, max }) {
  if (options[name] == null) return defaultValue;
  const value = Number(options[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

async function writeState(runId, state) {
  await writeRunState({ runsRoot: RUNS_ROOT, runId, state });
}

async function executeBackgroundRun(options) {
  const runId = options["run-id"];
  const workspaceRoot = path.resolve(options.workspace);
  const specPath = path.resolve(options.spec);
  const specFingerprint = await specFileFingerprint(specPath);
  const startedAt = new Date().toISOString();
  const logPath = path.join(RUNS_ROOT, `${runId}.log`);
  let preflight = null;
  let submission = null;
  await writeState(runId, { runId, status: "running", workspaceRoot, specPath, specFingerprint, logPath, startedAt });
  try {
    const spec = await loadAssetSpec(specPath);
    const result = await runAssetSpec({
      spec,
      workspaceRoot,
      env: process.env,
      onPreflight: async (receipt) => {
        preflight = receipt;
        await writeState(runId, {
          runId,
          status: receipt.allowed ? "preflight_passed" : "preflight_blocked",
          workspaceRoot,
          specPath,
          specFingerprint,
          logPath,
          startedAt,
          preflight
        });
      },
      onSubmitted: async (receipt) => {
        submission = { ...receipt, submittedAt: new Date().toISOString() };
        await writeState(runId, { runId, status: "submitted", workspaceRoot, specPath, specFingerprint, logPath, startedAt, preflight, submission });
      }
    });
    await writeState(runId, { runId, status: "completed", workspaceRoot, specPath, specFingerprint, logPath, startedAt, preflight, submission, finishedAt: new Date().toISOString(), result });
  } catch (error) {
    await writeState(runId, {
      runId,
      status: "failed",
      workspaceRoot,
      specPath,
      specFingerprint,
      logPath,
      startedAt,
      preflight,
      submission,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}

async function startBackgroundRun({ workspaceRoot, specPath, retryFailed = false }) {
  const specFingerprint = await specFileFingerprint(specPath);
  const existing = await findLatestRunState({
    runsRoot: RUNS_ROOT,
    workspaceRoot,
    specPath,
    specFingerprint,
    sameFingerprint: true
  });
  if (shouldReuseRun(existing, { retryFailed })) {
    return {
      runId: existing.runId,
      status: existing.status,
      statePath: statePath(existing.runId),
      logPath: existing.logPath,
      reused: true,
      reason: existing?.status === "failed" && !existing?.submission
        ? "matching_spec_failed_requires_explicit_retry"
        : "matching_spec_already_has_durable_run",
      retryRequired: existing?.status === "failed" && !existing?.submission
    };
  }
  const runId = randomUUID();
  await fs.mkdir(RUNS_ROOT, { recursive: true });
  const logPath = path.join(RUNS_ROOT, `${runId}.log`);
  await writeState(runId, { runId, status: "queued", workspaceRoot, specPath, specFingerprint, logPath, queuedAt: new Date().toISOString() });
  const logHandle = fsSync.openSync(logPath, "a");
  const child = spawn(process.execPath, [SCRIPT_PATH, "__run", "--run-id", runId, "--spec", specPath, "--workspace", workspaceRoot], {
    cwd: workspaceRoot,
    detached: true,
    env: process.env,
    stdio: ["ignore", logHandle, logHandle],
    windowsHide: true
  });
  child.unref();
  fsSync.closeSync(logHandle);
  return { runId, status: "queued", statePath: statePath(runId), logPath };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }
  if (command === "providers") {
    console.log(JSON.stringify(listProviders(process.env), null, 2));
    return;
  }
  if (command === "balance") {
    console.log(JSON.stringify(await getProviderBalance({ provider: options.provider || "pixel_lab", env: process.env }), null, 2));
    return;
  }
  if (command === "status") {
    if (!options["run-id"]) throw new Error("--run-id is required.");
    console.log(JSON.stringify(await readRunState({ runsRoot: RUNS_ROOT, runId: options["run-id"] }), null, 2));
    return;
  }
  if (command === "wait") {
    if (!options["run-id"]) throw new Error("--run-id is required.");
    const timeoutMs = integerOption(options, "timeout-ms", 300_000, { min: 1_000, max: 3_600_000 });
    const pollMs = integerOption(options, "poll-ms", 1_000, { min: 100, max: 30_000 });
    const state = await waitForRunState({ runsRoot: RUNS_ROOT, runId: options["run-id"], timeoutMs, pollMs });
    console.log(JSON.stringify(state, null, 2));
    if (state.wait.timedOut) process.exitCode = 2;
    else if (state.status === "failed") process.exitCode = 1;
    return;
  }
  if (command === "recover") {
    if (!options["run-id"]) throw new Error("--run-id is required.");
    const runId = options["run-id"];
    const existing = await readRunState({ runsRoot: RUNS_ROOT, runId });
    if (!existing) throw new Error(`No durable run exists for ${runId}.`);
    if (!existing.specPath || !existing.workspaceRoot) throw new Error("The durable run is missing its specification or workspace path.");
    const specFingerprint = await specFileFingerprint(existing.specPath);
    if (existing.specFingerprint && existing.specFingerprint !== specFingerprint) {
      throw new Error("The specification changed after submission; restore the submitted specification before recovery.");
    }
    const spec = await loadAssetSpec(existing.specPath);
    const tilesetId = existing.submission?.resources?.tilesetId;
    const characterId = existing.submission?.resources?.characterId;
    let result;
    if (tilesetId) {
      result = await recoverPixelLabTileset({
        spec,
        tilesetId,
        jobId: existing.submission?.jobId,
        workspaceRoot: existing.workspaceRoot,
        env: process.env
      });
    } else if (characterId) {
      result = await recoverPixelLabCharacter({ spec, characterId, workspaceRoot: existing.workspaceRoot, env: process.env });
    } else {
      throw new Error("The durable run has no recoverable PixelLab resource identity.");
    }
    const finishedAt = new Date().toISOString();
    await writeState(runId, { ...existing, status: "completed", finishedAt, result, recoveredAt: finishedAt, error: null });
    console.log(JSON.stringify({ runId, status: "completed", recovered: true, result }, null, 2));
    return;
  }
  if (command === "receipt") {
    if (!options["run-id"]) throw new Error("--run-id is required.");
    const requestedRunId = options["run-id"];
    const resolved = await readRunStateWithCanonicalId({ runsRoot: RUNS_ROOT, runId: requestedRunId });
    const runId = resolved.canonicalRunId;
    const existing = resolved.state;
    if (!existing || !runId) throw new Error(`No durable run exists for ${requestedRunId}.`);
    if (!existing.specPath || !existing.workspaceRoot) throw new Error("The durable run is missing its specification or workspace path.");
    const specFingerprint = await specFileFingerprint(existing.specPath);
    if (existing.specFingerprint && existing.specFingerprint !== specFingerprint) {
      throw new Error("The specification changed after submission; restore the submitted specification before fetching its receipt.");
    }
    const tilesetId = existing.submission?.resources?.tilesetId;
    if (!tilesetId) throw new Error("The durable run has no PixelLab tileset identity.");
    const spec = await loadAssetSpec(existing.specPath);
    const result = await writePixelLabTilesetReceipt({
      spec,
      tilesetId,
      jobId: existing.submission?.jobId,
      workspaceRoot: existing.workspaceRoot,
      env: process.env
    });
    console.log(JSON.stringify({
      runId,
      requestedRunId,
      runIdCorrected: resolved.corrected,
      fetched: true,
      submitted: false,
      result
    }, null, 2));
    return;
  }
  if (command === "__run") {
    if (!options["run-id"] || !options.spec || !options.workspace) throw new Error("Background run arguments are incomplete.");
    await executeBackgroundRun(options);
    return;
  }
  if (!new Set(["validate", "preflight", "run", "start", "latest", "recover-character"]).has(command)) throw new Error(`Unknown command: ${command}`);
  if (!options.spec) throw new Error("--spec is required.");
  const workspaceRoot = path.resolve(options.workspace || process.cwd());
  const specPath = path.resolve(workspaceRoot, options.spec);
  if (command === "latest") {
    const currentFingerprint = await specFileFingerprint(specPath);
    const latest = await findLatestRunState({ runsRoot: RUNS_ROOT, workspaceRoot, specPath });
    if (!latest) throw new Error("No durable run exists for this workspace and specification.");
    console.log(JSON.stringify({
      ...latest,
      statePath: statePath(latest.runId),
      currentSpecFingerprint: currentFingerprint,
      specFingerprintMatches: latest.specFingerprint ? latest.specFingerprint === currentFingerprint : null
    }, null, 2));
    return;
  }
  const spec = await loadAssetSpec(specPath);
  const validation = validateAssetSpec(spec, { workspaceRoot });
  if (command === "validate") {
    console.log(JSON.stringify({ ok: true, workspaceRoot, specPath, validation }, null, 2));
    return;
  }
  if (command === "preflight") {
    const preflight = await preflightAssetSpec({ validation, env: process.env });
    console.log(JSON.stringify({ ok: preflight.allowed, workspaceRoot, specPath, validation, preflight }, null, 2));
    if (!preflight.allowed) process.exitCode = 3;
    return;
  }
  if (command === "start") {
    const retryFailed = options["retry-failed"] === "true";
    console.log(JSON.stringify(await startBackgroundRun({ workspaceRoot, specPath, retryFailed }), null, 2));
    return;
  }
  if (command === "recover-character") {
    if (!options["character-id"]) throw new Error("--character-id is required.");
    const result = await recoverPixelLabCharacter({ spec, characterId: options["character-id"], workspaceRoot, env: process.env });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const result = await runAssetSpec({ spec, workspaceRoot, env: process.env });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`Asset Tool failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
