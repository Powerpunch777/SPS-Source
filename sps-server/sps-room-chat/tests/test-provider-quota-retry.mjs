import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { parseState, reconcileProviderQuotaTask } = await import("../dist/worker.js");

const companyId = "company-quota";
const taskId = "task-quota";
const workerId = "worker-agy";
const task = {
  id: taskId,
  companyId,
  projectId: "project-quota",
  parentId: "room-cto",
  status: "in_progress",
  assigneeAgentId: workerId,
  executionPolicy: { failure: { automaticRetry: true } }
};
const taskState = {
  version: 1,
  kind: "task_room",
  taskIssueId: taskId,
  originatingRoomIssueId: "room-cto",
  owningAgentId: "cto",
  workerAgentId: workerId,
  quotaRetry: {
    status: "core_scheduled",
    provider: "agy",
    scheduledRunId: "run-scheduled-1",
    nextRetryAt: "2026-07-16T01:00:00.000Z"
  }
};
let document = { latestRevisionId: "revision-1", body: `${JSON.stringify(taskState)}\n` };
let runs = [{
  runId: "run-scheduled-1",
  status: "scheduled_retry",
  retryOfRunId: "run-quota-1",
  scheduledRetryAt: "2026-07-16T01:00:00.000Z"
}];
const calls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init = {}) => {
  const requestUrl = new URL(String(url));
  const method = String(init.method || "GET").toUpperCase();
  const pathname = decodeURIComponent(requestUrl.pathname);
  const body = init.body ? JSON.parse(String(init.body)) : null;
  calls.push({ method, pathname, body });
  if (pathname === `/api/issues/${taskId}/runs` && method === "GET") {
    return new Response(JSON.stringify(runs), { status: 200 });
  }
  if (pathname === `/api/issues/${taskId}` && method === "PATCH") {
    Object.assign(task, body);
    return new Response(JSON.stringify(task), { status: 200 });
  }
  if (pathname === "/api/heartbeat-runs/run-scheduled-1/cancel" && method === "POST") {
    runs[0].status = "cancelled";
    // Mirrors the core's cancellation side effect: the plugin must restore it.
    task.status = "todo";
    return new Response(JSON.stringify(runs[0]), { status: 200 });
  }
  if (pathname === `/api/issues/${taskId}/documents/TASK_ROOM_STATE` && method === "PUT") {
    document = { latestRevisionId: `revision-${calls.length}`, body: body.body };
    return new Response(JSON.stringify(document), { status: 200 });
  }
  throw new Error(`Unexpected request: ${method} ${pathname}`);
};

const ctx = {
  config: { get: async () => ({ paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: { documents: { get: async () => document } },
  logger: { warn: () => {} }
};
const runtime = { paperclipApiUrl: "http://127.0.0.1:3100" };
const worker = { id: workerId, status: "idle", adapterType: "antigravity_local" };
const result = await reconcileProviderQuotaTask(ctx, runtime, companyId, task, new Map([[workerId, worker]]));

assert.equal(result.outcome, "automatic_retry_disabled");
assert.equal(task.status, "in_progress");
assert.equal(task.executionPolicy.failure.automaticRetry, false);
assert.equal(runs[0].status, "cancelled");
assert.equal(calls.some((call) => call.pathname.endsWith("/wakeup")), false);
assert.equal(calls.some((call) => call.pathname.endsWith("/cancel")), true);
assert.equal(calls.some((call) => call.pathname === `/api/issues/${taskId}` && call.body?.status === "in_progress"), true);
const saved = parseState(document.body);
assert.equal(saved.quotaRetry.status, "disabled");
assert.equal(saved.quotaRetry.automaticRetry, false);
assert.equal(saved.quotaRetry.scheduledRunId, null);
assert.equal(saved.quotaRetry.nextRetryAt, null);

globalThis.fetch = originalFetch;
console.log("PASS Provider quota retries are disabled, queued runs are cancelled, and the Task state is preserved");
