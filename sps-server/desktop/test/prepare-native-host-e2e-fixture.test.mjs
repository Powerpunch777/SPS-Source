import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  NATIVE_HOST_FIXTURE_ARG,
  NATIVE_HOST_FIXTURE_KIND,
  NATIVE_HOST_FIXTURE_PREFIX,
  assertNativeHostFixtureDirectorySnapshot,
  captureNativeHostFixtureDirectorySnapshot,
  validateNativeHostFixtureCanonicalPaths,
} from "../scripts/prepare-native-host-e2e-fixture.mjs";
import { canonicalNativeSmokeDirectorySync } from "../src/native-identity-smoke-paths.mjs";

const runFile = promisify(execFile);
const desktopRoot = path.resolve(import.meta.dirname, "..");
const helperPath = fileURLToPath(new URL("../scripts/prepare-native-host-e2e-fixture.mjs", import.meta.url));
const electronBinary = path.join(desktopRoot, "node_modules", "electron", "dist", "electron.exe");
const packageJson = JSON.parse(await readFile(path.join(desktopRoot, "package.json"), "utf8"));

function samePath(left, right) {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function sameRootIdentity(stat, identity) {
  const attributes = Number(stat.attributes ?? 0);
  return stat.isDirectory() && !stat.isSymbolicLink()
    && !(process.platform === "win32" && (attributes & 0x400) !== 0)
    && stat.dev === identity.dev && stat.ino === identity.ino && stat.birthtimeNs === identity.birthtimeNs;
}

async function assertNoLinksOrReparsePoints(directory) {
  for (const name of await readdir(directory)) {
    const entry = path.join(directory, name);
    const stat = await lstat(entry, { bigint: true });
    const attributes = Number(stat.attributes ?? 0);
    if (stat.isSymbolicLink() || (process.platform === "win32" && (attributes & 0x400) !== 0)) {
      throw new Error("Refusing to remove a fixture tree containing a link or reparse point.");
    }
    if (stat.isDirectory()) await assertNoLinksOrReparsePoints(entry);
  }
}

async function removeFixtureTree(snapshot) {
  const tempDirectory = canonicalNativeSmokeDirectorySync(os.tmpdir());
  const userDataDirectory = canonicalNativeSmokeDirectorySync(snapshot.userDataDirectory);
  const vaultDirectory = canonicalNativeSmokeDirectorySync(path.join(userDataDirectory, "owner-vault"));
  validateNativeHostFixtureCanonicalPaths({ userDataDirectory, tempDirectory, vaultDirectory });
  const beforeScan = await lstat(userDataDirectory, { bigint: true });
  assert.ok(sameRootIdentity(beforeScan, snapshot.userDataIdentity), "fixture root identity changed before cleanup");
  await assertNoLinksOrReparsePoints(userDataDirectory);

  const finalTemp = canonicalNativeSmokeDirectorySync(os.tmpdir());
  const finalRoot = canonicalNativeSmokeDirectorySync(snapshot.userDataDirectory);
  const finalVault = canonicalNativeSmokeDirectorySync(path.join(finalRoot, "owner-vault"));
  validateNativeHostFixtureCanonicalPaths({
    userDataDirectory: finalRoot,
    tempDirectory: finalTemp,
    vaultDirectory: finalVault,
  });
  const immediatelyBeforeRemoval = await lstat(finalRoot, { bigint: true });
  assert.ok(sameRootIdentity(immediatelyBeforeRemoval, snapshot.userDataIdentity), "fixture root identity changed during cleanup validation");
  await rm(finalRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
}

async function stopFixtureChild(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  await runFile("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"]).catch(() => undefined);
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 8_000))]);
  }
  assert.ok(child.exitCode !== null || child.signalCode !== null, "fixture Electron process remained alive after taskkill");
}

test("accepts only the exact isolated E2E profile and its existing owner-vault child", () => {
  const tempDirectory = path.resolve(os.tmpdir());
  const userDataDirectory = path.join(tempDirectory, `${NATIVE_HOST_FIXTURE_PREFIX}unit`);
  const vaultDirectory = path.join(userDataDirectory, "owner-vault");
  assert.deepEqual(
    validateNativeHostFixtureCanonicalPaths({ userDataDirectory, tempDirectory, vaultDirectory }),
    { userDataDirectory, tempDirectory, vaultDirectory },
  );
  assert.throws(() => validateNativeHostFixtureCanonicalPaths({
    userDataDirectory: path.join(tempDirectory, "real-profile"), tempDirectory,
    vaultDirectory: path.join(tempDirectory, "real-profile", "owner-vault"),
  }), /fixture_paths_invalid/);
  assert.throws(() => validateNativeHostFixtureCanonicalPaths({
    userDataDirectory, tempDirectory, vaultDirectory: path.join(userDataDirectory, "other-vault"),
  }), /fixture_paths_invalid/);
  assert.throws(() => validateNativeHostFixtureCanonicalPaths({
    userDataDirectory, tempDirectory: path.dirname(tempDirectory), vaultDirectory,
  }), /fixture_paths_invalid/);
});

test("captures and rechecks BigInt root and Vault identities without creating paths", async () => {
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), NATIVE_HOST_FIXTURE_PREFIX));
  const vaultDirectory = path.join(userDataDirectory, "owner-vault");
  let cleanupSnapshot;
  try {
    await mkdir(vaultDirectory);
    const snapshot = captureNativeHostFixtureDirectorySnapshot(userDataDirectory);
    cleanupSnapshot = snapshot;
    assert.equal(typeof snapshot.userDataIdentity.dev, "bigint");
    assert.equal(typeof snapshot.userDataIdentity.ino, "bigint");
    assert.equal(typeof snapshot.userDataIdentity.birthtimeNs, "bigint");
    assert.equal(typeof snapshot.vaultIdentity.dev, "bigint");
    assert.equal(typeof snapshot.vaultIdentity.ino, "bigint");
    assert.equal(typeof snapshot.vaultIdentity.birthtimeNs, "bigint");
    assert.deepEqual(await readdir(vaultDirectory), []);
    assertNativeHostFixtureDirectorySnapshot(snapshot);

    await rename(vaultDirectory, `${vaultDirectory}.old`);
    await mkdir(vaultDirectory);
    assert.throws(() => assertNativeHostFixtureDirectorySnapshot(snapshot), /fixture_snapshot_changed/);
  } finally {
    if (cleanupSnapshot) await removeFixtureTree(cleanupSnapshot);
  }
});

test("fixture source stays out of production Main, IPC, preload, and packaged files", async () => {
  const source = await readFile(helperPath, "utf8");
  const preload = await readFile(path.join(desktopRoot, "src", "preload.cjs"), "utf8");
  assert.match(source, /createSpsNativeHostIdentityStore/);
  assert.match(source, /createSpsNativeHostIdentity\(/);
  assert.match(source, /inspectSpsNativeHostIdentity\(/);
  assert.match(source, /store\.create\(identity/);
  assert.doesNotMatch(source, /(?:from|import)\s+["'][^"']*src[\\/]main\.mjs/);
  assert.doesNotMatch(source, /\b(?:ipcMain|ipcRenderer|contextBridge)\b|desktop:[a-z:-]+|spsCoreSettings/);
  assert.doesNotMatch(source, /createSpsNativeIdentityController|prepare-native-identity|showMessageBox|playwright|CDP/);
  assert.doesNotMatch(source, /\bmkdir(?:Sync)?\s*\(|\blisten\s*\(|firewall/i);
  assert.doesNotMatch(preload, /prepare-native-host-e2e-fixture/);
  assert.equal(path.basename(path.dirname(helperPath)), "scripts");
  assert.ok(Array.isArray(packageJson.build?.files));
  assert.equal(packageJson.build.files.some(pattern => /(^|\/)scripts?(?:\/|\*|$)/i.test(pattern)), false);
});

test("Windows Electron creates one encrypted prepared identity only in an isolated fixture", {
  skip: process.platform !== "win32" || !existsSync(electronBinary),
}, async () => {
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), NATIVE_HOST_FIXTURE_PREFIX));
  const vaultDirectory = path.join(userDataDirectory, "owner-vault");
  await mkdir(vaultDirectory);
  const cleanupSnapshot = captureNativeHostFixtureDirectorySnapshot(userDataDirectory);
  const vaultBefore = await lstat(vaultDirectory, { bigint: true });
  const vaultEntriesBefore = await readdir(vaultDirectory);
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_OPTIONS;
  delete childEnvironment.ELECTRON_RUN_AS_NODE;
  delete childEnvironment.ELECTRON_DISABLE_SECURITY_WARNINGS;
  const child = spawn(electronBinary, [helperPath, NATIVE_HOST_FIXTURE_ARG, userDataDirectory], {
    cwd: desktopRoot,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "ignore"],
  });
  let stdout = "";
  child.stdout.on("data", chunk => { stdout = `${stdout}${chunk.toString("utf8")}`.slice(0, 4096); });
  let timer;
  try {
    const [code, signal] = await Promise.race([
      new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (exitCode, exitSignal) => resolve([exitCode, exitSignal]));
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("fixture Electron process timed out")), 35_000); }),
    ]);
    clearTimeout(timer);
    assert.equal(signal, null);
    assert.equal(code, 0, "fixture Electron process failed");
    const lines = stdout.trim().split(/\r?\n/);
    assert.equal(lines.length, 1, "fixture must emit exactly one JSON record");
    const record = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(record).sort(), [
      "electronVersion", "hostId", "kind", "lanEnabled", "nodeVersion", "serverSpkiSha256",
    ].sort());
    assert.equal(record.kind, NATIVE_HOST_FIXTURE_KIND);
    assert.match(record.hostId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.match(record.serverSpkiSha256, /^[0-9a-f]{64}$/);
    assert.equal(record.lanEnabled, false);
    assert.match(record.electronVersion, /^\d+\.\d+\.\d+/);
    assert.match(record.nodeVersion, /^\d+\.\d+\.\d+/);
    assert.deepEqual(await readdir(vaultDirectory), vaultEntriesBefore);
    const vaultAfter = await lstat(vaultDirectory, { bigint: true });
    assert.equal(vaultAfter.dev, vaultBefore.dev);
    assert.equal(vaultAfter.ino, vaultBefore.ino);
    assert.equal(vaultAfter.birthtimeNs, vaultBefore.birthtimeNs);
  } finally {
    clearTimeout(timer);
    await stopFixtureChild(child);
    await removeFixtureTree(cleanupSnapshot);
  }
});
