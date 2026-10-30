import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url));

test("owned installer dialog diagnostics observe a real modal without clicking or publishing its text", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", "probe-installer-dialog"], {
    windowsHide: true, timeout: 30_000, maxBuffer: 32_768,
  }), failure => {
    assert.equal(failure.code, 124);
    const records = failure.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const diagnosticIndex = records.findIndex(record => record.ownedInstallerWindowDiagnostics === true);
    const diagnostic = records[diagnosticIndex];
    assert.equal(diagnostic?.readOK, true);
    assert.equal(diagnostic.truncated, false);
    const dialog = diagnostic.windows.find(window => window.kind === "dialog" && window.messages.includes("fixture_prompt"));
    assert.ok(dialog, "The real fixture modal must be observed on the owned desktop");
    assert.equal(dialog.visible, true);
    assert.ok(dialog.controls.some(control => control.kind === "button" && Number.isInteger(control.id) && control.enabled));
    assert.doesNotMatch(failure.stdout, /private@example|C:\\\\private|fixture_prompt\./);
    assert.ok(records.findIndex(record => record.ownedJobEmpty === true) > diagnosticIndex);
    assert.equal(records.at(-1).ownedDesktopClose, "closed");
    assert.match(failure.stderr, /restricted_e2e_timeout:phase=child_wait/);
    return true;
  });
});

test("installer window reader only observes the explicit owned desktop and checked Job with bounded read-only messages", async () => {
  const source = await readFile(new URL("../scripts/windows-e2e/InstallerWindowDiagnostics.cs", import.meta.url), "utf8");
  assert.match(source, /EnumDesktopWindows\(desktop,/);
  assert.match(source, /IsProcessInJob\(process, job, out member\)/);
  assert.match(source, /OpenProcess\(0x1000, false, processId\)/);
  assert.match(source, /SendMessageTimeoutW\(window, 0x000D,/);
  assert.match(source, /0x0003, 100, out result/);
  assert.match(source, /WindowLimit = 32/);
  assert.match(source, /ControlLimit = 64/);
  assert.match(source, /elapsed\.ElapsedMilliseconds >= 2500/);
  assert.doesNotMatch(source, /SendInput|PostMessage|WM_CLOSE|BM_CLICK|SetForegroundWindow|SwitchDesktop|Process\.Start|ProcessStartInfo/);
  const writer = source.slice(source.indexOf("public static void Write("));
  assert.doesNotMatch(writer, /text\.ToString|processId \+|caption|imagePath|GetWindowText/);
});
