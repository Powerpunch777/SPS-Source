import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { assertContained, assertHostedInstallerCi, assertPlainDirectory } from "./installer-ci-safety.mjs";
import { LEGACY_RECOVERY_UI_PHASES, parseLegacyRecoveryUiTrace } from "./legacy-recovery-ui-protocol.mjs";

// Test-only orchestration. Production has no confirmation or cleanup bypass.
export async function observeConfirmedLegacyRecovery({ desktop, fixture, installation, ready, declined }) {
  assertHostedInstallerCi();
  assert.equal(typeof ready, "function");
  assert.equal(typeof declined, "function");
  assert.equal(await assertPlainDirectory(fixture), fixture);
  assertContained(fixture, installation);
  const helper = path.join(desktop, ".legacy-recovery", "SpsLegacyRecovery.exe");
  await assertPlainDirectory(path.dirname(helper));
  const before = await lstat(helper, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n
    && before.size > 1_000_000n && before.size < 4_000_000n);
  const helperSha256 = createHash("sha256").update(await readFile(helper)).digest("hex");
  const executable = path.join(fixture, "owned-legacy-ui-driver.exe");
  const compiler = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  await promisify(execFile)(compiler, ["/nologo", "/target:exe", "/platform:x64", `/out:${executable}`,
    ...["UIAutomationClient.dll", "UIAutomationTypes.dll", "WindowsBase.dll"]
      .map(name => `/reference:${path.join(path.dirname(compiler), "WPF", name)}`),
    path.join(desktop, "scripts", "windows-e2e", "LegacyRecoveryUiDriver.cs")],
  { cwd: fixture, shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
  const child = spawn(executable, [helper, installation], { cwd: fixture, shell: false,
    windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const deadline = Date.now() + 450_000;
  const expected = ["READY", "DECLINED", "PASSED"];
  const received = [];
  const phases = [];
  let failure;
  let stderrBytes = 0;
  let finished = false;
  const closed = new Promise(resolve => {
    child.once("error", () => { failure = new Error("Legacy recovery UI driver did not start."); finished = true; resolve(null); });
    child.once("close", (code, signal) => { finished = true; resolve({ code, signal }); });
  });
  child.stderr.on("data", chunk => {
    stderrBytes += chunk.length;
    if (stderrBytes > 4096) {
      failure = new Error("Legacy recovery UI driver trace exceeded its bound.");
      traceLines.close();
    }
  });
  const traceLines = createInterface({ input: child.stderr, crlfDelay: Infinity });
  traceLines.on("line", line => {
    try {
      const trace = parseLegacyRecoveryUiTrace(line);
      if (trace.kind === "failure" || trace.kind === "reason") {
        failure = new Error(`Legacy recovery UI driver failed at ${trace.phase}.`);
      } else {
        assert.equal(trace.phase, LEGACY_RECOVERY_UI_PHASES[phases.length]);
        phases.push(trace.phase);
      }
      console.log(JSON.stringify({ legacyRecoveryUiTrace: true, ...trace }));
    } catch { failure = new Error("Legacy recovery UI driver trace is invalid."); }
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on("line", line => {
    if (line !== expected[received.length] || received.length >= expected.length) {
      failure = new Error("Legacy recovery UI driver protocol is invalid.");
    } else received.push(line);
  });
  const waitFor = async count => {
    while (received.length < count) {
      if (failure) throw failure;
      if (finished) throw new Error("Legacy recovery UI driver exited before completing its checks.");
      if (Date.now() >= deadline) throw new Error("Legacy recovery UI observation exceeded its bound.");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (failure) throw failure;
  };
  try {
    await waitFor(1);
    await ready();
    child.stdin.write("UNINSTALLED\n");
    await waitFor(2);
    await declined();
    child.stdin.end("CLEANUP\n");
    await waitFor(3);
    const result = await Promise.race([closed,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error("Legacy recovery UI did not close naturally.")), 5000);
        closed.then(() => clearTimeout(timer));
      })]);
    if (failure) throw failure;
    assert.deepEqual(result, { code: 0, signal: null });
    assert.ok(stderrBytes > 0 && stderrBytes <= 4096);
    assert.deepEqual(phases, LEGACY_RECOVERY_UI_PHASES);
    assert.deepEqual(received, expected);
    const after = await lstat(helper, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs", "size", "mtimeNs", "ctimeNs"]) assert.equal(after[key], before[key]);
    assert.equal(createHash("sha256").update(await readFile(helper)).digest("hex"), helperSha256);
    return { recoveryHelperSha256: helperSha256, explicitCancelVerified: true,
      defaultNoVerified: true, residueDeclineVerified: true, originalResidueCleanupVerified: true };
  } finally {
    lines.close();
    traceLines.close();
    // Never turn a failed observation into a pass by killing an owned process.
    // The outer restricted Job reports and rejects any forced cleanup.
    if (!child.stdin.destroyed) child.stdin.end();
  }
}
