import assert from "node:assert/strict";
import test from "node:test";
import {
  createHistoricalProfileProgress,
  createHistoricalRuntimeObserver,
  HISTORICAL_PROFILE_PROGRESS_PHASES,
  parseHistoricalProfileProgress,
} from "../scripts/historical-profile-progress.mjs";

const expectedPhases = ["fixture-ready", "initial-main-start", "initial-main-ready", "initial-account-stored",
  "initial-main-closed", "historical-db-start", "historical-db-prepared", "legacy-state-prepared",
  "migration-main-start", "migration-main-ready", "migration-data-verified", "migration-main-closed",
  "restart-main-start", "restart-main-ready", "restart-data-verified", "restart-main-closed",
  "candidate-verified", "cleanup-start", "cleanup-complete",
  "migration-host-ready", "migration-db-verified", "migration-workspace-seen", "migration-workspace-ready",
  "restart-host-ready", "restart-db-verified", "restart-workspace-seen", "restart-workspace-ready",
  "failed-setup", "failed-host-readiness", "failed-state-data", "failed-workspace-window",
  "failed-workspace-visibility", "failed-projects", "failed-historical-preparation", "failed-sign-in",
  "failed-shutdown", "failed-candidate",
  "app-begin", "app-identity-session-start", "app-identity-session-complete", "app-node-registration-start",
  "app-node-registration-complete", "app-workspace-load-start", "app-workspace-load-complete",
  "app-window-ready-to-show", "app-window-shown", "app-captured-window-discarded", "app-scope-account-changed",
  "app-scope-host-context-changed", "app-scope-host-instance-changed", "app-scope-connection-changed",
  "app-scope-rejection-unclassified", "app-existing-window-reused", "app-window-closed",
  ...["package-verify-start", "package-verified", "cache-ready", "archive-preflight-start", "archive-preflight-complete",
    "extraction-start", "extraction-complete", "expanded-verification-start", "expanded-verification-complete", "runtime-promoted"].map(phase => `runtime-${phase}`),
  ...["resolve-runtime-start", "resolve-runtime-complete", "prepare-job-start", "prepare-job-complete", "core-spawned", "core-ready"].map(phase => `host-${phase}`)];

test("historical profile progress emits only fixed fields and elapsed integer time", () => {
  let time = 250;
  const lines = [];
  const progress = createHistoricalProfileProgress({ write: line => lines.push(line), now: () => time });
  progress("fixture-ready");
  time += 37;
  progress("initial-main-start");

  assert.deepEqual(HISTORICAL_PROFILE_PROGRESS_PHASES, expectedPhases);
  assert.deepEqual(lines, [
    '{"historicalProfileProgress":true,"phase":"fixture-ready","elapsedMs":0}\n',
    '{"historicalProfileProgress":true,"phase":"initial-main-start","elapsedMs":37}\n',
  ]);
});

test("historical profile progress rejects unknown phases and invalid elapsed values without writing", () => {
  const lines = [];
  let time = 0;
  const progress = createHistoricalProfileProgress({ write: line => lines.push(line), now: () => time });
  assert.throws(() => progress("unknown-phase"), /Unknown historical profile progress phase/);

  time = 1_080_000;
  progress("fixture-ready");
  assert.equal(lines[0], '{"historicalProfileProgress":true,"phase":"fixture-ready","elapsedMs":1080000}\n');
  lines.length = 0;

  for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_080_001]) {
    time = invalid;
    assert.throws(() => progress("fixture-ready"), /elapsed time is invalid/);
  }
  assert.deepEqual(lines, []);
});

test("historical profile progress requires callable writer and clock", () => {
  assert.throws(() => createHistoricalProfileProgress({ write: null }), /requires a writer and clock/);
  assert.throws(() => createHistoricalProfileProgress({ write() {}, now: 1 }), /requires a writer and clock/);
  assert.throws(() => createHistoricalProfileProgress({ write() {}, now: () => Number.NaN }), /clock is invalid/);
});

test("historical profile progress parser accepts only exact known event fields", () => {
  const accepted = [
    '{"historicalProfileProgress":true,"phase":"fixture-ready","elapsedMs":0}',
    '{"elapsedMs":25,"phase":"cleanup-complete","historicalProfileProgress":true}',
  ].join("\n");
  assert.deepEqual(parseHistoricalProfileProgress(accepted), [
    { historicalProfileProgress: true, phase: "fixture-ready", elapsedMs: 0 },
    { historicalProfileProgress: true, phase: "cleanup-complete", elapsedMs: 25 },
  ]);

  const invalid = [
    "not json",
    "null",
    "[]",
    '{"historicalProfileProgress":false,"phase":"fixture-ready","elapsedMs":0}',
    '{"historicalProfileProgress":true,"phase":"unknown-phase","elapsedMs":0}',
    '{"historicalProfileProgress":true,"phase":"fixture-ready","elapsedMs":0,"path":"C:\\\\private"}',
    '{"historicalProfileProgress":true,"phase":"fixture-ready"}',
    '{"historicalProfileProgress":true,"phase":"fixture-ready","elapsedMs":-1}',
    '{"historicalProfileProgress":true,"phase":"fixture-ready","elapsedMs":1.5}',
    '{"historicalProfileProgress":true,"phase":"fixture-ready","elapsedMs":1e309}',
    '{"historicalProfileProgress":true,"phase":"fixture-ready","elapsedMs":1080001}',
  ].join("\n");
  assert.deepEqual(parseHistoricalProfileProgress(invalid), []);
});

test("historical profile progress parser ignores private app output and oversized lines", () => {
  const valid = '{"historicalProfileProgress":true,"phase":"historical-db-start","elapsedMs":12}';
  const privateText = "C:\\private\\profile secret-sentinel {\"path\":\"private\"}";
  assert.deepEqual(parseHistoricalProfileProgress(`${privateText}\n${" ".repeat(513)}\n${valid}`), [
    { historicalProfileProgress: true, phase: "historical-db-start", elapsedMs: 12 },
  ]);
  assert.deepEqual(parseHistoricalProfileProgress(`${valid}${"x".repeat(1024 * 1024)}`), []);
  assert.deepEqual(parseHistoricalProfileProgress(""), []);
  assert.deepEqual(parseHistoricalProfileProgress(null), []);
});

test("runtime observation forwards only complete fixed phases across chunk boundaries", () => {
  const phases = [];
  const observe = createHistoricalRuntimeObserver(phase => phases.push(phase));
  observe("private path and token\n[owner-host-run");
  observe(Buffer.from("time] phase=extraction-start\r\n[owner-host-job] core-spawned\n"));
  observe("[owner-host-runtime] phase=secret-path\n[owner-host-job] user@example.test\n");
  observe("[owner-host-runtime] phase=runtime-promoted");
  assert.deepEqual(phases, ["runtime-extraction-start", "host-core-spawned"]);
  observe("\n");
  assert.deepEqual(phases, ["runtime-extraction-start", "host-core-spawned", "runtime-runtime-promoted"]);
});

test("runtime observation drops oversized/private frames and stops after its total bound", () => {
  const phases = [];
  const observe = createHistoricalRuntimeObserver(phase => phases.push(phase));
  observe(`${"x".repeat(513)}[owner-host-job] core-ready\n`);
  observe("[owner-host-job] core-ready\n");
  observe("x".repeat(1024 * 1024));
  observe("\n[owner-host-job] core-ready\n");
  assert.deepEqual(phases, ["host-core-ready"]);
  assert.throws(() => createHistoricalRuntimeObserver(null), /requires a writer/);
});
