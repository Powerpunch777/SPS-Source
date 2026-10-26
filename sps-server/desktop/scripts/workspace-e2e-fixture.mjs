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
  async function remove() {
    if (removed) return;
    for (let attempt = 0; attempt < REMOVE_ATTEMPTS; attempt += 1) {
      await assertCurrent();
      try {
        await rm(directory, { recursive: true, maxRetries: 0 });
        removed = true;
        return;
      } catch (error) {
        if (!RETRYABLE_REMOVE_CODES.has(error?.code) || attempt + 1 === REMOVE_ATTEMPTS) {
          throw fixtureError("remove");
        }
        await delay(REMOVE_RETRY_DELAY_MS);
      }
    }
    throw fixtureError("remove");
  }

  return Object.freeze({ directory, assertCurrent, remove });
}
