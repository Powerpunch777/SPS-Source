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
  for (const value of [null, {}, "LEGACY_UI_PHASE:entry", "LEGACY_UI_PHASE:unknown", "LEGACY_UI_FAILURE:unknown",
    "LEGACY_UI_PHASE:initial-window\nprivate@example.invalid", "LEGACY_UI_PHASE:initial-window\n",
    "LEGACY_UI_PHASE:initial-window\r\n", "LEGACY_UI_PHASE:C:\\private", "x".repeat(81)]) {
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
  assert.doesNotMatch(driver, /BM_SETCHECK|\.Toggle\(\)|\.SetValue\(/);
  const host = await readFile(new URL("../scripts/confirmed-legacy-recovery-ui.mjs", import.meta.url), "utf8");
  assert.match(host, /assert\.deepEqual\(phases, LEGACY_RECOVERY_UI_PHASES\)/);
  assert.match(host, /assert\.deepEqual\(received, expected\)/);
  assert.match(host, /assert\.deepEqual\(result, \{ code: 0, signal: null \}\)/);
});
