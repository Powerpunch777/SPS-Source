import { randomUUID } from "node:crypto";

const STATE_NAMESPACE = "discovery";
const AUTHORING_STATE_KEY = "authoring-sessions";
const MAX_SESSIONS = 24;
const MAX_EVENTS = 120;
const ID_PATTERN = /^spsas_[a-z0-9]{8,64}$/;
const EVIDENCE_ID_PATTERN = /^spsae_[a-z0-9]{8,64}$/;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const EVENT_TYPES = new Set(["project", "authoring", "build", "preview", "package"]);
const EVENT_STATUSES = new Set(["requested", "running", "passed", "failed", "blocked", "ready"]);
const EVIDENCE_KINDS = new Set(["workspace_file", "run", "test", "diagnostic", "artifact", "preview", "package"]);

function stateKey(companyId) {
  return { scopeKind: "company", scopeId: companyId, namespace: STATE_NAMESPACE, stateKey: AUTHORING_STATE_KEY };
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bounded(value, max, fallback = "") {
  return asString(value, fallback).slice(0, max);
}

function safeRelativeReference(value) {
  const ref = bounded(value, 500);
  if (!ref) throw new Error("Evidence reference is required.");
  if (/^(?:[a-z]:[\\/]|[\\/]{2}|\/|file:|https?:)/i.test(ref) || ref.includes("\0") || ref.split(/[\\/]/).includes("..")) {
    throw new Error("Evidence must use an opaque ID or project-relative reference.");
  }
  return ref;
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((entry) => {
    const record = asRecord(entry);
    const kind = asString(record.kind);
    if (!EVIDENCE_KINDS.has(kind)) throw new Error(`Unsupported authoring evidence kind: ${kind || "missing"}.`);
    const digest = asString(record.digest).toLowerCase();
    if (digest && !DIGEST_PATTERN.test(digest)) throw new Error("Evidence digest must be SHA-256.");
    return {
      kind,
      ref: safeRelativeReference(record.ref),
      label: bounded(record.label, 160, kind),
      ...(digest ? { digest } : {}),
    };
  });
}

function normalizeEvent(value) {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!EVIDENCE_ID_PATTERN.test(id)) throw new Error("Authoring evidence id is invalid.");
  const type = asString(record.type);
  const status = asString(record.status);
  if (!EVENT_TYPES.has(type) || !EVENT_STATUSES.has(status)) throw new Error("Authoring event type or status is invalid.");
  const at = asString(record.at);
  if (!Number.isFinite(Date.parse(at))) throw new Error("Authoring event timestamp is invalid.");
  return {
    id,
    type,
    status,
    summary: bounded(record.summary, 2_000),
    at,
    ...(asString(record.runId) ? { runId: bounded(record.runId, 120) } : {}),
    evidence: normalizeEvidence(record.evidence),
  };
}

function normalizeSession(value) {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!ID_PATTERN.test(id)) throw new Error("Authoring session id is invalid.");
  const pluginId = asString(record.pluginId);
  if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Plugin id is invalid.");
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("Authoring session timestamp is invalid.");
  }
  return {
    id,
    pluginId,
    ...(asString(record.projectRef) ? { projectRef: safeRelativeReference(record.projectRef) } : {}),
    displayName: bounded(record.displayName, 120, pluginId),
    goal: bounded(record.goal, 2_000),
    status: bounded(record.status, 40, "drafting"),
    createdAt,
    updatedAt,
    events: (() => {
      const events = Array.isArray(record.events) ? record.events : [];
      if (events.length > MAX_EVENTS) throw new Error("Authoring session evidence exceeds the append-only ledger limit.");
      return events.map(normalizeEvent);
    })(),
  };
}

function normalizeSessions(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_SESSIONS) throw new Error("Authoring project count exceeds the append-only ledger limit.");
  return value.map(normalizeSession);
}

function eventStatusForSession(event) {
  if (event.status === "failed" || event.status === "blocked") return event.status;
  if (event.type === "package" && event.status === "passed") return "packaged";
  if (event.type === "preview" && event.status === "passed") return "previewed";
  if (event.type === "build" && event.status === "passed") return "verified";
  return "drafting";
}

function eventFromInput(type, input, runId, now) {
  const status = asString(input.status, type === "project" || type === "preview" ? "requested" : "running");
  if (!EVENT_STATUSES.has(status)) throw new Error("Authoring event status is invalid.");
  return normalizeEvent({
    id: `spsae_${randomUUID().replaceAll("-", "")}`,
    type,
    status,
    summary: bounded(input.summary ?? input.objective, 2_000, `${type} ${status}`),
    at: now(),
    runId,
    evidence: input.evidence,
  });
}

export function createDiscoveryAuthoringService(ctx, { now = () => new Date().toISOString() } = {}) {
  const mutationQueues = new Map();

  function mutate(companyId, operation) {
    const previous = mutationQueues.get(companyId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    mutationQueues.set(companyId, current);
    return current.finally(() => {
      if (mutationQueues.get(companyId) === current) mutationQueues.delete(companyId);
    });
  }

  async function load(companyId) {
    return normalizeSessions(await ctx.state.get(stateKey(companyId)));
  }

  async function save(companyId, sessions) {
    const normalized = normalizeSessions(sessions);
    await ctx.state.set(stateKey(companyId), normalized);
    return normalized;
  }

  async function append(companyId, sessionId, event, validate = null) {
    return mutate(companyId, async () => {
      const sessions = await load(companyId);
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (!session) throw new Error("Authoring session was not found in this Workspace.");
      if (session.events.length >= MAX_EVENTS) {
        throw new Error("Authoring evidence ledger is full. Export or archive this project before recording more evidence.");
      }
      if (validate) validate(session);
      session.events = [...session.events, normalizeEvent(event)];
      session.updatedAt = event.at;
      session.status = eventStatusForSession(event);
      await save(companyId, sessions);
      return session;
    });
  }

  async function createProject(input, runContext) {
    const request = asRecord(input);
    const goal = bounded(request.goal, 2_000);
    if (!goal) throw new Error("A plugin goal is required.");
    const displayName = bounded(request.displayName, 120, "SPS Plugin");
    const pluginId = asString(request.pluginId, `local.${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plugin"}`);
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error("Plugin id must use lowercase letters, numbers, dots, underscores, or hyphens.");
    const projectRef = asString(request.projectRef) ? safeRelativeReference(request.projectRef) : "";
    const timestamp = now();
    const session = normalizeSession({
      id: `spsas_${randomUUID().replaceAll("-", "")}`,
      pluginId,
      ...(projectRef ? { projectRef } : {}),
      displayName,
      goal,
      status: "drafting",
      createdAt: timestamp,
      updatedAt: timestamp,
      events: [eventFromInput("project", {
        status: "requested",
        summary: `Create a separate plugin project for ${displayName}.`,
      }, runContext.runId, now)],
    });
    return mutate(runContext.companyId, async () => {
      const sessions = await load(runContext.companyId);
      if (sessions.length >= MAX_SESSIONS) {
        throw new Error("Plugin Builder project limit reached. Export or archive an existing project before starting another.");
      }
      await save(runContext.companyId, [...sessions, session]);
      return session;
    });
  }

  async function runStep(input, runContext) {
    const request = asRecord(input);
    const sessionId = asString(request.authoringSessionId);
    if (!ID_PATTERN.test(sessionId)) throw new Error("A valid authoringSessionId is required.");
    return append(runContext.companyId, sessionId, eventFromInput("authoring", request, runContext.runId, now));
  }

  async function inspectBuild(input, runContext) {
    const request = asRecord(input);
    const sessionId = asString(request.authoringSessionId);
    if (!ID_PATTERN.test(sessionId)) throw new Error("A valid authoringSessionId is required.");
    return append(runContext.companyId, sessionId, eventFromInput("build", request, runContext.runId, now));
  }

  async function requestPreview(input, runContext) {
    const request = asRecord(input);
    const sessionId = asString(request.authoringSessionId);
    if (!ID_PATTERN.test(sessionId)) throw new Error("A valid authoringSessionId is required.");
    return append(runContext.companyId, sessionId, eventFromInput("preview", {
      ...request,
      status: "requested",
      summary: request.summary ?? "Open the verified candidate in the isolated Plugin Preview.",
    }, runContext.runId, now));
  }

  async function createPackage(input, runContext) {
    const request = asRecord(input);
    const sessionId = asString(request.authoringSessionId);
    if (!ID_PATTERN.test(sessionId)) throw new Error("A valid authoringSessionId is required.");
    const packageRef = safeRelativeReference(request.packageRef);
    const packageVersion = bounded(request.packageVersion, 80);
    const summary = bounded(request.summary, 2_000, "Created an SPS plugin package candidate from the verified Builder project.");
    return append(runContext.companyId, sessionId, eventFromInput("package", {
      ...request,
      status: "passed",
      summary: packageVersion ? `${summary} Version: ${packageVersion}.` : summary,
      evidence: [...(Array.isArray(request.evidence) ? request.evidence : []), { kind: "package", ref: packageRef, label: "SPS plugin package" }],
    }, runContext.runId, now), (session) => {
      const build = [...session.events].reverse().find((event) => event.type === "build");
      if (!build || build.status !== "passed") {
        throw new Error("A passed latest build inspection is required before creating a package candidate.");
      }
    });
  }

  return { load, createProject, runStep, inspectBuild, requestPreview, createPackage };
}

export const discoveryAuthoringState = Object.freeze({
  namespace: STATE_NAMESPACE,
  stateKey: AUTHORING_STATE_KEY,
  maxSessions: MAX_SESSIONS,
  maxEvents: MAX_EVENTS,
});
