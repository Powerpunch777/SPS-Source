import path from "node:path";
import { OWNED_JOB_CLEANUP_ARGUMENT } from "./preview-e2e-cleanup-contract.mjs";

const variants = new Set(["startup", "legacy", "current"]);

export function validateInstallerCimProbeInput({ platform, variant, args }) {
  if (platform !== "win32" || !variants.has(variant) || !Array.isArray(args)
    || args.length !== 2 || args[0] !== variant || args[1] !== OWNED_JOB_CLEANUP_ARGUMENT) {
    throw new Error("Read-only installer CIM diagnostics require a fixed owned Windows probe.");
  }
}

export function buildInstallerCimProbe({ variant, fixtureRoot, windowsRoot }) {
  if (!variants.has(variant)) throw new Error("Unknown installer CIM diagnostic variant.");
  for (const value of [fixtureRoot, windowsRoot]) {
    if (typeof value !== "string" || !/^[a-z]:[\\/]/i.test(value)
      || !path.win32.isAbsolute(value) || /[\0\r\n'"`$]/.test(value)
      || value.split(/[\\/]/).some(part => part === "." || part === "..")) {
      throw new Error("Invalid fixed installer CIM diagnostic path.");
    }
  }
  const command = variant === "startup" ? "exit 0"
    : `if ((Get-CimInstance -ClassName Win32_Process | ? { $_.Path -and $_.Path.StartsWith('${fixtureRoot}', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }`;
  return {
    executable: path.win32.join(windowsRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    args: [...(variant === "current" ? ["-NoProfile", "-NonInteractive"] : []), "-C", command],
    options: { shell: false, windowsHide: true, timeout: 60000, maxBuffer: 32768, encoding: "buffer" },
  };
}

export function summarizeInstallerCimProbe({ variant, exitCode, signal, stdout, stderr, elapsedMs }) {
  if (!variants.has(variant) || (exitCode !== null && (!Number.isInteger(exitCode) || exitCode < -2147483648 || exitCode > 2147483647))
    || (signal !== null && !["SIGTERM", "SIGKILL", "SIGINT"].includes(signal))
    || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0
    || ![stdout, stderr].every(value => typeof value === "string" || Buffer.isBuffer(value))) {
    throw new Error("Invalid read-only installer CIM diagnostic result.");
  }
  return {
    installerCimDiagnostic: true, diagnosticOnly: true, installerExecuted: false,
    variant, exitCode, signal, elapsedMs,
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr),
    matchedExpectedExit: signal === null && exitCode === (variant === "startup" ? 0 : 1)
      && Buffer.byteLength(stdout) === 0 && Buffer.byteLength(stderr) === 0,
  };
}
