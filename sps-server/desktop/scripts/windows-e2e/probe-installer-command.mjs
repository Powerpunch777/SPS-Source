import { spawn } from "node:child_process";
import path from "node:path";
import { OWNED_JOB_CLEANUP_ARGUMENT } from "../preview-e2e-cleanup-contract.mjs";

if (process.platform !== "win32" || process.argv.length !== 3 || process.argv[2] !== OWNED_JOB_CLEANUP_ARGUMENT) {
  throw new Error("The fixed command probe requires its owned Windows launcher.");
}

const executable = path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const child = spawn(executable, ["-NoProfile", "-NonInteractive", "-C",
  "Start-Sleep -Seconds 60; Get-ExecutionPolicy # private-command@example.invalid C:\\private-command-fixture"],
{ shell: false, windowsHide: true, stdio: "ignore" });
await new Promise(resolve => {
  child.once("error", resolve);
  child.once("close", resolve);
});
// The outer Job must time out first, inspect the live fixture and reject it.
console.error("owned_command_probe_ended_before_observation");
process.exitCode = 1;
