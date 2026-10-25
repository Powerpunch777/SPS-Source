import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, readdir, rm } from "node:fs/promises";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createSpsNativeHostIdentity, inspectSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeHostIdentityStore } from "../src/native-identity-store.mjs";

const run = promisify(execFile);
const entry = fileURLToPath(import.meta.url);
const prefix = "sps-native-identity-smoke-";
const marker = "SPS_NATIVE_IDENTITY_SMOKE=";

async function plainDirectory(directory) {
  const resolved = path.resolve(directory);
  for (let current = resolved;; current = path.dirname(current)) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Native identity smoke refuses linked directories.");
    if (path.dirname(current) === current) break;
  }
  return realpath(resolved);
}

async function electronPhase() {
  const { app, safeStorage } = createRequire(import.meta.url)("electron");
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "--isolated-native-identity" || !["create", "reload"].includes(args[2])) {
    throw new Error("Invalid isolated Native identity smoke invocation.");
  }
  // Electron's pre-ready configuration must finish before the first await.
  const plainSync = directory => {
    for (let current = path.resolve(directory);; current = path.dirname(current)) {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Linked smoke directory.");
      if (path.dirname(current) === current) break;
    }
    return realpathSync(directory);
  };
  const root = plainSync(args[1]);
  const temp = plainSync(os.tmpdir());
  if (path.dirname(root) !== temp || !path.basename(root).startsWith(prefix)) throw new Error("Invalid isolated smoke root.");
  const userDataDirectory = path.join(root, "electron-user-data");
  const vaultDirectory = path.join(root, "empty-owner-vault");
  mkdirSync(userDataDirectory, { recursive: true });
  mkdirSync(vaultDirectory, { recursive: true });
  if (plainSync(userDataDirectory) !== userDataDirectory || plainSync(vaultDirectory) !== vaultDirectory) {
    throw new Error("Native identity smoke directories changed.");
  }
  app.setPath("userData", userDataDirectory);
  app.disableHardwareAcceleration();
  const watchdog = setTimeout(() => app.exit(2), 30_000);
  try {
    await app.whenReady();
    const expectedElectron = createRequire(import.meta.url)("../package-lock.json").packages["node_modules/electron"].version;
    assert.equal(process.versions.electron, expectedElectron, "The smoke runtime must match the installed dependency version.");
    assert.equal(safeStorage.isEncryptionAvailable(), true, "Real Windows secure storage is required.");
    const store = createSpsNativeHostIdentityStore({ userDataDirectory, vaultDirectory, safeStorage });
    if (args[2] === "create") {
      assert.equal(await store.read(), null);
      const now = Math.floor(Date.now() / 1000) * 1000;
      const identity = await createSpsNativeHostIdentity({
        hostId: "11111111-1111-4111-8111-111111111111", hostnames: ["127.0.0.1"],
        notBefore: now - 1000, notAfter: now + 300_000, issuerNotAfter: now + 600_000,
      });
      await store.create(identity);
      assert.equal((await store.read()).server.privateKeyPem, identity.server.privateKeyPem);
    }
    const loaded = await store.read();
    assert.ok(loaded);
    await assert.rejects(store.create(loaded), { code: "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS" });
    const credentials = path.join(userDataDirectory, "native-connectivity", "credentials");
    const files = await readdir(credentials);
    assert.equal(files.length, 1);
    const bytes = await readFile(path.join(credentials, files[0]));
    assert.doesNotMatch(bytes.toString("utf8"), /PRIVATE KEY|CERTIFICATE|privateKeyPem|11111111/);
    assert.equal((await readdir(vaultDirectory)).length, 0);
    const status = inspectSpsNativeHostIdentity(loaded);
    assert.equal(status.state, "identity_prepared");
    console.log(marker + JSON.stringify({
      phase: args[2], result: "passed", realWindowsSafeStorage: true,
      electronRuntimeVersion: process.versions.electron, nodeRuntimeVersion: process.versions.node,
      serverSpkiSha256: status.serverSpkiSha256, memberIssuerSpkiSha256: status.memberIssuerSpkiSha256,
      vaultUnchanged: true, plaintextKeyAbsent: true,
    }));
    clearTimeout(watchdog);
    app.exit(0);
  } catch {
    clearTimeout(watchdog);
    console.error("Isolated Native identity secure-storage checks failed. No customer data was used.");
    app.exit(1);
  }
}

async function orchestrate() {
  if (process.platform !== "win32" || process.argv.length !== 2) throw new Error("This isolated secure-storage smoke requires Windows and no arguments.");
  const temp = await plainDirectory(os.tmpdir());
  const override = process.env.SPS_NATIVE_IDENTITY_SMOKE_ELECTRON_BINARY;
  let binary = path.resolve(path.dirname(entry), "../node_modules/electron/dist/electron.exe");
  if (override !== undefined) {
    if (!path.isAbsolute(override)) throw new Error("An isolated Electron override must be an absolute executable path.");
    const directory = await plainDirectory(path.dirname(override));
    const relative = path.relative(temp, directory);
    const binaryStat = await lstat(override);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      || path.basename(override) !== "electron.exe" || !binaryStat.isFile() || binaryStat.isSymbolicLink()
      || await realpath(override) !== path.join(directory, "electron.exe")) throw new Error("Invalid isolated Electron override.");
    binary = override;
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const root = await mkdtemp(path.join(temp, prefix));
  const original = await lstat(root);
  const canonical = await plainDirectory(root);
  let created;
  try {
    for (const phase of ["create", "reload"]) {
      const pending = run(binary, [entry, "--isolated-native-identity", root, phase], {
        env, windowsHide: true, timeout: 45_000, maxBuffer: 64 * 1024,
      });
      let output;
      try { output = await pending; }
      catch { throw new Error(`Isolated Native identity ${phase} process failed; raw process output was withheld.`); }
      finally {
        if (pending.child?.exitCode === null) {
          await run("taskkill", ["/pid", String(pending.child.pid), "/t", "/f"], { windowsHide: true, timeout: 10_000 }).catch(() => {});
        }
      }
      const lines = output.stdout.split(/\r?\n/).filter(line => line.startsWith(marker));
      assert.equal(lines.length, 1);
      const report = JSON.parse(lines[0].slice(marker.length));
      assert.equal(report.phase, phase);
      assert.equal(report.result, "passed");
      if (created) {
        assert.equal(report.serverSpkiSha256, created.serverSpkiSha256);
        assert.equal(report.memberIssuerSpkiSha256, created.memberIssuerSpkiSha256);
        assert.equal(report.electronRuntimeVersion, created.electronRuntimeVersion);
        assert.equal(report.nodeRuntimeVersion, created.nodeRuntimeVersion);
      } else created = report;
    }
    console.log(JSON.stringify({ result: "passed", phases: ["create", "separate-process-reload"],
      realWindowsSafeStorage: true, customerDataUsed: false, osCertificateStoreChanged: false,
      listenerStarted: false, sameKeyAfterRestart: true,
      electronRuntimeVersion: created.electronRuntimeVersion, nodeRuntimeVersion: created.nodeRuntimeVersion }));
  } finally {
    const current = await lstat(root);
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== original.dev || current.ino !== original.ino
      || await plainDirectory(root) !== canonical || path.dirname(canonical) !== temp
      || !path.basename(canonical).startsWith(prefix)) throw new Error("Refusing unsafe Native identity smoke cleanup.");
    await rm(root, { recursive: true });
  }
}

if (process.versions.electron) {
  // Let Electron finish loading its ESM entry before waiting for app readiness.
  void electronPhase().catch(() => {
    console.error("Isolated Native identity initialization failed.");
    createRequire(import.meta.url)("electron").app.exit(1);
  });
} else await orchestrate();
