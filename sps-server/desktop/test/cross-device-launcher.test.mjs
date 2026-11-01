import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const wrapperPath = fileURLToPath(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url));
const runnerPath = fileURLToPath(new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url));
const runWindowsWrapper = ({ interactive = false } = {}) => new Promise((resolve, reject) => {
  const child = spawn("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", wrapperPath,
    "-Mode", "probe-cross-device-control",
  ], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let sent = false;
  let inputEnded = false;
  let receiptBeforeInputEnd = false;
  let eofFallback;
  const endInput = () => { inputEnded = true; child.stdin.end(); };
  const timeout = setTimeout(() => child.kill(), 20_000);
  child.stdout.setEncoding("utf8").on("data", chunk => {
    stdout += chunk;
    if (interactive && !sent && stdout.includes('"crossDeviceControlReady":true')) {
      sent = true;
      child.stdin.write('{"id":1,"action":"close"}\n');
      // EOF releases an input-buffering launcher, but cannot count as duplex success.
      eofFallback = setTimeout(endInput, 5_000);
    }
    if (interactive && !inputEnded && stdout.includes('"crossDeviceControl":true')) {
      receiptBeforeInputEnd = true;
      clearTimeout(eofFallback);
      endInput();
    }
  });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  child.once("error", error => { clearTimeout(timeout); reject(error); });
  child.once("close", (code, signal) => {
    clearTimeout(timeout);
    clearTimeout(eofFallback);
    resolve({ code, signal, stdout, stderr, receiptBeforeInputEnd });
  });
  child.stdin.on("error", error => { if (error.code !== "EPIPE") reject(error); });
  if (!interactive) child.stdin.end('{"id":1,"action":"close"}\n');
});

test("Windows cross-device launcher returns a late request receipt before stdin EOF", {
  skip: process.platform !== "win32",
}, async () => {
  const result = await runWindowsWrapper({ interactive: true });
  assert.equal(result.signal, null);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.receiptBeforeInputEnd, true, "An EOF-buffered request cannot qualify an interactive control channel.");
  const records = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  assert.deepEqual(records.find(record => record.crossDeviceControl === true), {
    crossDeviceControl: true, id: 1, ok: true, result: { closed: true },
  });
  assert.ok(records.some(record => record.ownedJobEmpty === true && record.ownedJobCleanup === "natural"));
  assert.equal(result.stderr, "");
});

test("cross-device native launcher is a fixed owned-job probe with mode-only stdin inheritance", async () => {
  const [wrapper, runner] = await Promise.all([
    readFile(wrapperPath, "utf8"),
    readFile(runnerPath, "utf8"),
  ]);
  assert.match(wrapper, /ValidateSet\([^)]*'probe-cross-device-control'/);

  const modeStart = runner.indexOf('    static bool Mode(');
  const modeEnd = runner.indexOf('    static bool OwnedJobGateMode(', modeStart);
  const gateEnd = runner.indexOf('    static int OwnedJobWaitMilliseconds(', modeEnd);
  const launchStart = runner.indexOf('    static int Launch(', gateEnd);
  const childStart = runner.indexOf('    static int Child(', modeEnd);
  assert.ok(modeStart >= 0 && modeEnd > modeStart && gateEnd > modeEnd && childStart > modeEnd && launchStart > gateEnd);
  assert.match(runner.slice(modeStart, modeEnd), /value == "probe-cross-device-control"/);
  assert.match(runner.slice(modeEnd, gateEnd), /value == "probe-cross-device-control"/);
  assert.match(runner, /const string OwnedJobCleanupArgument = "--owned-job-cleanup-pending";/);
  assert.match(runner.slice(childStart, launchStart), /Path\.Combine\(directory, "scripts", "cross-device-control\.mjs"\), OwnedJobCleanupArgument\)/);
  assert.match(runner.slice(childStart, launchStart), /RunNodeFileForwardInput\(/);
  assert.match(runner, /if \(mode == "probe-cross-device-control"\)\s*Require\(DuplicateHandle\(GetCurrentProcess\(\), GetStdHandle\(-10\)/);
  assert.match(runner, /else\s+input = CreateFileW\("NUL"/);
  assert.match(runner, /WaitForNaturalJobEmpty\(job, OwnedJobWaitMilliseconds\(mode\)\)/);
  assert.match(runner, /CreateRestrictedToken\(token, 0x1/);
  assert.match(runner, /if \(original\.User != reduced\.User\) throw new InvalidOperationException\("Restricted token changed user"\)/);
});

test("Windows cross-device launcher passes close JSONL and accepts only natural cleanup", {
  skip: process.platform !== "win32",
}, async () => {
  const { code, signal, stdout, stderr } = await runWindowsWrapper();
  assert.equal(signal, null);
  assert.equal(code, 0, stderr);
  const records = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  assert.equal(records[0].restrictedE2eDesktop, true);
  assert.equal(typeof records[0].privateWindowStation, "boolean");
  assert.deepEqual(records[1], {
    restrictedE2eChild: true,
    administratorEnabled: false,
    powerUsersEnabled: false,
    privilegesReduced: true,
    sameUserToken: true,
    administratorDenied: true,
    userDefaultDacl: true,
  });
  assert.deepEqual(records[2], { crossDeviceControlReady: true });
  assert.deepEqual(records.find(record => record.crossDeviceControl === true), {
    crossDeviceControl: true, id: 1, ok: true, result: { closed: true },
  });
  assert.ok(records.some(record => record.ownedJobEmpty === true && record.ownedJobCleanup === "natural"));
  assert.deepEqual(records.at(-1), {
    ownedDesktopClose: "closed",
    ownedWindowStationClose: records[0].privateWindowStation ? "closed" : "not_owned",
  });
  assert.equal(stderr, "");
});
