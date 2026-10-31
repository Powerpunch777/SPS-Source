import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LEGACY_RECOVERY_UI_PHASES, parseLegacyRecoveryUiTrace } from "../scripts/legacy-recovery-ui-protocol.mjs";

test("recovery driver trace permits only fixed phase and failure labels", () => {
  for (const phase of LEGACY_RECOVERY_UI_PHASES) {
    assert.deepEqual(parseLegacyRecoveryUiTrace(`LEGACY_UI_PHASE:${phase}`), { kind: "phase", phase });
    assert.deepEqual(parseLegacyRecoveryUiTrace(`LEGACY_UI_FAILURE:${phase}`), { kind: "failure", phase });
  }
  assert.deepEqual(parseLegacyRecoveryUiTrace("LEGACY_UI_FAILURE:entry"), { kind: "failure", phase: "entry" });
  for (const phase of ["recovery-unavailable", "recovery-window-deadline", "check-observation-deadline", "cleanup-safety-rejected"]) {
    assert.deepEqual(parseLegacyRecoveryUiTrace(`LEGACY_UI_REASON:${phase}`), { kind: "reason", phase });
  }
  for (const value of [null, {}, "LEGACY_UI_PHASE:entry", "LEGACY_UI_PHASE:unknown", "LEGACY_UI_FAILURE:unknown",
    "LEGACY_UI_PHASE:initial-window\nprivate@example.invalid", "LEGACY_UI_PHASE:initial-window\n",
    "LEGACY_UI_PHASE:initial-window\r\n", "LEGACY_UI_REASON:unknown", "LEGACY_UI_REASON:recovery-unavailable\n",
    "LEGACY_UI_PHASE:C:\\private", "x".repeat(81)]) {
    assert.throws(() => parseLegacyRecoveryUiTrace(value), /Invalid legacy recovery UI trace/);
  }
});

test("driver traces and ordered parent protocol match while retaining every original assertion", async () => {
  const driver = await readFile(new URL("../scripts/windows-e2e/LegacyRecoveryUiDriver.cs", import.meta.url), "utf8");
  const phases = [...driver.matchAll(/EnterPhase\("([a-z-]+)"\)/g)].map(match => match[1]);
  assert.deepEqual(new Set(phases), new Set(LEGACY_RECOVERY_UI_PHASES));
  assert.match(driver, /AutomationElement\.FromHandle\(checkBox\)/);
  assert.match(driver, /element\.Current\.ProcessId == processId/);
  assert.match(driver, /TryGetCurrentPattern\(TogglePattern\.Pattern, out pattern\)/);
  assert.match(driver, /state == ToggleState\.On \|\| state == ToggleState\.Off/);
  assert.match(driver, /ObserveCheck\(ReadCheck\(checkBox, processId\), deadline\)/);
  assert.match(driver, /read\.Wait\(Math\.Min\(MessageTimeoutMs, remaining\)\)/);
  assert.match(driver, /if \(!completed\) continue;/);
  assert.match(driver, /return read\.GetAwaiter\(\)\.GetResult\(\);/);
  assert.doesNotMatch(driver, /BM_SETCHECK|\.Toggle\(\)|\.SetValue\(/);
  assert.match(driver, /WaitForConfirmDialog\(form, processId\)/);
  assert.match(driver, /Require\(OwnsWindow\(form, processId\)\);[\s\S]*?FindChildByText\(form, processId, UnsafeCleanupStatus, "Static"\)/);
  assert.match(driver, /const string UnsafeCleanupStatus = "Cannot safely clean this folder\. Make sure Windows uninstall finished and SPS is closed\. Unknown, changed or linked files require manual review\. No cleanup was started\."/);
  assert.match(driver, /CleanupSafetyRejectedFailure\) Console\.Error\.WriteLine\("LEGACY_UI_REASON:cleanup-safety-rejected"\)/);
  assert.match(driver, /const int UiWaitTimeoutMs = 15000/);
  const host = await readFile(new URL("../scripts/confirmed-legacy-recovery-ui.mjs", import.meta.url), "utf8");
  assert.match(host, /assert\.deepEqual\(phases, LEGACY_RECOVERY_UI_PHASES\)/);
  assert.match(host, /assert\.deepEqual\(received, expected\)/);
  assert.match(host, /assert\.deepEqual\(result, \{ code: 0, signal: null \}\)/);
});

test("safety diagnostics accept only fixed stages and bounded native codes", () => {
  for (const stage of ["unknown", "preconditions", "process-check", "registration-check", "residue-validation", "confirmation", "removal"]) {
    for (const nativeError of [0, 5, 32, 65535]) {
      assert.deepEqual(parseLegacyRecoveryUiTrace(`LEGACY_UI_SAFETY:${stage}:${nativeError}`), { kind: "safety", stage, nativeError });
    }
  }
  for (const value of ["LEGACY_UI_SAFETY:private@example.test:5", "LEGACY_UI_SAFETY:residue-validation:65536",
    "LEGACY_UI_SAFETY:process-check:-1", "LEGACY_UI_SAFETY:process-check:05", "LEGACY_UI_SAFETY:process-check:5\n",
    "LEGACY_UI_SAFETY:removal:5:extra", "LEGACY_UI_SAFETY:C:\\private:5"]) {
    assert.throws(() => parseLegacyRecoveryUiTrace(value), /Invalid legacy recovery UI trace/);
  }
});
