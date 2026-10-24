import { now } from "./room-state.js";

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textParam(params, key, fallback = "") {
  const value = asRecord(params)[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

export function beginRoomActivity(state, kind, jobId = null, sourceCommentId = null) {
  const timestamp = now();
  state.runtime ??= {};
  state.runtime.activity = {
    status: "working",
    kind,
    jobId,
    sourceCommentId,
    turnId: null,
    startedAt: timestamp,
    updatedAt: timestamp,
    steps: [{ id: "turn", type: "turn", label: "요청 분석 중", status: "working", updatedAt: timestamp }],
    error: null,
  };
  return state.runtime.activity;
}

function roomActivityLabel(type, status) {
  const base = {
    reasoning: "요청 분석",
    plan: "작업 계획 정리",
    commandExecution: "도구 실행",
    fileChange: "파일 변경 확인",
    mcpToolCall: "연결 도구 사용",
    dynamicToolCall: "SPS 작업 도구 사용",
    collabAgentToolCall: "협업 Agent 도구 사용",
    webSearch: "웹 검색",
    imageView: "이미지 확인",
    agentMessage: "응답 작성",
  }[type] ?? "작업 진행";
  return status === "completed" ? `${base} 완료` : `${base} 중`;
}

export function applyRoomActivityEvent(state, event) {
  const activity = state.runtime?.activity;
  if (!activity || activity.status !== "working") return false;
  const params = event?.params ?? {};
  const timestamp = now();
  if (event?.method === "turn/started") {
    activity.turnId = params.turnId ?? activity.turnId;
    activity.updatedAt = timestamp;
    return true;
  }
  if (!["item/started", "item/completed"].includes(event?.method) || !params.item?.type) return false;
  const status = event.method === "item/completed" ? "completed" : "working";
  const item = params.item;
  const id = item.id ?? `${item.type}:${params.turnId ?? activity.steps.length}`;
  const index = activity.steps.findIndex((step) => step.id === id);
  const priorStep = index >= 0 ? activity.steps[index] : null;
  const reasoningSummary = item.type === "reasoning" && Array.isArray(item.summary)
    ? item.summary.map((entry) => String(entry || "").trim()).filter(Boolean).join("\n").slice(0, 1800)
    : priorStep?.summary ?? null;
  const nextStep = {
    id,
    type: item.type,
    label: roomActivityLabel(item.type, status),
    status,
    updatedAt: timestamp,
    ...(reasoningSummary ? { summary: reasoningSummary } : {}),
  };
  if (index >= 0) activity.steps[index] = nextStep;
  else activity.steps.push(nextStep);
  activity.steps = activity.steps.slice(-12);
  activity.turnId = params.turnId ?? activity.turnId;
  activity.updatedAt = timestamp;
  return true;
}

export function applyNativeSessionActivityEvent(state, event) {
  const activity = state.runtime?.activity;
  if (!activity || activity.status !== "working" || !event?.runId) return false;
  activity.turnId = event.runId;
  activity.updatedAt = now();
  if (event.eventType === "status") {
    const step = {
      id: "agent-session-status",
      type: "status",
      label: String(event.message || "Agent run status updated").trim().slice(0, 180),
      status: "working",
      updatedAt: activity.updatedAt,
    };
    const index = activity.steps.findIndex((candidate) => candidate.id === step.id);
    if (index >= 0) activity.steps[index] = step;
    else activity.steps.push(step);
    return true;
  }
  if (event.eventType !== "chunk") return false;
  const payload = asRecord(event.payload);
  const nestedPayload = asRecord(payload.payload);
  const toolName = textParam(payload, "currentToolName") || textParam(nestedPayload, "toolName");
  const eventType = textParam(payload, "eventType") || textParam(nestedPayload, "type") || "progress";
  const summary = (
    textParam(payload, "lastAssistantSnippet")
    || textParam(event, "message")
    || textParam(payload, "message")
  ).slice(0, 900);
  const label = toolName
    ? `Using ${toolName}`
    : eventType === "reasoning"
      ? "Reviewing context"
      : eventType === "assistant"
        ? "Preparing the response"
        : "Agent work in progress";
  activity.steps.push({
    id: `agent-session:${event.seq ?? activity.steps.length}`,
    type: toolName ? "tool" : eventType,
    label,
    status: "working",
    updatedAt: activity.updatedAt,
    ...(summary ? { summary } : {}),
  });
  activity.steps = activity.steps.slice(-20);
  return true;
}

export function finishRoomActivity(state, status, error = null) {
  const activity = state.runtime?.activity;
  if (!activity) return;
  activity.status = status;
  activity.error = error ? String(error instanceof Error ? error.message : error).slice(0, 180) : null;
  activity.updatedAt = now();
}

export function roomReasoningSummary(state) {
  const summaries = (state.runtime?.activity?.steps ?? [])
    .filter((step) => step.type === "reasoning" && step.summary)
    .map((step) => step.summary)
    .filter((summary, index, all) => all.indexOf(summary) === index);
  return summaries.join("\n\n").slice(0, 3600);
}

function throttledActivityReporter({ state, applyEvent, persistState, persistSummary, finalSummary, publish = null }) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => persistState(changeSummary)).catch(() => {});
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1_000 - (Date.now() - lastPersistedAt));
    if (remaining === 0) return persist(persistSummary);
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist(persistSummary);
    }, remaining);
  };
  return {
    report(event) {
      if (!applyEvent(state, event)) return;
      dirty = true;
      publish?.(state.runtime?.activity ?? null);
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist(finalSummary);
      return writes;
    },
  };
}

export function createRoomActivityRuntime({ emitRoomEvent, saveRoomState, saveRoomStateDurably }) {
  const reporter = ({ ctx, apiUrl, companyId, issueId, state, native, outsideInvocation }) => throttledActivityReporter({
    state,
    applyEvent: native ? applyNativeSessionActivityEvent : applyRoomActivityEvent,
    persistState: outsideInvocation
      ? (changeSummary) => saveRoomStateDurably(apiUrl, companyId, issueId, state, changeSummary)
      : (changeSummary) => saveRoomState(ctx, companyId, issueId, state, changeSummary),
    persistSummary: native ? "Update native Agent Session activity" : "Update Room activity",
    finalSummary: native ? "Persist final native Agent Session activity" : "Persist final Room activity",
    publish: outsideInvocation ? null : (activity) => emitRoomEvent(ctx, companyId, issueId, { type: "activity", activity }),
  });
  return {
    roomActivityReporter: (ctx, companyId, issueId, state) => reporter({ ctx, companyId, issueId, state, native: false, outsideInvocation: false }),
    nativeRoomActivityReporter: (ctx, companyId, issueId, state) => reporter({ ctx, companyId, issueId, state, native: true, outsideInvocation: false }),
    roomActivityReporterOutsideInvocation: (apiUrl, companyId, issueId, state) => reporter({ apiUrl, companyId, issueId, state, native: false, outsideInvocation: true }),
    nativeRoomActivityReporterOutsideInvocation: (apiUrl, companyId, issueId, state) => reporter({ apiUrl, companyId, issueId, state, native: true, outsideInvocation: true }),
  };
}
