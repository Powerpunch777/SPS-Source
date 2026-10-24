import assert from "node:assert/strict";
import test from "node:test";
import { buildDeveloperValidationFeedback } from "../src/developer-validation-feedback.mjs";

const PROJECT = "dev-123e4567-e89b-12d3-a456-426614174000";
const OTHER_PROJECT = "dev-123e4567-e89b-12d3-a456-426614174001";
const BASE_TIME = Date.parse("2026-10-24T10:00:00.000Z");

function event(code, {
  projectId = PROJECT,
  index = 0,
  message = `${code} message`,
  id = `desktop-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  details = {},
} = {}) {
  return {
    schemaVersion: "sps-plugin-diagnostic/v1",
    id: id.replace("desktop-", "desktop."),
    code,
    message,
    occurredAt: new Date(BASE_TIME + index * 1000).toISOString(),
    details: { projectId, ...details },
  };
}

test("returns null without a scoped attempt anchor", () => {
  assert.equal(buildDeveloperValidationFeedback({ projectId: PROJECT, events: [] }), null);
  assert.equal(buildDeveloperValidationFeedback({
    projectId: PROJECT,
    events: [event("DEVELOPER_BUILD_FAILED", { projectId: OTHER_PROJECT })],
  }), null);
});

test("summarizes successful gates with the exact minimal DTO", () => {
  const result = buildDeveloperValidationFeedback({
    projectId: PROJECT,
    events: [
      event("DEVELOPER_GATES_FINISHED", { index: 3, details: { success: true } }),
      event("DEVELOPER_TEST_PASSED", { index: 2 }),
      event("DEVELOPER_GATES_STARTED", { index: 1 }),
    ],
  });
  assert.deepEqual(result, {
    schemaVersion: 1,
    attemptId: "desktop.00000000-0000-4000-8000-000000000001",
    kind: "gates",
    status: "passed",
    occurredAt: "2026-10-24T10:00:03.000Z",
    diagnostics: [
      { code: "DEVELOPER_GATES_FINISHED", message: "DEVELOPER_GATES_FINISHED message" },
      { code: "DEVELOPER_TEST_PASSED", message: "DEVELOPER_TEST_PASSED message" },
    ],
  });
});

test("keeps a failed gate failed after later passing gates and prioritizes failure diagnostics", () => {
  const events = [
    event("DEVELOPER_TEST_PASSED", { index: 10 }),
    event("DEVELOPER_VALIDATE_PASSED", { index: 9 }),
    event("DEVELOPER_BUILD_PASSED", { index: 8 }),
    event("DEVELOPER_TEST_PASSED", { index: 7 }),
    event("DEVELOPER_VALIDATE_PASSED", { index: 6 }),
    event("DEVELOPER_BUILD_PASSED", { index: 5 }),
    event("DEVELOPER_BUILD_FAILED", { index: 4, message: "Build failed" }),
    event("DEVELOPER_GATES_STARTED", { index: 1 }),
  ];
  const result = buildDeveloperValidationFeedback({ projectId: PROJECT, events });
  assert.equal(result.status, "failed");
  assert.equal(result.diagnostics.length, 6);
  assert.equal(result.diagnostics[0].code, "DEVELOPER_BUILD_FAILED");
});

test("a newer attempt anchor excludes errors from the prior attempt", () => {
  const result = buildDeveloperValidationFeedback({
    projectId: PROJECT,
    events: [
      event("DEVELOPER_GATES_STARTED", { index: 10 }),
      event("DEVELOPER_GATES_FINISHED", { index: 9, details: { success: false } }),
      event("DEVELOPER_BUILD_FAILED", { index: 8 }),
      event("DEVELOPER_GATES_STARTED", { index: 7 }),
    ],
  });
  assert.equal(result.status, "running");
  assert.equal(result.attemptId, "desktop.00000000-0000-4000-8000-000000000010");
  assert.deepEqual(result.diagnostics, []);
});

test("ignores other projects when selecting anchors, status, and messages", () => {
  const result = buildDeveloperValidationFeedback({
    projectId: PROJECT,
    events: [
      event("DEVELOPER_BUILD_FAILED", { projectId: OTHER_PROJECT, index: 10, message: "foreign failure" }),
      event("DEVELOPER_GATES_STARTED", { index: 9 }),
    ],
  });
  assert.equal(result.status, "running");
  assert.deepEqual(result.diagnostics, []);
});

test("reports running for unfinished gates and preview attempts", () => {
  for (const [code, kind] of [["DEVELOPER_GATES_STARTED", "gates"], ["PREVIEW_CANDIDATE_STARTED", "preview"]]) {
    const result = buildDeveloperValidationFeedback({ projectId: PROJECT, events: [event(code)] });
    assert.equal(result.kind, kind);
    assert.equal(result.status, "running");
  }
});

test("reports preview verification and preview failures", () => {
  const passed = buildDeveloperValidationFeedback({
    projectId: PROJECT,
    events: [
      event("PREVIEW_CANDIDATE_VERIFIED", { index: 3 }),
      event("PREVIEW_CANDIDATE_STARTED", { index: 1 }),
    ],
  });
  assert.equal(passed.kind, "preview");
  assert.equal(passed.status, "passed");

  for (const code of ["PREVIEW_CANDIDATE_FAILED", "PREVIEW_RUNTIME_START_FAILED", "PREVIEW_RENDERER_LOAD_FAILED"]) {
    const failed = buildDeveloperValidationFeedback({
      projectId: PROJECT,
      events: [event(code, { index: 3 }), event("PREVIEW_CANDIDATE_STARTED", { index: 1 })],
    });
    assert.equal(failed.status, "failed", code);
    assert.equal(failed.diagnostics[0].code, code);
  }
});

test("ignores diagnostics recorded after a preview terminal", () => {
  const result = buildDeveloperValidationFeedback({
    projectId: PROJECT,
    events: [
      event("PREVIEW_RENDERER_LOAD_FAILED", { index: 5, message: "A later Preview reload failed." }),
      event("PREVIEW_CANDIDATE_VERIFIED", { index: 4 }),
      event("PREVIEW_RUNTIME_STARTED", { index: 3 }),
      event("PREVIEW_CANDIDATE_STARTED", { index: 1 }),
    ],
  });
  assert.equal(result.status, "passed");
  assert.equal(result.occurredAt, "2026-10-24T10:00:04.000Z");
  assert.deepEqual(result.diagnostics.map((entry) => entry.code), [
    "PREVIEW_CANDIDATE_VERIFIED",
    "PREVIEW_RUNTIME_STARTED",
  ]);
});

test("ignores gate diagnostics recorded after DEVELOPER_GATES_FINISHED", () => {
  const result = buildDeveloperValidationFeedback({
    projectId: PROJECT,
    events: [
      event("DEVELOPER_BUILD_FAILED", { index: 5, message: "A later unrelated build failed." }),
      event("DEVELOPER_GATES_FINISHED", { index: 4, details: { success: true } }),
      event("DEVELOPER_TEST_PASSED", { index: 3 }),
      event("DEVELOPER_GATES_STARTED", { index: 1 }),
    ],
  });
  assert.equal(result.status, "passed");
  assert.equal(result.occurredAt, "2026-10-24T10:00:04.000Z");
  assert.deepEqual(result.diagnostics.map((entry) => entry.code), [
    "DEVELOPER_GATES_FINISHED",
    "DEVELOPER_TEST_PASSED",
  ]);
});

test("redacts paths and secrets, bounds messages and diagnostics, and omits raw event fields", () => {
  const longMessage = `failed at C:\\Users\\young\\private.js token=secret-value ${"detail ".repeat(130)}`;
  const events = [
    event("DEVELOPER_BUILD_FAILED", { index: 20, message: longMessage, details: { success: false, stdout: "private output" } }),
    ...Array.from({ length: 7 }, (_, index) => event(`DEVELOPER_TEST_${index}_PASSED`, { index: 19 - index })),
    event("DEVELOPER_GATES_STARTED", { index: 1 }),
  ];
  const result = buildDeveloperValidationFeedback({ projectId: PROJECT, events });
  assert.equal(result.status, "failed");
  assert.equal(result.diagnostics.length, 6);
  assert.ok(result.diagnostics[0].message.length <= 700);
  assert.doesNotMatch(result.diagnostics[0].message, /C:\\Users\\young|secret-value|private output/);
  assert.deepEqual(Object.keys(result).sort(), ["attemptId", "diagnostics", "kind", "occurredAt", "schemaVersion", "status"]);
  assert.ok(result.diagnostics.every((diagnostic) => Object.keys(diagnostic).sort().join(",") === "code,message"));
});

test("rejects oversized, malformed, sparse, proxied, and accessor-backed inputs", () => {
  assert.throws(() => buildDeveloperValidationFeedback({ projectId: PROJECT, events: Array(301).fill(event("INFO")) }), TypeError);
  assert.throws(() => buildDeveloperValidationFeedback({ projectId: "not-a-project", events: [] }), TypeError);
  assert.throws(() => buildDeveloperValidationFeedback({ projectId: PROJECT, events: [event("INFO", { id: "bad" })] }), TypeError);
  assert.throws(() => buildDeveloperValidationFeedback({ projectId: PROJECT, events: [{ ...event("INFO"), occurredAt: "not-a-date" }] }), TypeError);

  const sparse = [];
  sparse.length = 1;
  assert.throws(() => buildDeveloperValidationFeedback({ projectId: PROJECT, events: sparse }), TypeError);
  assert.throws(() => buildDeveloperValidationFeedback({ projectId: PROJECT, events: new Proxy([], {}) }), TypeError);

  let getterCalled = false;
  const accessorEvent = event("DEVELOPER_GATES_STARTED");
  Object.defineProperty(accessorEvent, "message", {
    enumerable: true,
    get() { getterCalled = true; return "unsafe"; },
  });
  assert.throws(() => buildDeveloperValidationFeedback({ projectId: PROJECT, events: [accessorEvent] }), TypeError);
  assert.equal(getterCalled, false);

  assert.throws(() => buildDeveloperValidationFeedback({ projectId: PROJECT, events: [event("INFO", { index: 0, details: { projectId: "bad" } })] }), TypeError);
  assert.throws(() => buildDeveloperValidationFeedback({ projectId: PROJECT, events: [event("DEVELOPER_GATES_FINISHED")] }), TypeError);

  let optionsGetterCalled = false;
  const accessorOptions = { events: [] };
  Object.defineProperty(accessorOptions, "projectId", {
    enumerable: true,
    get() { optionsGetterCalled = true; return PROJECT; },
  });
  assert.throws(() => buildDeveloperValidationFeedback(accessorOptions), TypeError);
  assert.equal(optionsGetterCalled, false);
});
