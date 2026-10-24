import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

const cliArgs = process.argv.slice(2);
const injectTimeout = cliArgs.length === 1 && cliArgs[0] === "--inject-timeout";
const checkReparse = cliArgs.length === 1 && cliArgs[0] === "--check-reparse";
if (cliArgs.length !== 0 && !injectTimeout && !checkReparse) {
  console.error("Usage: node run-appcontainer-canary.mjs [--inject-timeout|--check-reparse]");
  process.exitCode = 2;
} else if (process.platform !== "win32") {
  throw new Error("This development canary requires Windows.");
} else {
const run = promisify(execFile);
async function assertDirectoryAncestors(directory) {
  let current = path.resolve(directory);
  for (;;) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Canary helper storage must not use linked directories.");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
async function assertMissing(target) {
  try {
    await lstat(target);
    throw new Error("Canary cleanup left an unexpected temporary entry.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const source = path.join(import.meta.dirname, "AppContainerCanary.cs");
await assertDirectoryAncestors(os.tmpdir());
const build = await mkdtemp(path.join(os.tmpdir(), "sps-appcontainer-helper-"));
const id = randomUUID().replaceAll("-", "");
const executable = path.join(build, "AppContainerCanary.exe");
const compiler = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
let attempted = false;
let cleaned = false;
let timeoutObserved = false;
let fixtureResidue = true;
let buildResidue = true;
let helperBinarySha256;
let report;
let failure;
try {
  await run(compiler, ["/nologo", "/optimize+", "/platform:x64", `/out:${executable}`, source], { windowsHide: true, timeout: 30000 });
  attempted = true;
  if (injectTimeout) {
    try {
      await run(executable, ["--timeout-fixture", id], { windowsHide: true, timeout: 5000, maxBuffer: 16384 });
      throw new Error("Timeout fault injection unexpectedly completed.");
    } catch (error) {
      const marker = String(error.stdout ?? "").includes('{"timeoutFixtureReady":true}');
      const timedOut = error.code === "ETIMEDOUT" || error.killed === true;
      if (!timedOut || !marker) throw new Error(`Timeout fault injection did not time out after fixture creation (code=${error.code ?? "none"}, killed=${error.killed === true}, marker=${marker}).`);
      timeoutObserved = true;
    }
  } else if (checkReparse) {
    const output = await run(executable, ["--reparse-fixture", id], { windowsHide: true, timeout: 30000, maxBuffer: 16384 });
    report = JSON.parse(output.stdout.trim());
    cleaned = report.cleanupSucceeded === true;
  } else {
    let output;
    try { output = await run(executable, ["--run", id], { windowsHide: true, timeout: 120000, maxBuffer: 16384 }); }
    catch (error) { if (error.stdout) output = { stdout: error.stdout }; else throw error; }
    report = JSON.parse(output.stdout.trim());
    cleaned = report.cleanupSucceeded === true;
  }
  helperBinarySha256 = hash(await readFile(executable));
} finally {
  if (attempted && (injectTimeout || !cleaned)) {
    try {
      const recovery = await run(executable, ["--cleanup", id], { windowsHide: true, timeout: 30000, maxBuffer: 16384 });
      cleaned = JSON.parse(recovery.stdout.trim()).cleanupSucceeded === true;
      if (!cleaned) throw new Error("Canary cleanup requires attention; no success claimed.");
    } catch (error) {
      failure ??= error;
    }
  }
  const fixture = path.join(path.resolve(os.tmpdir()), `sps-appcontainer-poc-${id}`);
  try { await assertMissing(fixture); fixtureResidue = false; } catch (error) { failure ??= error; }
  try {
    if (path.dirname(build) !== path.resolve(os.tmpdir()) || !path.basename(build).startsWith("sps-appcontainer-helper-")) throw new Error("Invalid canary cleanup target.");
    await assertDirectoryAncestors(build);
    await rm(build, { recursive: true, force: true });
    await assertMissing(build);
    buildResidue = false;
  } catch (error) {
    failure ??= error;
  }
}
if (failure) throw failure;
const metadata = {
  helperSourceSha256: hash(await readFile(source)),
  helperBinarySha256,
  operatingSystem: os.release(),
  fixtureResidue,
  helperBuildResidue: buildResidue
};
if (injectTimeout) {
  report = {
    schemaVersion: 1,
    scope: "development-canary-only",
    productIsolationImplemented: false,
    faultInjection: "timeout-after-unique-profile-and-fixture",
    timeoutObserved,
    fallbackCleanupSucceeded: cleaned,
    fixtureResidue,
    helperBuildResidue: buildResidue,
    passed: timeoutObserved && cleaned && !fixtureResidue && !buildResidue
  };
} else {
  report = { ...report, fixtureResidue, helperBuildResidue: buildResidue };
  report.passed = report.passed === true && report.cleanupSucceeded === true && !fixtureResidue && !buildResidue;
}
console.log(JSON.stringify({ ...report, ...metadata }, null, 2));
if (report.passed !== true) process.exitCode = 2;
}
