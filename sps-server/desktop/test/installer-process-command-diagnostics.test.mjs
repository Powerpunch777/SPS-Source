import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url));

test("owned installer command diagnostics classify a bounded read-only probe without publishing its command", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", "probe-installer-command"], {
    windowsHide: true, timeout: 75_000, maxBuffer: 32_768,
  }), failure => {
    assert.equal(failure.code, 124);
    const records = failure.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const diagnosticIndex = records.findIndex(record => record.ownedInstallerCommandDiagnostics === true);
    const diagnostic = records[diagnosticIndex];
    assert.equal(diagnostic?.commands?.length, 1);
    const [command] = diagnostic.commands;
    assert.deepEqual(Object.keys(command).sort(), ["architecture", "kind", "noProfile", "nonInteractive", "readOK"]);
    assert.equal(command.readOK, true);
    assert.equal(command.kind, "execution-policy");
    assert.ok(["x64", "x86"].includes(command.architecture));
    assert.equal(command.noProfile, true);
    assert.equal(command.nonInteractive, true);

    const cleanup = records.find(record => record.ownedJobCleanup === "forced");
    assert.ok(cleanup, "the timed-out owned Job must report forced cleanup");
    assert.deepEqual(cleanup, { ownedJobEmpty: true, ownedJobCleanup: "forced", accepted: false });
    const desktop = records.find(record => record.restrictedE2eDesktop === true);
    assert.equal(records.at(-1).ownedDesktopClose, "closed");
    assert.equal(records.at(-1).ownedWindowStationClose, desktop.privateWindowStation ? "closed" : "not_owned");
    assert.doesNotMatch(`${failure.stdout}\n${failure.stderr}`, /private-command@example\.invalid|C:\\private-command-fixture/);
    assert.match(failure.stderr, /restricted_e2e_timeout:phase=child_wait/);
    assert.ok(diagnosticIndex >= 0);
    return true;
  });
});
