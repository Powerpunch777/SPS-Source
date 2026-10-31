import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "../preview-e2e-cleanup-contract.mjs";

if (process.platform !== "win32" || process.argv.length !== 3 || process.argv[2] !== OWNED_JOB_CLEANUP_ARGUMENT) {
  throw new Error("The fixed command-exit probe requires its owned Windows launcher.");
}

const executable = path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const command = "Get-Command Get-CimInstance | Out-Null; # private-command@example.invalid C:\\private-command-fixture\nStart-Sleep -Milliseconds 1200; exit 7";
console.log(JSON.stringify({ ownedInstallerCommandExitProbePhase: "node-ready" }));
const child = spawn(executable, ["-NoProfile", "-NonInteractive", "-Command", command], {
  shell: false,
  windowsHide: true,
  stdio: "ignore",
});
child.once("spawn", () => console.log(JSON.stringify({ ownedInstallerCommandExitProbePhase: "powershell-created" })));
const result = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
});

assert.equal(result.signal, null, "the PowerShell fixture must close naturally");
assert.equal(result.code, 7, "the PowerShell fixture must preserve its real exit code");
console.log(JSON.stringify({ ownedInstallerCommandExitFixture: true }));
process.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE;
