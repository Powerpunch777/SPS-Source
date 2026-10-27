import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("This development canary requires Windows.");
const runnerArgs = process.argv.slice(2);
if (runnerArgs.length > 1 || (runnerArgs.length === 1 && runnerArgs[0] !== "--preserve-module-paths")) {
  throw new Error("Choose no module-path option or exactly --preserve-module-paths.");
}
const modulePathMode = runnerArgs.length === 0 ? "baseline" : "preserve-module-paths";
const helperRunOption = modulePathMode === "baseline" ? "--run" : "--run-preserve-module-paths";

const execFile = promisify(nodeExecFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../../../");
const sdkRoot = path.join(repositoryRoot, "external", "sps-plugin-sdk");
const helperSource = path.join(scriptDirectory, "AppContainerNodeWorkerCanary.cs");
const workerSource = path.join(scriptDirectory, "fixtures", "appcontainer-node-worker.mjs");
const temporaryRoot = path.resolve(os.tmpdir());
const fixtureId = randomUUID().replaceAll("-", "");
const fixtureRoot = path.join(temporaryRoot, `sps-appcontainer-node-poc-${fixtureId}`);
const packageRoot = path.join(fixtureRoot, "package");
const sdkPackageRoot = path.join(packageRoot, "node_modules", "@sonparkserver", "plugin-sdk");
const workspaceRoot = path.join(fixtureRoot, "workspace");
const fakeVaultRoot = path.join(fixtureRoot, "fake-vault");
let helperBuildRoot;
let helperBuildIdentity;
let helperExecutable;
let runJournalHandle;
let runJournal;
let runJournalPath;
let runIdentityPath;
const compiler = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");

function samePath(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

async function assertPlainDirectory(directory) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Canary storage contains a linked directory.");
}

async function assertDirectoryAncestors(directory) {
  let current = path.resolve(directory);
  for (;;) {
    await assertPlainDirectory(current);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function assertPlainTree(directory) {
  await assertPlainDirectory(directory);
  for (const name of await readdir(directory)) {
    const child = path.join(directory, name);
    const stat = await lstat(child);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("Canary fixture contains an unsupported entry.");
    if (stat.isDirectory()) await assertPlainTree(child);
  }
}

async function copyFixedFile(source, target, sourceRoot) {
  const resolvedSource = path.resolve(source);
  const resolvedRoot = path.resolve(sourceRoot);
  const relative = path.relative(resolvedRoot, resolvedSource);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Canary source escaped its fixed root.");
  }
  await assertDirectoryAncestors(path.dirname(resolvedSource));
  const stat = await lstat(resolvedSource);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Canary source is not a plain file.");
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(resolvedSource, target);
}

async function identity(directory) {
  const stat = await lstat(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Canary fixture identity is unavailable.");
  return { dev: stat.dev, ino: stat.ino, birthtimeNs: stat.birthtimeNs };
}

function journalIdentity(value) {
  return { dev: String(value.dev), ino: String(value.ino), birthtimeNs: String(value.birthtimeNs) };
}

async function persistRunJournal() {
  const bytes = Buffer.from(`${JSON.stringify(runJournal)}\n`, "utf8");
  await runJournalHandle.truncate(0);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await runJournalHandle.write(bytes, offset, bytes.length - offset, offset);
    if (bytesWritten <= 0) throw new Error("Canary run journal write made no progress.");
    offset += bytesWritten;
  }
  await runJournalHandle.truncate(bytes.length);
  await runJournalHandle.sync();
}

async function createExclusiveIdentityRecord(filePath, record) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, offset);
      if (bytesWritten <= 0) throw new Error("Canary identity record write made no progress.");
      offset += bytesWritten;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function invokeHelperWithJournal() {
  let child;
  const completed = new Promise((resolve, reject) => {
    child = nodeExecFile(helperExecutable, [helperRunOption, fixtureId], {
      windowsHide: true,
      timeout: 150_000,
      maxBuffer: 16_384,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        resolve({ error });
      } else {
        resolve({ output: { stdout, stderr } });
      }
    });
  }).then(value => value, error => ({ error }));

  return (async () => {
    const pid = Number.isSafeInteger(child?.pid) && child.pid > 0 ? child.pid : null;
    runJournal.helperPid = pid;
    let journalError;
    try { await persistRunJournal(); }
    catch (error) { journalError = error; }
    const result = await completed;
    if (journalError) {
      preserveHelperBuild = true;
      removeFixtureAfterRun = false;
      const error = new Error("Canary run journal update failed; its fixture and helper are retained.");
      if (result.error?.stdout !== undefined) error.stdout = result.error.stdout;
      else if (result.output) error.stdout = result.output.stdout;
      throw error;
    }
    if (result.error) throw result.error;
    return result.output;
  })();
}

async function assertIdentity(directory, expected) {
  if (!samePath(path.dirname(directory), temporaryRoot)
    || path.basename(directory) !== `sps-appcontainer-node-poc-${fixtureId}`) throw new Error("Canary fixture cleanup target is invalid.");
  await assertDirectoryAncestors(directory);
  const current = await identity(directory);
  if (current.dev !== expected.dev || current.ino !== expected.ino || current.birthtimeNs !== expected.birthtimeNs) {
    throw new Error("Canary fixture identity changed.");
  }
  await assertPlainTree(directory);
}

async function removeFixture(directoryIdentity) {
  await assertIdentity(fixtureRoot, directoryIdentity);
  await rm(fixtureRoot, { recursive: true, maxRetries: 0 });
  try { await lstat(fixtureRoot); throw new Error("Canary fixture cleanup left an unexpected entry."); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

async function removeHelperBuild() {
  if (!samePath(path.dirname(helperBuildRoot), temporaryRoot)
    || !path.basename(helperBuildRoot).startsWith("sps-appcontainer-node-helper-")) throw new Error("Canary helper cleanup target is invalid.");
  await assertDirectoryAncestors(helperBuildRoot);
  const current = await identity(helperBuildRoot);
  if (current.dev !== helperBuildIdentity.dev || current.ino !== helperBuildIdentity.ino
    || current.birthtimeNs !== helperBuildIdentity.birthtimeNs) throw new Error("Canary helper identity changed.");
  await assertPlainTree(helperBuildRoot);
  await rm(helperBuildRoot, { recursive: true, maxRetries: 0 });
}

function parseReport(output) {
  const lines = String(output ?? "").trim().split(/\r?\n/);
  if (lines.length !== 1) return null;
  try { return JSON.parse(lines[0]); } catch { return null; }
}

const helperStages = new Set([
  "fixture", "profile", "fixture-acl", "pipes", "job", "create-node", "assign-job", "resume-node",
  "sdk-initialize", "sdk-getdata", "sdk-shutdown", "node-exit", "job-empty", "profile-cleanup",
]);
const helperFailureCategories = new Set([
  "timeout", "rpc-eof", "win32", "access-denied", "rpc-frame-limit", "rpc-request-limit", "rpc-response",
  "rpc-result", "sdk-initialize-result", "sdk-initialize-methods", "sdk-filesystem-result",
  "descendant-filesystem-result", "node-exit-code", "fixture-after-state", "invalid-data", "io", "other",
  "canary-fixture-paths", "canary-package-read", "canary-workspace-write", "canary-workspace-read",
  "canary-descendant-spawn-denied", "canary-descendant-start", "canary-descendant-result", "canary-initialize-params",
  "canary-host-state-result",
]);
const stderrCategories = new Set([
  "none", "generic-access-denied", "fs-lstat-denied", "fs-realpath-denied", "fs-path-denied",
  "module-not-found", "package-config", "syntax", "native-assertion", "crypto-rng", "unknown",
]);
const modulePathModes = new Set(["baseline", "preserve-module-paths"]);

function safeFailureProjection(value) {
  const bool = key => typeof value?.[key] === "boolean" ? value[key] : null;
  const code = Number.isInteger(value?.childExitCode) && value.childExitCode >= 0 && value.childExitCode <= 0xffffffff
    ? value.childExitCode : null;
  const win32Code = Number.isInteger(value?.win32ErrorCode) && value.win32ErrorCode >= 0 && value.win32ErrorCode <= 0xffffffff
    ? value.win32ErrorCode : null;
  return {
    scope: "development-canary-only",
    productIsolationImplemented: false,
    modulePathMode: modulePathModes.has(value?.modulePathMode) ? value.modulePathMode : "unknown",
    stage: helperStages.has(value?.stage) ? value.stage : "unknown",
    failureCategory: helperFailureCategories.has(value?.failureCategory) ? value.failureCategory : "unknown",
    childExitCode: code,
    win32ErrorCode: win32Code,
    stderrCategory: stderrCategories.has(value?.stderrCategory) ? value.stderrCategory : "unknown",
    appContainerIdentityVerified: bool("appContainerIdentityVerified"),
    descendantWorkspaceWriteAllowed: bool("descendantWorkspaceWriteAllowed"),
    childTerminationConfirmed: bool("childTerminationConfirmed"),
    jobEmpty: bool("jobEmpty"),
    profileCleanupSucceeded: bool("profileCleanupSucceeded"),
    fixtureMustBeRetained: bool("fixtureMustBeRetained"),
  };
}

const helperSuccessFields = new Set([
  "schemaVersion", "scope", "productIsolationImplemented", "modulePathMode", "appContainerIdentityVerified",
  "sdkInitialize", "sdkGetData", "sdkHostRoundTrip", "packageReadAllowed", "workspaceWriteAllowed", "fakeVaultReadDenied",
  "fakeVaultWriteDenied", "descendantDenied", "descendantWorkspaceWriteAllowed", "childTerminationConfirmed",
  "jobEmpty", "childExitCode", "profileCleanupSucceeded", "fixtureMustBeRetained", "passed",
]);

function isCompleteHelperSuccess(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== helperSuccessFields.size || keys.some(key => !helperSuccessFields.has(key))) return false;
  return value.schemaVersion === 1
    && value.scope === "development-canary-only"
    && value.productIsolationImplemented === false
    && value.modulePathMode === modulePathMode
    && value.appContainerIdentityVerified === true
    && value.sdkInitialize === true
    && value.sdkGetData === true
    && value.sdkHostRoundTrip === true
    && value.packageReadAllowed === true
    && value.workspaceWriteAllowed === true
    && value.fakeVaultReadDenied === true
    && value.fakeVaultWriteDenied === true
    && value.descendantDenied === true
    && value.descendantWorkspaceWriteAllowed === true
    && value.childTerminationConfirmed === true
    && value.jobEmpty === true
    && value.childExitCode === 0
    && value.profileCleanupSucceeded === true
    && value.fixtureMustBeRetained === false
    && value.passed === true;
}

let fixtureIdentity;
let helperAttempted = false;
let removeFixtureAfterRun = false;
let preserveHelperBuild = false;
let report;
let failure;

try {
  await assertDirectoryAncestors(temporaryRoot);
  await assertDirectoryAncestors(sdkRoot);
  helperBuildRoot = await mkdtemp(path.join(temporaryRoot, "sps-appcontainer-node-helper-"));
  helperBuildIdentity = await identity(helperBuildRoot);
  helperExecutable = path.join(helperBuildRoot, "AppContainerNodeWorkerCanary.exe");
  await mkdir(fixtureRoot);
  fixtureIdentity = await identity(fixtureRoot);
  await Promise.all([
    mkdir(packageRoot, { recursive: true }),
    mkdir(workspaceRoot, { recursive: true }),
    mkdir(fakeVaultRoot, { recursive: true }),
    mkdir(path.join(sdkPackageRoot, "worker"), { recursive: true }),
    mkdir(path.join(sdkPackageRoot, "runtime"), { recursive: true }),
    mkdir(path.join(sdkPackageRoot, "profile"), { recursive: true }),
  ]);
  await copyFixedFile(process.execPath, path.join(packageRoot, "node.exe"), path.dirname(process.execPath));
  await copyFixedFile(path.join(sdkRoot, "package.json"), path.join(sdkPackageRoot, "package.json"), sdkRoot);
  for (const relative of [
    "worker/index.mjs",
    "runtime/index.mjs",
    "runtime/host-support.mjs",
    "profile/extension-profile-v2.mjs",
  ]) {
    await copyFixedFile(path.join(sdkRoot, relative), path.join(sdkPackageRoot, relative), sdkRoot);
  }
  await copyFixedFile(workerSource, path.join(packageRoot, "worker.mjs"), scriptDirectory);
  await writeFile(path.join(packageRoot, "package-marker.txt"), "SPS_APP_CONTAINER_PACKAGE_READ_OK", { encoding: "utf8", flag: "wx" });
  await writeFile(path.join(fakeVaultRoot, "fake-secret.txt"), `SPS_APP_CONTAINER_FAKE_SECRET_${fixtureId}`, { encoding: "utf8", flag: "wx" });
  await assertPlainTree(fixtureRoot);

  await execFile(compiler, [
    "/nologo", "/optimize+", "/platform:x64", "/reference:System.Security.dll", "/reference:System.Web.Extensions.dll",
    `/out:${helperExecutable}`, helperSource,
  ], { windowsHide: true, timeout: 30_000, maxBuffer: 16_384 });

  if (!samePath(path.dirname(helperBuildRoot), temporaryRoot)
    || !/^sps-appcontainer-node-helper-[A-Za-z0-9_-]+$/.test(path.basename(helperBuildRoot))) {
    throw new Error("Canary helper journal location is invalid.");
  }
  await assertDirectoryAncestors(helperBuildRoot);
  runIdentityPath = path.join(helperBuildRoot, "run-identity.json");
  await createExclusiveIdentityRecord(runIdentityPath, {
    schemaVersion: 1,
    recordType: "sps-appcontainer-node-worker-canary-identity",
    fixtureId,
    profileName: `SPS.AppContainer.NodeCanary.${fixtureId}`,
    modulePathMode,
    fixtureRoot: path.resolve(fixtureRoot),
    helperRoot: path.resolve(helperBuildRoot),
    fixtureIdentity: journalIdentity(fixtureIdentity),
    helperIdentity: journalIdentity(helperBuildIdentity),
  });
  runJournalPath = path.join(helperBuildRoot, "run-journal.json");
  runJournal = {
    schemaVersion: 1,
    recordType: "sps-appcontainer-node-worker-canary-run",
    modulePathMode,
    identityPath: path.resolve(runIdentityPath),
    fixtureId,
    profileName: `SPS.AppContainer.NodeCanary.${fixtureId}`,
    fixtureRoot: path.resolve(fixtureRoot),
    helperRoot: path.resolve(helperBuildRoot),
    fixtureIdentity: journalIdentity(fixtureIdentity),
    helperIdentity: journalIdentity(helperBuildIdentity),
    helperPid: null,
    helperReport: null,
  };
  runJournalHandle = await open(runJournalPath, "wx", 0o600);
  await persistRunJournal();

  helperAttempted = true;
  try {
    const output = await invokeHelperWithJournal();
    report = parseReport(output.stdout);
  } catch (error) {
    report = parseReport(error.stdout);
    if (report?.fixtureMustBeRetained !== false || report?.profileCleanupSucceeded !== true) {
      preserveHelperBuild = true;
      failure = new Error("AppContainer canary failed with unconfirmed cleanup; its fixture, profile, and helper are retained.");
    }
    else failure = new Error("AppContainer Node + SDK worker canary failed after confirmed process/profile cleanup.");
  }
  if (runJournalHandle) {
    runJournal.helperReport = report ? safeFailureProjection(report) : null;
    try { await persistRunJournal(); }
    catch {
      preserveHelperBuild = true;
      removeFixtureAfterRun = false;
      failure ??= new Error("Canary diagnostic journal could not be saved; its fixture and helper are retained.");
    }
  }
  if (!preserveHelperBuild && report?.fixtureMustBeRetained === false && report.profileCleanupSucceeded === true) removeFixtureAfterRun = true;
  if (failure || !isCompleteHelperSuccess(report)) {
    console.error(JSON.stringify(safeFailureProjection(report)));
    failure ??= new Error("AppContainer Node + SDK worker canary did not confirm its complete success contract.");
    if (helperAttempted && (!report || report.fixtureMustBeRetained !== false || report.profileCleanupSucceeded !== true)) preserveHelperBuild = true;
  } else {
    if (!preserveHelperBuild) removeFixtureAfterRun = true;
  }
} catch (error) {
  failure ??= error;
  if (!helperAttempted) removeFixtureAfterRun = Boolean(fixtureIdentity);
} finally {
  if (runJournalHandle) {
    try { await runJournalHandle.close(); }
    catch {
      preserveHelperBuild = true;
      removeFixtureAfterRun = false;
      failure ??= new Error("Canary journal close failed; its fixture and helper are retained.");
    }
    runJournalHandle = undefined;
  }
  try {
    if (removeFixtureAfterRun && fixtureIdentity) await removeFixture(fixtureIdentity);
  } catch (error) {
    preserveHelperBuild = true;
    failure ??= error;
  }
  try {
    if (helperBuildRoot) {
      if (preserveHelperBuild) console.error(JSON.stringify({
        scope: "development-canary-only",
        retained: true,
        fixtureRoot: path.resolve(fixtureRoot),
        helperRoot: path.resolve(helperBuildRoot),
        identityPath: runIdentityPath ? path.resolve(runIdentityPath) : null,
        journalPath: runJournalPath ? path.resolve(runJournalPath) : null,
      }));
      else await removeHelperBuild();
    }
  } catch (error) {
    failure ??= error;
  }
}

if (failure) throw failure;
console.log(JSON.stringify({ ...report, fixtureRemoved: true, helperBuildRemoved: true }, null, 2));
