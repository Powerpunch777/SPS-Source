import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, readdir, rm } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createHash, createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { canonicalNativeSmokeDirectorySync } from "../src/native-identity-smoke-paths.mjs";
import {
  createNativeIdentityFailureReport,
  formatNativeIdentityFailure,
  isNativeIdentityFingerprint,
  isNativeIdentityVersion,
  parseNativeIdentityFailure,
  serializeNativeIdentityFailure,
} from "../src/native-identity-smoke-diagnostics.mjs";

const run = promisify(execFile);
const entry = fileURLToPath(import.meta.url);
const prefix = "sps-native-identity-smoke-";
const marker = "SPS_NATIVE_IDENTITY_SMOKE=";
const expectedElectronVersion = createRequire(import.meta.url)("../package-lock.json").packages["node_modules/electron"].version;
const successKeys = [
  "phase", "result", "realWindowsSafeStorage", "electronRuntimeVersion", "nodeRuntimeVersion",
  "serverSpkiSha256", "memberIssuerSpkiSha256", "vaultUnchanged", "plaintextKeyAbsent",
  "memberPendingKeyProtected", "memberPendingSpkiSha256",
  "memberIssuedCredentialProtected", "memberIssuedCertificateSha256",
];

function failureReport(phase, stage, errorCode, electronRuntimeVersion = null, nodeRuntimeVersion = null) {
  return createNativeIdentityFailureReport({
    phase, stage, errorCode, electronRuntimeVersion, nodeRuntimeVersion, expectedElectronVersion,
  });
}

function parseSuccess(stdout, phase) {
  if (typeof stdout !== "string") return null;
  const lines = stdout.split(/\r?\n/).filter(line => line.startsWith(marker));
  if (lines.length !== 1) return null;
  let value;
  try { value = JSON.parse(lines[0].slice(marker.length)); }
  catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const actualKeys = Object.keys(value).sort();
  if (actualKeys.length !== successKeys.length
    || actualKeys.some((key, index) => key !== [...successKeys].sort()[index])) return null;
  if (value.phase !== phase || value.result !== "passed" || value.realWindowsSafeStorage !== true
    || value.vaultUnchanged !== true || value.plaintextKeyAbsent !== true
    || value.memberPendingKeyProtected !== true
    || value.memberIssuedCredentialProtected !== true
    || !isNativeIdentityVersion(value.electronRuntimeVersion)
    || !isNativeIdentityVersion(value.nodeRuntimeVersion)
    || !isNativeIdentityFingerprint(value.serverSpkiSha256)
    || !isNativeIdentityFingerprint(value.memberIssuerSpkiSha256)
    || !isNativeIdentityFingerprint(value.memberPendingSpkiSha256)
    || !isNativeIdentityFingerprint(value.memberIssuedCertificateSha256)) return null;
  return Object.fromEntries(successKeys.map(key => [key, value[key]]));
}

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
  const args = process.argv.slice(2);
  const phase = args[2] === "reload" ? "reload" : "create";
  let stage = "electron_startup";
  let app;
  let watchdog;
  let failureReported = false;
  const emitFailure = (errorCode, failureStage = stage) => {
    if (failureReported) return;
    failureReported = true;
    const line = serializeNativeIdentityFailure(failureReport(
      phase, failureStage, errorCode, process.versions.electron ?? null, process.versions.node ?? null,
    ));
    if (!line) return Promise.resolve();
    return new Promise(resolve => {
      try { process.stderr.write(`${line}\n`, resolve); }
      catch { resolve(); }
    });
  };

  try {
    const electron = createRequire(import.meta.url)("electron");
    ({ app } = electron);
    const { safeStorage } = electron;
    if (args.length !== 3 || args[0] !== "--isolated-native-identity" || !["create", "reload"].includes(args[2])) {
      stage = "arguments";
      await emitFailure("invalid_invocation");
      app.exit(1);
      return;
    }

    // Electron's pre-ready configuration must finish before the first await.
    stage = "root_validation";
    let root, temp;
    try { root = canonicalNativeSmokeDirectorySync(args[1]); }
    catch { await emitFailure("smoke_root_directory_invalid"); app.exit(1); return; }
    try { temp = canonicalNativeSmokeDirectorySync(os.tmpdir()); }
    catch { await emitFailure("smoke_temp_directory_invalid"); app.exit(1); return; }
    if (path.dirname(root) !== temp) {
      await emitFailure("smoke_root_parent_mismatch");
      app.exit(1);
      return;
    }
    if (!path.basename(root).startsWith(prefix)) {
      await emitFailure("smoke_root_prefix_invalid");
      app.exit(1);
      return;
    }
    const userDataDirectory = path.join(root, "electron-user-data");
    const vaultDirectory = path.join(root, "empty-owner-vault");
    stage = "user_data_setup";
    mkdirSync(userDataDirectory, { recursive: true });
    mkdirSync(vaultDirectory, { recursive: true });
    if (canonicalNativeSmokeDirectorySync(userDataDirectory) !== userDataDirectory
      || canonicalNativeSmokeDirectorySync(vaultDirectory) !== vaultDirectory) {
      await emitFailure("smoke_directory_setup_failed");
      app.exit(1);
      return;
    }
    app.setPath("userData", userDataDirectory);
    app.disableHardwareAcceleration();
    watchdog = setTimeout(() => {
      void emitFailure("smoke_watchdog_expired", "watchdog").then(() => app.exit(2));
    }, 30_000);

    stage = "app_ready";
    await app.whenReady();
    stage = "runtime_validation";
    if (process.versions.electron !== expectedElectronVersion) {
      await emitFailure("electron_version_mismatch");
      clearTimeout(watchdog);
      app.exit(1);
      return;
    }
    stage = "secure_storage";
    if (safeStorage.isEncryptionAvailable() !== true) {
      await emitFailure("secure_storage_unavailable");
      clearTimeout(watchdog);
      app.exit(1);
      return;
    }

    stage = "identity_store";
    // Node's coordinator must reject runtime overrides without loading PKI or
    // key-store code. Electron loads it only after its pre-ready path setup,
    // pinned-runtime and secure-storage checks have completed.
    const { createSpsNativeHostIdentity, inspectSpsNativeHostIdentity } = await import("../src/native-identity-certificates.mjs");
    const { createSpsNativeHostIdentityStore } = await import("../src/native-identity-store.mjs");
    const { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate,
      publicSpsNativeMemberEnrollmentRequest } = await import("../src/native-member-certificates.mjs");
    const { createSpsNativeMemberPendingKeyStore, createSpsNativeMemberHostTargetReader,
      createSpsNativeMemberPublicationRecovery } = await import("../src/native-member-pending-store.mjs");
    const store = createSpsNativeHostIdentityStore({ userDataDirectory, vaultDirectory, safeStorage });
    if (args[2] === "create") {
      assert.equal(await store.read(), null);
      stage = "identity_create";
      const now = Math.floor(Date.now() / 1000) * 1000;
      const identity = await createSpsNativeHostIdentity({
        hostId: "11111111-1111-4111-8111-111111111111", hostnames: ["127.0.0.1"],
        notBefore: now - 1000, notAfter: now + 300_000, issuerNotAfter: now + 600_000,
      });
      await store.create(identity);
      assert.equal((await store.read()).server.privateKeyPem, identity.server.privateKeyPem);
    }
    stage = "identity_reload";
    const loaded = await store.read();
    assert.ok(loaded);
    await assert.rejects(store.create(loaded), { code: "ERR_SPS_NATIVE_IDENTITY_ALREADY_EXISTS" });
    stage = "storage_validation";
    const credentials = path.join(userDataDirectory, "native-connectivity", "credentials");
    const files = await readdir(credentials);
    assert.equal(files.length, 1);
    const bytes = await readFile(path.join(credentials, files[0]));
    assert.doesNotMatch(bytes.toString("utf8"), /PRIVATE KEY|CERTIFICATE|privateKeyPem|11111111/);
    assert.equal((await readdir(vaultDirectory)).length, 0);
    const status = inspectSpsNativeHostIdentity(loaded);
    assert.equal(status.state, "identity_prepared");
    stage = "member_pending_reload";
    const memberContext = { identityIssuer: "https://identity.fixture.invalid", subject: "native-smoke-fixture-user",
      hostId: loaded.hostId, deviceKeyId: "22222222-2222-4222-8222-222222222222",
      serverSpkiSha256: status.serverSpkiSha256, issuerSpkiSha256: status.memberIssuerSpkiSha256 };
    const memberStoreOptions = { userDataDirectory, vaultDirectory, context: memberContext, safeStorage };
    const memberStore = createSpsNativeMemberPendingKeyStore(memberStoreOptions);
    if (args[2] === "create") {
      stage = "member_pending_create";
      assert.equal(await memberStore.read(), null);
      const keyRequest = await createSpsNativeMemberKeyRequest({ hostId: memberContext.hostId, deviceKeyId: memberContext.deviceKeyId });
      await memberStore.create(keyRequest);
    }
    stage = "member_pending_reload";
    const memberDirectory = path.join(userDataDirectory, "native-connectivity", "member-pending");
    const memberFiles = await readdir(memberDirectory);
    assert.equal(memberFiles.length, args[2] === "create" ? 1 : 3);
    const memberFile = path.join(memberDirectory, memberFiles.find(name => !name.endsWith(".issued.json") && !name.endsWith(".target.json")));
    const memberStat = await lstat(memberFile);
    assert.ok(memberStat.isFile() && !memberStat.isSymbolicLink() && memberStat.nlink === 1 && memberStat.size <= 96 * 1024);
    const memberBytes = await readFile(memberFile, "utf8");
    assert.doesNotMatch(memberBytes, /PRIVATE KEY|CERTIFICATE REQUEST|privateKeyPem|native-smoke-fixture-user/);
    const memberKey = await memberStore.read();
    assert.ok(memberKey);
    await assert.rejects(memberStore.create(memberKey), { code: "ERR_SPS_NATIVE_MEMBER_PENDING_STORE_ALREADY_EXISTS" });
    const anotherAccount = createSpsNativeMemberPendingKeyStore({ ...memberStoreOptions,
      context: { ...memberContext, subject: "different-fixture-user" } });
    assert.equal(await anotherAccount.read(), null);
    const changedPin = createSpsNativeMemberPendingKeyStore({ ...memberStoreOptions,
      context: { ...memberContext, issuerSpkiSha256: memberContext.issuerSpkiSha256 === "a".repeat(64) ? "b".repeat(64) : "a".repeat(64) } });
    await assert.rejects(changedPin.read(), { code: "ERR_SPS_NATIVE_MEMBER_PENDING_STORE_CORRUPT" });
    if (args[2] === "create") {
      stage = "member_issued_create";
      const now = Math.floor(Date.now() / 1000) * 1000;
      const issued = await issueSpsNativeMemberCertificate({ hostIdentity: loaded,
        request: await publicSpsNativeMemberEnrollmentRequest(memberKey), notBefore: now,
        notAfter: now + 120_000, now });
      await memberStore.createIssued({ enrollmentId: "33333333-3333-4333-8333-333333333333",
        certificate: new X509Certificate(issued.certificatePem).raw.toString("base64url"),
        issuerCertificate: new X509Certificate(issued.issuerCertificatePem).raw.toString("base64url"),
        expiresAt: new Date(now + 60_000).toISOString() });
    }
    stage = "member_issued_reload";
    const prepared = await memberStore.readIssued();
    assert.ok(prepared);
    assert.equal(prepared.credential.privateKeyPem, memberKey.privateKeyPem);
    await assert.rejects(memberStore.createIssued(prepared.issuance), { code: "ERR_SPS_NATIVE_MEMBER_PENDING_STORE_ALREADY_EXISTS" });
    await assert.rejects(changedPin.readIssued(), { code: "ERR_SPS_NATIVE_MEMBER_PENDING_STORE_CORRUPT" });
    const issuedFiles = (await readdir(memberDirectory)).filter(name => name.endsWith(".issued.json"));
    assert.equal(issuedFiles.length, 1);
    const issuedBytes = await readFile(path.join(memberDirectory, issuedFiles[0]), "utf8");
    assert.doesNotMatch(issuedBytes, /PRIVATE KEY|CERTIFICATE|privateKeyPem|requestPem|native-smoke-fixture-user/);
    const issuedPlaintext = safeStorage.decryptString(Buffer.from(JSON.parse(issuedBytes).ciphertext, "base64"));
    assert.doesNotMatch(issuedPlaintext, /PRIVATE KEY|CERTIFICATE REQUEST|privateKeyPem|requestPem|pairingSecret/);
    assert.equal(await readFile(memberFile, "utf8"), memberBytes);
    assert.equal((await lstat(memberFile)).ino, memberStat.ino);
    const memberIssuedCertificateSha256 = createHash("sha256").update(new X509Certificate(prepared.credential.certificatePem).raw).digest("hex");
    const retainedTarget = { v: 1, kind: "sps.native.member-host-target", context: memberContext,
      origin: "https://127.0.0.1:43123", serverCertificatePem: loaded.server.certificatePem };
    const indexedScope = { identityIssuer: memberContext.identityIssuer, subject: memberContext.subject,
      hostId: memberContext.hostId, deviceKeyId: memberContext.deviceKeyId };
    if (args[2] === "create") await memberStore.createTarget(retainedTarget);
    const coldOptions = { userDataDirectory, vaultDirectory, scope: indexedScope, safeStorage };
    assert.deepEqual(await createSpsNativeMemberHostTargetReader(coldOptions).read(), retainedTarget);
    // Verify the explicit cold recovery composition against real Windows
    // encryption too. A completed store must require no alias removal.
    assert.deepEqual(await createSpsNativeMemberPublicationRecovery(coldOptions)
      .recoverInterruptedPublications({ beforeCommit() {} }), { recovered: [] });
    assert.equal((await memberStore.read()).privateKeyPem, memberKey.privateKeyPem);
    assert.equal((await memberStore.readIssued()).credential.certificatePem, prepared.credential.certificatePem);
    const targetFiles = (await readdir(memberDirectory)).filter(name => name.endsWith(".target.json"));
    assert.equal(targetFiles.length, 1);
    const targetBytes = await readFile(path.join(memberDirectory, targetFiles[0]), "utf8");
    assert.doesNotMatch(targetBytes, /PRIVATE KEY|CERTIFICATE|privateKeyPem|native-smoke-fixture-user|127\.0\.0\.1/);
    assert.equal((await readdir(vaultDirectory)).length, 0);
    const memberPendingSpkiSha256 = createHash("sha256")
      .update(createPublicKey(createPrivateKey(memberKey.privateKeyPem)).export({ type: "spki", format: "der" })).digest("hex");
    console.log(marker + JSON.stringify({
      phase: args[2], result: "passed", realWindowsSafeStorage: true,
      electronRuntimeVersion: process.versions.electron, nodeRuntimeVersion: process.versions.node,
      serverSpkiSha256: status.serverSpkiSha256, memberIssuerSpkiSha256: status.memberIssuerSpkiSha256,
      vaultUnchanged: true, plaintextKeyAbsent: true,
      memberPendingKeyProtected: true, memberPendingSpkiSha256,
      memberIssuedCredentialProtected: true, memberIssuedCertificateSha256,
    }));
    clearTimeout(watchdog);
    app.exit(0);
  } catch {
    if (watchdog) clearTimeout(watchdog);
    if (!failureReported) {
      const fallbackCode = stage === "electron_startup" || stage === "app_ready" ? "electron_startup_failed"
        : stage === "root_validation" ? "unsafe_smoke_root"
          : stage === "user_data_setup" ? "smoke_directory_setup_failed"
            : stage === "runtime_validation" ? "electron_version_mismatch"
              : stage === "secure_storage" ? "secure_storage_unavailable"
                : stage === "arguments" ? "invalid_invocation"
                  : stage.startsWith("member_pending_") || stage.startsWith("member_issued_") ? "member_pending_operation_failed" : "identity_operation_failed";
      await emitFailure(fallbackCode);
    }
    app?.exit(1);
  }
}

async function orchestrate() {
  let temp;
  let root;
  let original;
  let canonical;
  let created;
  let failure;
  let succeeded = false;
  let phase = "create";
  let parentStage = "orchestration";
  try {
    if (process.platform !== "win32" || process.argv.length !== 2) {
      failure = failureReport(phase, "orchestration", "orchestration_failed");
    } else {
      parentStage = "root_validation";
      temp = await plainDirectory(os.tmpdir());
      const binary = path.resolve(path.dirname(entry), "../node_modules/electron/dist/electron.exe");
      if (Object.hasOwn(process.env, "SPS_NATIVE_IDENTITY_SMOKE_ELECTRON_BINARY")) {
        failure = failureReport(phase, "runtime_validation", "runtime_override_disallowed");
      }
      if (!failure) {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        delete env.NODE_OPTIONS;
        parentStage = "user_data_setup";
        root = await mkdtemp(path.join(temp, prefix));
        original = await lstat(root);
        parentStage = "root_validation";
        canonical = await plainDirectory(root);
        parentStage = "electron_startup";
        for (phase of ["create", "reload"]) {
          const pending = run(binary, [entry, "--isolated-native-identity", root, phase], {
            env, windowsHide: true, timeout: 45_000, maxBuffer: 64 * 1024,
          });
          let output;
          try { output = await pending; }
          catch (error) {
            const childFailure = parseNativeIdentityFailure(error?.stderr, { phase, expectedElectronVersion });
            failure = childFailure ?? failureReport(
              phase,
              error?.code === "ETIMEDOUT" ? "watchdog" : "electron_startup",
              error?.code === "ETIMEDOUT" ? "smoke_watchdog_expired" : "electron_process_failed",
            );
          } finally {
            if (pending.child?.exitCode === null) {
              await run("taskkill", ["/pid", String(pending.child.pid), "/t", "/f"], { windowsHide: true, timeout: 10_000 }).catch(() => {});
            }
          }
          if (failure) break;
          const childFailure = parseNativeIdentityFailure(output.stderr, { phase, expectedElectronVersion });
          if (childFailure) {
            failure = childFailure;
            break;
          }
          const report = parseSuccess(output.stdout, phase);
          if (!report) {
            failure = failureReport(phase, "child_protocol", "child_report_invalid");
            break;
          }
          if (report.electronRuntimeVersion !== expectedElectronVersion) {
            failure = failureReport(phase, "runtime_validation", "electron_version_mismatch",
              report.electronRuntimeVersion, report.nodeRuntimeVersion);
            break;
          }
          if (created && (report.serverSpkiSha256 !== created.serverSpkiSha256
            || report.memberIssuerSpkiSha256 !== created.memberIssuerSpkiSha256
            || report.memberPendingSpkiSha256 !== created.memberPendingSpkiSha256
            || report.memberIssuedCertificateSha256 !== created.memberIssuedCertificateSha256
            || report.electronRuntimeVersion !== created.electronRuntimeVersion
            || report.nodeRuntimeVersion !== created.nodeRuntimeVersion)) {
            failure = failureReport(phase, "identity_reload", "identity_operation_failed",
              report.electronRuntimeVersion, report.nodeRuntimeVersion);
            break;
          }
          if (!created) created = report;
        }
        succeeded = !failure && Boolean(created);
      }
    }
  } catch {
    if (!failure) {
      const code = parentStage === "root_validation" ? "unsafe_smoke_root"
        : parentStage === "user_data_setup" ? "smoke_directory_setup_failed"
          : parentStage === "electron_startup" ? "electron_process_failed" : "orchestration_failed";
      const stage = ["root_validation", "user_data_setup", "electron_startup"].includes(parentStage)
        ? parentStage : "orchestration";
      failure = failureReport(phase, stage, code);
    }
  }
  if (root && original && canonical) {
    try {
      parentStage = "owned_temp_cleanup";
      const current = await lstat(root);
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== original.dev || current.ino !== original.ino
        || await plainDirectory(root) !== canonical || path.dirname(canonical) !== temp
        || !path.basename(canonical).startsWith(prefix)) {
        if (!failure) failure = failureReport(phase, "owned_temp_cleanup", "owned_temp_cleanup_refused");
      } else await rm(root, { recursive: true });
    } catch {
      if (!failure) failure = failureReport(phase, "owned_temp_cleanup", "owned_temp_cleanup_refused");
    }
  }

  if (failure) {
    const line = serializeNativeIdentityFailure(failure);
    if (line) console.error(line);
    console.error(formatNativeIdentityFailure(failure));
    process.exitCode = 1;
  } else if (succeeded && created) {
    console.log(JSON.stringify({ result: "passed", phases: ["create", "separate-process-reload"],
      realWindowsSafeStorage: true, customerDataUsed: false, osCertificateStoreChanged: false,
      listenerStarted: false, sameKeyAfterRestart: true,
      memberPendingKeyProtected: true, sameMemberKeyAfterRestart: true,
      memberIssuedCredentialProtected: true, sameMemberCertificateAfterRestart: true,
      electronRuntimeVersion: created.electronRuntimeVersion, nodeRuntimeVersion: created.nodeRuntimeVersion }));
  }
}

if (process.versions.electron) {
  // app.whenReady() must not block Electron's ESM entry evaluation.
  void electronPhase();
} else await orchestrate();
