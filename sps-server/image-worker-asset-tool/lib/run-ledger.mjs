import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function timestampFor(state) {
  for (const value of [state.finishedAt, state.startedAt, state.queuedAt]) {
    const parsed = Date.parse(value || "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function runStatePath(runsRoot, runId) {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(runId || "")) throw new Error("--run-id is invalid.");
  return path.join(runsRoot, `${runId}.json`);
}

export async function specFileFingerprint(specPath) {
  const bytes = await fs.readFile(specPath);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function writeRunState({ runsRoot, runId, state }) {
  await fs.mkdir(runsRoot, { recursive: true });
  const target = runStatePath(runsRoot, runId);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readRunState({ runsRoot, runId }) {
  return JSON.parse(await fs.readFile(runStatePath(runsRoot, runId), "utf8"));
}

export async function waitForRunState({ runsRoot, runId, timeoutMs = 300_000, pollMs = 1_000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const startedAt = Date.now();
  while (true) {
    const state = await readRunState({ runsRoot, runId });
    const waitedMs = Date.now() - startedAt;
    if (["completed", "failed"].includes(state.status)) {
      return { ...state, wait: { terminal: true, timedOut: false, waitedMs } };
    }
    if (waitedMs >= timeoutMs) {
      return { ...state, wait: { terminal: false, timedOut: true, waitedMs } };
    }
    await sleep(Math.min(pollMs, Math.max(1, timeoutMs - waitedMs)));
  }
}

function characterDistance(left, right) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

export async function readRunStateWithCanonicalId({ runsRoot, runId }) {
  try {
    return { requestedRunId: runId, canonicalRunId: runId, corrected: false, state: await readRunState({ runsRoot, runId }) };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  let entries;
  try {
    entries = await fs.readdir(runsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { requestedRunId: runId, canonicalRunId: null, corrected: false, state: null };
    throw error;
  }
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -5))
    .filter((candidate) => characterDistance(candidate, runId) === 1);
  if (candidates.length > 1) {
    throw new Error(`Run ID ${runId} has multiple one-character matches; use the exact durable run ID.`);
  }
  if (!candidates.length) return { requestedRunId: runId, canonicalRunId: null, corrected: false, state: null };
  const canonicalRunId = candidates[0];
  return {
    requestedRunId: runId,
    canonicalRunId,
    corrected: true,
    state: await readRunState({ runsRoot, runId: canonicalRunId })
  };
}

export async function findLatestRunState({ runsRoot, workspaceRoot, specPath, specFingerprint = null, sameFingerprint = false }) {
  let entries;
  try {
    entries = await fs.readdir(runsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  const expectedWorkspace = comparablePath(workspaceRoot);
  const expectedSpec = comparablePath(specPath);
  const matches = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const state = JSON.parse(await fs.readFile(path.join(runsRoot, entry.name), "utf8"));
      if (comparablePath(state.workspaceRoot || ".") !== expectedWorkspace) continue;
      if (comparablePath(state.specPath || ".") !== expectedSpec) continue;
      if (sameFingerprint && state.specFingerprint && state.specFingerprint !== specFingerprint) continue;
      matches.push(state);
    } catch {
      // A damaged unrelated ledger entry must not hide a valid durable run.
    }
  }
  matches.sort((left, right) => timestampFor(right) - timestampFor(left));
  return matches[0] || null;
}

export function shouldReuseRun(state, { retryFailed = false } = {}) {
  if (!state) return false;
  if (["queued", "running", "submitted", "completed"].includes(state.status)) return true;
  if (state.status !== "failed") return false;
  if (state.submission) return true;
  return retryFailed !== true;
}
