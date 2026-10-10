import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_E2E_HOST_READY_TIMEOUT_MS,
  parseE2eHostReadyTimeout,
} from "../scripts/e2e-host-ready-timeout.mjs";

test("uses a bounded default Host readiness timeout", () => {
  assert.equal(parseE2eHostReadyTimeout(undefined), DEFAULT_E2E_HOST_READY_TIMEOUT_MS);
  assert.equal(parseE2eHostReadyTimeout(""), DEFAULT_E2E_HOST_READY_TIMEOUT_MS);
  assert.equal(parseE2eHostReadyTimeout("30000"), 30_000);
  assert.equal(parseE2eHostReadyTimeout("600000"), 600_000);
});

test("rejects unbounded or malformed Host readiness timeouts", () => {
  for (const value of ["Infinity", "NaN", "-1", "29999", "600001", "30000.5", "not-a-number"]) {
    assert.throws(() => parseE2eHostReadyTimeout(value), /must be an integer from 30000 to 600000/);
  }
});
