import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "../preview-e2e-cleanup-contract.mjs";

if (process.platform !== "win32" || process.argv.length !== 3 || process.argv[2] !== OWNED_JOB_CLEANUP_ARGUMENT) {
  throw new Error("The fixed command-exit probe requires its owned Windows launcher.");
}

const executable = path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const command = "[Console]::Out.WriteLine('sps-fixed-command-entered'); Get-Command Get-CimInstance | Out-Null; [Console]::Out.WriteLine('sps-fixed-command-available'); # private-command@example.invalid C:\\private-command-fixture\nStart-Sleep -Milliseconds 1200; exit 7";
console.log(JSON.stringify({ ownedInstallerCommandExitProbePhase: "node-ready" }));
const child = spawn(executable, ["-NoProfile", "-NonInteractive", "-Command", command], {
  shell: false,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
child.once("spawn", () => console.log(JSON.stringify({ ownedInstallerCommandExitProbePhase: "powershell-created" })));
let output = "";
let stderrBytes = 0;
let outputInvalid = false;
let phases = 0;
child.stdout.setEncoding("utf8");
child.stdout.on("data", chunk => {
  if (outputInvalid) return;
  output += chunk;
  if (output.length > 1024) { outputInvalid = true; output = ""; return; }
  while (output.includes("\n")) {
    const end = output.indexOf("\n");
    const line = output.slice(0, end).replace(/\r$/, "");
    output = output.slice(end + 1);
    const expected = phases === 0 ? "sps-fixed-command-entered" : phases === 1 ? "sps-fixed-command-available" : null;
    if (line !== expected) { outputInvalid = true; return; }
    phases += 1;
    console.log(JSON.stringify({ ownedInstallerCommandExitProbePhase: phases === 1 ? "powershell-command-entered" : "powershell-command-available" }));
  }
});
child.stderr.on("data", chunk => { stderrBytes += chunk.length; });
const result = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal }));
});

assert.equal(result.signal, null, "the PowerShell fixture must close naturally");
assert.equal(result.code, 7, "the PowerShell fixture must preserve its real exit code");
assert.equal(outputInvalid || output.length !== 0 || phases !== 2 || stderrBytes !== 0, false,
  "the fixed command must finish both observed phases without unknown output");
console.log(JSON.stringify({ ownedInstallerCommandExitFixture: true }));
process.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE;
