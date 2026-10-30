import { now } from "./room-state.js";

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textParam(params, key, fallback = "") {
  const value = asRecord(params)[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

export function roomJobTitle(kind) {
  return {
    room_message: "Room message",
    compact_handoff: "Room compact",
    task_owner_feedback: "Task owner feedback",
    task_owner_report: "Task owner report"
  }[kind] ?? "Room job";
}

export function roomJobData(input) {
  return {
    id: input.id,
    companyId: input.companyId,
    roomIssueId: input.roomIssueId,
    taskIssueId: input.taskIssueId ?? null,
    kind: input.kind,
    status: input.status,
    sourceCommentId: input.sourceCommentId ?? null,
    requestedAt: input.requestedAt,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    resultCommentId: input.resultCommentId ?? null,
    error: input.error ?? null,
    payload: asRecord(input.payload)
  };
}

export function isRoomProviderQuotaRetryJob(job) {
  const payload = asRecord(job?.payload);
  return textParam(job, "status") === "queued"
    && textParam(payload, "retryRuntime") === "agy"
    && Boolean(textParam(payload, "quotaRetryAt"));
}

export function terminalRoomJobPatchFromState(job, state) {
  if (textParam(state?.pendingTurn, "jobId") === job.id) return null;
  const activity = asRecord(state?.runtime?.activity);
  const activityMatchesJob = textParam(activity, "jobId") === job.id;
  const status = activityMatchesJob && ["completed", "failed"].includes(textParam(activity, "status"))
    ? textParam(activity, "status")
    : "interrupted";
  return {
    status,
    completedAt: textParam(activity, "updatedAt") || now(),
    resultCommentId: activityMatchesJob ? textParam(activity, "resultCommentId") || null : null,
    error: status === "failed"
      ? textParam(activity, "error") || "The Room Job failed after its Codex turn started."
      : status === "interrupted"
        ? "The Room worker restarted before this Job completed. The submitted message and Room state were preserved."
        : null
  };
}
