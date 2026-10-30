import { lstatSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalNativeSmokeDirectorySync } from "../src/native-identity-smoke-paths.mjs";
import { createSpsNativeHostIdentity, inspectSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeHostIdentityStore } from "../src/native-identity-store.mjs";

export const NATIVE_HOST_FIXTURE_KIND = "sps.native.prepared-host-fixture";
export const NATIVE_HOST_FIXTURE_ARG = "--isolated-prepared-native-host-fixture";
export const NATIVE_HOST_FIXTURE_PREFIX = "sps-workspace-surfaces-e2e-";
const MAX_RECORD_BYTES = 512;
const WATCHDOG_MS = 30_000;

function samePath(left, right) {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export function validateNativeHostFixtureCanonicalPaths({
  userDataDirectory,
  tempDirectory,
  vaultDirectory,
} = {}) {
  if (![userDataDirectory, tempDirectory, vaultDirectory].every(value => typeof value === "string" && path.isAbsolute(value))) {
    throw new Error("fixture_paths_invalid");
  }
  const root = path.resolve(userDataDirectory);
  const temp = path.resolve(tempDirectory);
  const vault = path.resolve(vaultDirectory);
  if (!samePath(root, userDataDirectory) || !samePath(temp, tempDirectory) || !samePath(vault, vaultDirectory)
    || !samePath(path.dirname(root), temp)
    || !path.basename(root).startsWith(NATIVE_HOST_FIXTURE_PREFIX)
    || !samePath(vault, path.join(root, "owner-vault"))) {
    throw new Error("fixture_paths_invalid");
  }
  return Object.freeze({ userDataDirectory: root, tempDirectory: temp, vaultDirectory: vault });
}

function directoryIdentity(directory) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || stat.dev <= 0n || stat.ino <= 0n || stat.birthtimeNs <= 0n) {
    throw new Error("fixture_directory_identity_invalid");
  }
  return Object.freeze({ dev: stat.dev, ino: stat.ino, birthtimeNs: stat.birthtimeNs });
}

function canonicalFixturePaths(userDataDirectory, tempDirectory = os.tmpdir()) {
  const temp = canonicalNativeSmokeDirectorySync(tempDirectory);
  const root = canonicalNativeSmokeDirectorySync(userDataDirectory);
  const vault = canonicalNativeSmokeDirectorySync(path.join(root, "owner-vault"));
  return validateNativeHostFixtureCanonicalPaths({
    userDataDirectory: root,
    tempDirectory: temp,
    vaultDirectory: vault,
  });
}

export function captureNativeHostFixtureDirectorySnapshot(userDataDirectory, tempDirectory = os.tmpdir()) {
  let paths;
  try {
    paths = canonicalFixturePaths(userDataDirectory, tempDirectory);
    return Object.freeze({
      ...paths,
      userDataIdentity: directoryIdentity(paths.userDataDirectory),
      vaultIdentity: directoryIdentity(paths.vaultDirectory),
    });
  } catch {
    throw new Error("fixture_paths_invalid");
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs;
}

export function assertNativeHostFixtureDirectorySnapshot(snapshot) {
  try {
    const paths = canonicalFixturePaths(snapshot.userDataDirectory, snapshot.tempDirectory);
    const current = {
      userDataIdentity: directoryIdentity(paths.userDataDirectory),
      vaultIdentity: directoryIdentity(paths.vaultDirectory),
    };
    if (!samePath(paths.userDataDirectory, snapshot.userDataDirectory)
      || !samePath(paths.vaultDirectory, snapshot.vaultDirectory)
      || !sameIdentity(current.userDataIdentity, snapshot.userDataIdentity)
      || !sameIdentity(current.vaultIdentity, snapshot.vaultIdentity)) {
      throw new Error("fixture_snapshot_changed");
    }
  } catch {
    throw new Error("fixture_snapshot_changed");
  }
}

function writeRecord(record, app, exitCode) {
  let serialized;
  try {
    serialized = JSON.stringify(record);
    if (Buffer.byteLength(serialized, "utf8") > MAX_RECORD_BYTES) throw new Error("record_too_large");
  } catch {
    serialized = JSON.stringify({ kind: NATIVE_HOST_FIXTURE_KIND, stageCode: "record_invalid" });
    exitCode = 1;
  }
  process.stdout.write(`${serialized}\n`, () => {
    if (typeof app?.exit === "function") app.exit(exitCode);
    else process.exitCode = exitCode;
  });
}

async function runElectronFixture(args = process.argv.slice(2)) {
  let app = null;
  let watchdog = null;
  let finished = false;
  let stageCode = "electron_startup_failed";
  let snapshot = null;
  const finish = (record, exitCode) => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    writeRecord(record, app, exitCode);
  };
  const fail = code => finish({ kind: NATIVE_HOST_FIXTURE_KIND, stageCode: code }, 1);

  try {
    if (typeof process.versions.electron !== "string") {
      fail("electron_runtime_required");
      return;
    }
    const electron = createRequire(import.meta.url)("electron");
    app = electron?.app;
    if (!app || typeof app.setPath !== "function" || typeof app.whenReady !== "function") {
      fail("electron_runtime_unavailable");
      return;
    }
    process.once("uncaughtException", () => fail("uncaught_fixture_failure"));
    process.once("unhandledRejection", () => fail("unhandled_fixture_failure"));

    if (args.length !== 2 || args[0] !== NATIVE_HOST_FIXTURE_ARG) {
      fail("fixture_arguments_invalid");
      return;
    }

    stageCode = "fixture_paths_invalid";
    snapshot = captureNativeHostFixtureDirectorySnapshot(args[1]);
    // Keep the fixture's Electron profile selection synchronous and pre-ready.
    app.setPath("userData", snapshot.userDataDirectory);
    app.disableHardwareAcceleration?.();
    watchdog = setTimeout(() => fail("fixture_watchdog_expired"), WATCHDOG_MS);

    if (process.platform !== "win32") {
      fail("windows_required");
      return;
    }

    stageCode = "electron_ready_failed";
    await app.whenReady();
    assertNativeHostFixtureDirectorySnapshot(snapshot);

    stageCode = "safe_storage_unavailable";
    const { safeStorage } = electron;
    if (safeStorage?.isEncryptionAvailable?.() !== true
      || typeof safeStorage.encryptString !== "function"
      || typeof safeStorage.decryptString !== "function") {
      fail(stageCode);
      return;
    }

    stageCode = "fixture_store_unavailable";
    const store = createSpsNativeHostIdentityStore({
      userDataDirectory: snapshot.userDataDirectory,
      vaultDirectory: snapshot.vaultDirectory,
      safeStorage,
    });
    const presence = await store.inspectPresence();
    assertNativeHostFixtureDirectorySnapshot(snapshot);
    if (presence?.state !== "absent") {
      fail("fixture_identity_already_present");
      return;
    }
    const existing = await store.read();
    assertNativeHostFixtureDirectorySnapshot(snapshot);
    if (existing !== null) {
      fail("fixture_identity_already_present");
      return;
    }

    stageCode = "identity_generation_failed";
    const hostId = randomUUID();
    const now = Math.floor(Date.now() / 1000) * 1000;
    const identity = await createSpsNativeHostIdentity({
      hostId,
      hostnames: ["192.168.254.10"],
      notBefore: now - 60_000,
      notAfter: now + 60 * 60 * 1000,
      issuerNotAfter: now + 2 * 60 * 60 * 1000,
    });
    assertNativeHostFixtureDirectorySnapshot(snapshot);
    const generated = inspectSpsNativeHostIdentity(identity, Date.now());
    if (generated.state !== "identity_prepared" || generated.hostId !== hostId) {
      fail("identity_generation_invalid");
      return;
    }

    stageCode = "fixture_commit_failed";
    await store.create(identity, {
      beforeCommit: () => assertNativeHostFixtureDirectorySnapshot(snapshot),
    });
    assertNativeHostFixtureDirectorySnapshot(snapshot);

    stageCode = "fixture_verification_failed";
    const writtenPresence = await store.inspectPresence();
    assertNativeHostFixtureDirectorySnapshot(snapshot);
    if (writtenPresence?.state !== "present") {
      fail(stageCode);
      return;
    }
    const stored = await store.read();
    assertNativeHostFixtureDirectorySnapshot(snapshot);
    const verified = stored ? inspectSpsNativeHostIdentity(stored, Date.now()) : null;
    if (!verified || verified.state !== "identity_prepared" || verified.hostId !== hostId
      || verified.serverSpkiSha256 !== generated.serverSpkiSha256) {
      fail(stageCode);
      return;
    }

    finish({
      kind: NATIVE_HOST_FIXTURE_KIND,
      hostId,
      serverSpkiSha256: verified.serverSpkiSha256,
      lanEnabled: false,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
    }, 0);
  } catch {
    fail(stageCode);
  } finally {
    clearTimeout(watchdog);
  }
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runElectronFixture();
}
