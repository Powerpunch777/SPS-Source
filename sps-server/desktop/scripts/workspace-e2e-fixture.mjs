import { lstatSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nativeCertificateRecord } from "../src/native-certificate-primitives.mjs";
import { canonicalNativeSmokeDirectorySync } from "../src/native-identity-smoke-paths.mjs";

const FIXTURE_PREFIX = "sps-workspace-surfaces-e2e-";
const REMOVE_ATTEMPTS = 20;
const REMOVE_RETRY_DELAY_MS = 300;
const RETRYABLE_REMOVE_CODES = new Set(["EPERM", "EBUSY", "ENOTEMPTY", "EACCES"]);
const REMOVE_PROGRESS_PHASES = new Set([
  "identity_check_start", "identity_check_done", "identity_check_failed",
  "rm_start", "rm_done", "retry", "rm_failed",
]);

function fixtureError(stage) {
  const error = new Error("Workspace E2E fixture operation failed.");
  error.code = "ERR_WORKSPACE_E2E_FIXTURE";
  error.stage = stage;
  return error;
}

function sameNativePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function directoryIdentity(directory) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw fixtureError("identity");
  if (![stat.dev, stat.ino, stat.birthtimeNs].every(value => typeof value === "bigint" && value >= 0n)) {
    throw fixtureError("identity");
  }
  return Object.freeze({ dev: stat.dev, ino: stat.ino, birthtimeNs: stat.birthtimeNs });
}

function sameIdentity(directory, expected) {
  const actual = directoryIdentity(directory);
  return actual.dev === expected.dev && actual.ino === expected.ino
    && actual.birthtimeNs === expected.birthtimeNs;
}

function assertDirectoryIdentity(directory, expectedCanonical, expectedIdentity, stage) {
  try {
    const canonical = canonicalNativeSmokeDirectorySync(directory);
    if (!sameNativePath(canonical, expectedCanonical) || !sameIdentity(canonical, expectedIdentity)) {
      throw new Error();
    }
  } catch {
    throw fixtureError(stage);
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function reportRemoveProgress(onProgress, phase, attempt, elapsedMs, code) {
  if (typeof onProgress !== "function" || !REMOVE_PROGRESS_PHASES.has(phase)) return;
  const event = Object.freeze({
    phase,
    attempt,
    elapsedMs: Math.max(0, Math.trunc(elapsedMs)),
    ...(code ? { code } : {}),
  });
  try {
    const result = onProgress(event);
    if (result && typeof result.then === "function") void Promise.resolve(result).catch(() => undefined);
  } catch {
    // Diagnostics must never change cleanup behavior.
  }
}

function safeRemoveErrorCode(error) {
  return RETRYABLE_REMOVE_CODES.has(error?.code) ? error.code : "OTHER";
}

export async function createWorkspaceE2eFixture(options = {}) {
  let temporaryDirectory;
  try {
    let record;
    try {
      record = nativeCertificateRecord(options, []);
    } catch {
      record = nativeCertificateRecord(options, ["temporaryDirectory"]);
    }
    temporaryDirectory = record.temporaryDirectory === undefined ? os.tmpdir() : record.temporaryDirectory;
  } catch {
    throw fixtureError("arguments");
  }
  if (typeof temporaryDirectory !== "string" || temporaryDirectory.length === 0
    || !path.isAbsolute(temporaryDirectory)) {
    throw fixtureError("arguments");
  }

  let canonicalTemporaryDirectory;
  let temporaryIdentity;
  try {
    canonicalTemporaryDirectory = canonicalNativeSmokeDirectorySync(temporaryDirectory);
    temporaryIdentity = directoryIdentity(canonicalTemporaryDirectory);
  } catch {
    throw fixtureError("temporary-directory");
  }

  let createdDirectory;
  try {
    createdDirectory = mkdtempSync(path.join(canonicalTemporaryDirectory, FIXTURE_PREFIX));
  } catch {
    throw fixtureError("create");
  }

  let directory;
  let fixtureIdentity;
  try {
    directory = canonicalNativeSmokeDirectorySync(createdDirectory);
    if (!sameNativePath(path.dirname(directory), canonicalTemporaryDirectory)
      || !path.basename(directory).startsWith(FIXTURE_PREFIX)) {
      throw new Error();
    }
    fixtureIdentity = directoryIdentity(directory);
  } catch {
    throw fixtureError("create");
  }

  async function assertCurrent() {
    assertDirectoryIdentity(canonicalTemporaryDirectory, canonicalTemporaryDirectory, temporaryIdentity,
      "assert-current");
    if (!sameNativePath(path.dirname(directory), canonicalTemporaryDirectory)
      || !path.basename(directory).startsWith(FIXTURE_PREFIX)) {
      throw fixtureError("assert-current");
    }
    assertDirectoryIdentity(directory, directory, fixtureIdentity, "assert-current");
    return true;
  }

  let removed = false;
  async function remove(onProgress) {
    if (removed) return;
    for (let attempt = 0; attempt < REMOVE_ATTEMPTS; attempt += 1) {
      const attemptNumber = attempt + 1;
      const identityStartedAt = Date.now();
      reportRemoveProgress(onProgress, "identity_check_start", attemptNumber, 0);
      try {
        await assertCurrent();
      } catch (error) {
        reportRemoveProgress(onProgress, "identity_check_failed", attemptNumber, Date.now() - identityStartedAt);
        throw error;
      }
      reportRemoveProgress(onProgress, "identity_check_done", attemptNumber, Date.now() - identityStartedAt);
      const removalStartedAt = Date.now();
      reportRemoveProgress(onProgress, "rm_start", attemptNumber, 0);
      try {
        await rm(directory, { recursive: true, maxRetries: 0 });
        removed = true;
        reportRemoveProgress(onProgress, "rm_done", attemptNumber, Date.now() - removalStartedAt);
        return;
      } catch (error) {
        if (!RETRYABLE_REMOVE_CODES.has(error?.code) || attempt + 1 === REMOVE_ATTEMPTS) {
          reportRemoveProgress(onProgress, "rm_failed", attemptNumber, Date.now() - removalStartedAt,
            safeRemoveErrorCode(error));
          throw fixtureError("remove");
        }
        reportRemoveProgress(onProgress, "retry", attemptNumber, Date.now() - removalStartedAt,
          safeRemoveErrorCode(error));
        await delay(REMOVE_RETRY_DELAY_MS);
      }
    }
    throw fixtureError("remove");
  }

  return Object.freeze({ directory, assertCurrent, remove });
}
