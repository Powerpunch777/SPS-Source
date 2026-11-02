import assert from "node:assert/strict";
import test from "node:test";
import { formatLegacyDriverDiagnostic } from "../scripts/windows-e2e/legacy-driver-diagnostic.mjs";

test("diagnostic formatter preserves recognized confirmation details", () => {
  assert.equal(formatLegacyDriverDiagnostic({ phase: "confirmation", type: "contract-failure",
    operation: "RecoveryWindowDeadlineFailure", modalStep: "decline-result", interactive: false,
    nativeCode: 5 }, 1),
  "Private-desktop component probe failed at confirmation (contract-failure; RecoveryWindowDeadlineFailure; native-5; modal-decline-result; interactive-false).");
});

test("diagnostic formatter bounds unknown values and drops sensitive fields", () => {
  const diagnostic = formatLegacyDriverDiagnostic({ phase: "C:\\private\\path", type: "secret-token",
    operation: "C:\\private\\operation", modalStep: "password", interactive: "secret", nativeCode: 999999,
    stdout: "private output", stderr: "credential", path: "C:\\private\\file" }, "C:\\private\\exit" );
  assert.equal(diagnostic, "Private-desktop component probe failed at wrapper-child (exit-unknown).");
  assert.doesNotMatch(diagnostic, /C:\\private|secret|credential|password|token/i);
});
