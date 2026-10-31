import { spawn } from "node:child_process";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "../preview-e2e-cleanup-contract.mjs";

if (process.platform !== "win32" || process.argv.length !== 3 || process.argv[2] !== OWNED_JOB_CLEANUP_ARGUMENT) {
  await new Promise(resolve => process.stderr.write("legacy_driver_private_desktop_probe_requires_owned_windows_launcher\n", resolve));
  process.exit(1);
}

const testFile = "test/legacy-recovery-driver-component.test.mjs";
const allowedPhases = new Set(["initial-window", "initial-target", "initial-controls", "initial-backup", "initial-inside",
  "initial-uncheck", "initial-recheck", "initial-cancel", "initial-exit", "check-observation"]);
const allowedTypes = new Set(["DriverFailure", "CheckObservationDeadlineFailure", "AggregateException", "COMException",
  "ElementNotAvailableException", "InvalidOperationException", "TargetInvocationException"]);
const allowedOperations = new Set(["FindTopWindows", "WindowClass", "ReadWindowText", "WaitForRecoveryWindow",
  "RemainingMilliseconds", "unclassified"]);
const maximumOutputBytes = 256 * 1024;

let child;
let stdout = "";
let stderr = "";
let outputBytes = 0;
let outputLimited = false;
let timedOut = false;
let spawnFailed = false;
let timer;

function capture(stream, chunk) {
  const bytes = Buffer.byteLength(chunk);
  outputBytes += bytes;
  if (outputBytes > maximumOutputBytes) {
    outputLimited = true;
    child.kill();
    return;
  }
  if (stream === "stdout") stdout += chunk;
  else stderr += chunk;
}

function safeFailure() {
  let phase = "child-result";
  let type = "unclassified";
  let operation;
  let nativeCode;
  const message = /Legacy recovery UI driver failed at ([a-z-]+) \(([A-Za-z]+)(?:; ([A-Za-z]+))?(?:; native-(-?\d+))?\)\./.exec(`${stdout}\n${stderr}`);
  if (message && allowedPhases.has(message[1]) && allowedTypes.has(message[2])) {
    phase = message[1];
    type = message[2];
    if (message[3] && allowedOperations.has(message[3])) operation = message[3];
    const code = Number(message[4]);
    if (Number.isInteger(code) && code >= -1 && code <= 65535) nativeCode = code;
  } else if (/Legacy recovery driver component fixture compilation failed/.test(`${stdout}\n${stderr}`)) {
    phase = "fixture-compilation";
    type = "compilation-failure";
  } else if (/checkbox observation failed its pending\/deadline contract/i.test(`${stdout}\n${stderr}`)) {
    phase = "check-observation";
    type = "contract-failure";
  } else if (timedOut) {
    phase = "child-timeout";
    type = "timeout";
  } else if (outputLimited) {
    phase = "child-output";
    type = "output-limit";
  } else if (spawnFailed) {
    phase = "child-launch";
    type = "launch-failure";
  } else {
    const failure = /^not ok 1 - actual recovery UI driver exercises only the initial real form in an owned child$/m.test(stdout)
      ? "initial-form"
      : /^not ok 2 - checkbox observation retains one pending query within the original UI deadline$/m.test(stdout)
        ? "check-observation" : null;
    if (failure) {
      phase = failure;
      type = "test-failure";
    }
  }
  return { legacyDriverPrivateDesktopComponent: false, phase, type, ...(operation ? { operation } : {}),
    ...(nativeCode === undefined ? {} : { nativeCode }) };
}

function fail() {
  const record = `${JSON.stringify(safeFailure())}\n`;
  process.stderr.write(record, () => process.exit(1));
}

try {
  child = spawn(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", testFile], {
    cwd: new URL("../..", import.meta.url),
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  spawnFailed = true;
  fail();
}

if (child) {
  const result = await new Promise(resolve => {
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 75_000);
    child.stdout.on("data", chunk => capture("stdout", chunk));
    child.stderr.on("data", chunk => capture("stderr", chunk));
    child.once("error", () => { spawnFailed = true; });
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);

  const totals = Object.fromEntries(["tests", "pass", "fail", "cancelled", "skipped", "todo"].map(key => {
    const match = new RegExp(`^# ${key} (\\d+)$`, "m").exec(stdout);
    return [key, match ? Number(match[1]) : null];
  }));
  const passed = result.code === 0 && result.signal === null && !timedOut && !outputLimited && !spawnFailed
    && outputBytes <= maximumOutputBytes && totals.tests === 2 && totals.pass === 2 && totals.fail === 0
    && totals.cancelled === 0 && totals.skipped === 0 && totals.todo === 0;

  if (!passed) {
    fail();
  } else {
    process.stdout.write('{"legacyDriverPrivateDesktopComponent":true,"tests":2,"passed":2,"skipped":0}\n', () => {
      process.exit(OWNED_JOB_CLEANUP_PENDING_EXIT_CODE);
    });
  }
}
