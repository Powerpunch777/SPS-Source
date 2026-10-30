import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLiveBuilderRepairPrompt,
  buildLiveBuilderTeamPrompt,
  verifyLiveBuilderTeamReport,
} from "../scripts/live-builder-team-authoring.mjs";
import { buildLiveBuilderPrompt } from "../scripts/live-builder-authoring.mjs";

const WORKER_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_WORKER_ID = "123e4567-e89b-42d3-a456-426614174001";
const LEAD_RUN_ID = "123e4567-e89b-42d3-a456-426614174002";
const WORKER_RUN_ID = "123e4567-e89b-42d3-a456-426614174003";

function report(workerId = WORKER_ID, overrides = {}) {
  return {
    id: "report-id",
    workerId,
    status: "completed",
    runId: WORKER_RUN_ID,
    recoveryPending: false,
    content: "Worker result",
    ...overrides,
  };
}

test("team prompt delegates the existing objective through the namespaced Builder tools", () => {
  const prompt = buildLiveBuilderTeamPrompt({ workerId: WORKER_ID });

  for (const required of [
    "list_plugin_tools",
    "execute_plugin_tool",
    "sps.plugin-discovery:builder-delegate-worker",
    "sps.plugin-discovery:builder-worker-result",
    WORKER_ID,
    "current conversation ID from the active Builder context",
    "240 seconds",
    "Do not edit or create files yourself",
  ]) assert.ok(prompt.includes(required), `Prompt omitted: ${required}`);
  assert.ok(prompt.includes(buildLiveBuilderPrompt()));
  assert.doesNotMatch(prompt, /\b(?:npm|pnpm|yarn)\s+install\b/i);
  assert.throws(() => buildLiveBuilderTeamPrompt({ workerId: "worker-1" }), /workerId must be a UUID/);
});

test("repair prompt limits the Worker to the manifest and matching manifest hash", () => {
  const feedback = "Core rejected sps.primitives because it must be an array.";
  const prompt = buildLiveBuilderRepairPrompt({ workerId: WORKER_ID, feedback });

  for (const required of [
    "sps.plugin-discovery:builder-delegate-worker",
    "sps.plugin-discovery:builder-worker-result",
    "dist/manifest.js",
    "sps.primitives declaration to exactly []",
    "sps-plugin.json",
    "runtime.manifestSha256",
    "untrusted diagnostic feedback",
    feedback,
    "Do not edit any other path",
    "Do not use the preview harness",
    "Do not install or add dependencies",
    "Do not start or overlap any other Worker assignment",
  ]) assert.ok(prompt.includes(required), `Prompt omitted: ${required}`);
  assert.throws(() => buildLiveBuilderRepairPrompt({ workerId: "not-a-uuid", feedback }), /workerId must be a UUID/);
  assert.throws(() => buildLiveBuilderRepairPrompt({ workerId: WORKER_ID, feedback: "" }), /feedback must be a non-empty string/);
});

test("report verifier returns the latest completed report for exactly the selected Worker", () => {
  const older = report(WORKER_ID, { id: "authoring-report", content: "Initial authoring" });
  const latest = report(WORKER_ID, { id: "repair-report", runId: "123e4567-e89b-42d3-a456-426614174004", content: "Repair result" });
  const conversation = { reports: [report(OTHER_WORKER_ID), older, latest] };

  assert.equal(verifyLiveBuilderTeamReport(conversation, { workerId: WORKER_ID, leadRunId: LEAD_RUN_ID }), latest);
});

test("report verifier rejects a foreign Worker and a failed or unresolved latest report", () => {
  assert.throws(
    () => verifyLiveBuilderTeamReport({ reports: [report(OTHER_WORKER_ID)] }, { workerId: WORKER_ID, leadRunId: LEAD_RUN_ID }),
    /No report exists for the selected Worker/,
  );
  assert.throws(
    () => verifyLiveBuilderTeamReport({ reports: [report(WORKER_ID), report(WORKER_ID, { status: "failed" })] }, { workerId: WORKER_ID, leadRunId: LEAD_RUN_ID }),
    /latest report is not completed/,
  );
  assert.throws(
    () => verifyLiveBuilderTeamReport({ reports: [report(WORKER_ID, { status: "running" })] }, { workerId: WORKER_ID, leadRunId: LEAD_RUN_ID }),
    /latest report is not completed/,
  );
  assert.throws(
    () => verifyLiveBuilderTeamReport({ reports: [report(WORKER_ID, { recoveryPending: true })] }, { workerId: WORKER_ID, leadRunId: LEAD_RUN_ID }),
    /recovery pending/,
  );
});

test("report verifier rejects same-run and malformed UUID identities", () => {
  assert.throws(
    () => verifyLiveBuilderTeamReport({ reports: [report(WORKER_ID, { runId: LEAD_RUN_ID })] }, { workerId: WORKER_ID, leadRunId: LEAD_RUN_ID }),
    /must differ from the Lead runId/,
  );
  assert.throws(
    () => verifyLiveBuilderTeamReport({ reports: [report(WORKER_ID, { runId: "bad-run-id" })] }, { workerId: WORKER_ID, leadRunId: LEAD_RUN_ID }),
    /Worker report runId must be a UUID/,
  );
  assert.throws(
    () => verifyLiveBuilderTeamReport({ reports: [report()] }, { workerId: "bad-worker-id", leadRunId: LEAD_RUN_ID }),
    /workerId must be a UUID/,
  );
  assert.throws(
    () => verifyLiveBuilderTeamReport({ reports: [report()] }, { workerId: WORKER_ID, leadRunId: "bad-lead-run-id" }),
    /leadRunId must be a UUID/,
  );
  assert.throws(
    () => verifyLiveBuilderTeamReport({}, { workerId: WORKER_ID, leadRunId: LEAD_RUN_ID }),
    /conversation must contain a reports array/,
  );
});
