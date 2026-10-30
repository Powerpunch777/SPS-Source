import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "../preview-e2e-cleanup-contract.mjs";

const execFileAsync = promisify(execFile);
const query = String.raw`$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; $timer = [Diagnostics.Stopwatch]::StartNew(); $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'SPS Desktop.exe'" -ErrorAction Stop); $timer.Stop(); [Console]::Out.WriteLine((ConvertTo-Json -InputObject ([ordered]@{ count = $processes.Count; elapsedMs = [long]$timer.ElapsedMilliseconds }) -Compress))`;

if (process.platform !== "win32") throw new Error("Installer process probe requires Windows.");
if (process.argv.length !== 3 || process.argv[2] !== OWNED_JOB_CLEANUP_ARGUMENT) {
  throw new Error("Installer process probe must run under the restricted E2E helper.");
}

const { stdout } = await execFileAsync("powershell.exe", [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  query,
], {
  shell: false,
  windowsHide: true,
  timeout: 30_000,
  maxBuffer: 16_384,
});

const result = JSON.parse(stdout.trim());
if (!Number.isSafeInteger(result.count) || result.count < 0
  || !Number.isSafeInteger(result.elapsedMs) || result.elapsedMs < 0
  || Object.keys(result).length !== 2 || !("count" in result) || !("elapsedMs" in result)) {
  throw new Error("Installer process probe returned an invalid count/timing result.");
}

console.log(JSON.stringify(result));
process.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE;
