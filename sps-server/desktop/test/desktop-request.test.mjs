import test from "node:test";
import assert from "node:assert/strict";

import { spsRequestError, spsRequestTimeoutSignal } from "../src/desktop-request.mjs";

test("maps only timeout-like request failures to the safe Desktop message", () => {
  const timeout = new Error("raw timeout details");
  timeout.name = "TimeoutError";
  assert.match(spsRequestError(timeout, "SPS request timed out.").message, /SPS request timed out/);

  const network = new Error("network unavailable");
  assert.equal(spsRequestError(network, "fallback"), network);
});

test("creates a bounded request signal", () => {
  const signal = spsRequestTimeoutSignal(1_000);
  assert.equal(signal instanceof AbortSignal, true);
  assert.equal(signal.aborted, false);
});
