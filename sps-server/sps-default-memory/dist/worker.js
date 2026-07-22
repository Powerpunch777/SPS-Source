import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import manifest from "./manifest.js";

const DEFAULT_SIDECAR_URL = "http://127.0.0.1:3188";
const MEMORY_SCOPES = new Set(["company", "project", "agent", "room", "task", "artifact", "user"]);
const MEMORY_LIFECYCLE_EVENTS = new Set([
  "project.created",
  "room.checkpoint",
  "room.compacted",
  "task.completed",
  "task.blocked",
  "task.reopened",
  "artifact.published",
]);
const MAX_LIMIT = 10;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function asStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean)
    : [];
}

function boundedLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function sidecarUrl() {
  const raw = asString(process.env.SPS_MEMORY_SIDECAR_URL || process.env.MEMORY_SIDECAR_URL, DEFAULT_SIDECAR_URL);
  const url = new URL(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]";
  if (!loopback || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("SPS Default Memory must use a loopback HTTP(S) sidecar.");
  }
  return url;
}

async function sidecarRequest(pathname, { method = "GET", searchParams, body } = {}) {
  const url = new URL(pathname, sidecarUrl());
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== null && value !== undefined && asString(value)) url.searchParams.set(key, String(value));
  }
  const token = asString(process.env.SPS_MEMORY_SIDECAR_TOKEN || process.env.MEMORY_SIDECAR_TOKEN);
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-sidecar-token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`SPS Default Memory returned an invalid response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data?.message || data?.error || `SPS Default Memory request failed (${response.status}).`);
  return data;
}

function contextReferences(runContext) {
  const context = asRecord(runContext);
  return {
    companyId: asString(context.companyId) || null,
    projectId: asString(context.projectId) || null,
    agentId: asString(context.agentId) || null,
    roomId: asString(context.roomId) || null,
    taskId: asString(context.issueId || context.taskId) || null,
    artifactId: asString(context.artifactId) || null,
    userId: asString(context.userId) || null,
    runId: asString(context.runId) || null,
  };
}

function lifecycleReferences(event) {
  const payload = asRecord(event?.payload);
  const entityId = asString(event?.entityId) || null;
  const entityType = asString(event?.entityType);
  const taskId = asString(payload.taskId || payload.issueId)
    || ((entityType === "task" || entityType === "issue") ? entityId : null);
  const roomId = asString(payload.roomId) || (entityType === "room" ? entityId : null);
  const projectId = asString(payload.projectId) || (entityType === "project" ? entityId : null);
  const artifactId = asString(payload.artifactId) || (entityType === "artifact" ? entityId : null);
  const agentId = asString(payload.agentId) || (entityType === "agent" ? entityId : null);
  const userId = asString(payload.userId) || (entityType === "user" ? entityId : null);
  return {
    companyId: asString(event?.companyId) || null,
    projectId,
    agentId,
    roomId,
    taskId,
    issueId: taskId,
    artifactId,
    userId,
    runId: asString(payload.runId) || null,
  };
}

function lifecycleScope(refs) {
  if (refs.artifactId) return "artifact";
  if (refs.taskId) return "task";
  if (refs.roomId) return "room";
  if (refs.projectId) return "project";
  if (refs.agentId) return "agent";
  if (refs.userId) return "user";
  return "company";
}

async function recordLifecycleCandidate(ctx, event) {
  if (!MEMORY_LIFECYCLE_EVENTS.has(event.eventType)) return;
  const refs = lifecycleReferences(event);
  if (!refs.companyId) return;
  const scope = lifecycleScope(refs);
  await sidecarRequest("/memory/candidates", {
    method: "POST",
    body: {
      content: `Lifecycle checkpoint: ${event.eventType} completed. Review the referenced ${scope} before promoting any long-term memory.`,
      scope,
      type: "lifecycle",
      tags: ["lifecycle", event.eventType],
      idempotencyKey: `lifecycle:${event.eventId}`,
      source: {
        kind: "sps_memory_lifecycle",
        note: event.eventType,
        eventId: event.eventId,
        runId: refs.runId,
      },
      ...refs,
    },
  });
  ctx.logger.info("SPS memory lifecycle candidate recorded", {
    eventId: event.eventId,
    eventType: event.eventType,
    scope,
  });
}

function formatRecall(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length === 0) {
    return "No approved long-term memory matched. Continue from the active room, task, documents, and source files.";
  }
  const lines = ["# SPS Memory Recall", ""];
  for (const [index, item] of items.entries()) {
    lines.push(`## ${index + 1}. ${item.scope ?? "memory"} - ${item.section ?? "Uncategorized"}`);
    if (item.date) lines.push(`Date: ${item.date}`);
    if (item.provenance?.path) lines.push(`Source: ${item.provenance.path}${item.provenance.lineStart ? `:${item.provenance.lineStart}` : ""}`);
    lines.push("");
    lines.push(asString(item.text));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

async function recall(params, runContext) {
  const input = asRecord(params);
  const query = asString(input.query);
  if (!query) return { error: "query_required", content: "Memory recall requires a non-empty query." };
  const refs = contextReferences(runContext);
  const scopes = asStringList(input.scopes).filter((scope) => MEMORY_SCOPES.has(scope));
  const data = await sidecarRequest("/memory/search", {
    searchParams: {
      q: query,
      scope: scopes.join(","),
      limit: boundedLimit(input.limit),
      ...refs,
    },
  });
  return { content: formatRecall(data), data };
}

async function propose(params, runContext) {
  const input = asRecord(params);
  const content = asString(input.content);
  if (!content) return { error: "content_required", content: "Memory proposal requires concise content." };
  const scope = asString(input.scope, "project");
  if (!MEMORY_SCOPES.has(scope)) return { error: "invalid_scope", content: `Unsupported memory scope: ${scope}.` };
  const refs = contextReferences(runContext);
  const data = await sidecarRequest("/memory/candidates", {
    method: "POST",
    body: {
      content,
      scope,
      type: asString(input.type, "learning"),
      tags: asStringList(input.tags),
      source: {
        kind: "sps_agent_tool",
        note: asString(input.sourceNote) || null,
        runId: refs.runId,
      },
      ...refs,
    },
  });
  const candidate = data?.candidate ?? {};
  return {
    content: [
      "# Memory Candidate Recorded",
      "",
      `Candidate ID: ${candidate.id ?? "unknown"}`,
      `Scope: ${candidate.scope ?? scope}`,
      "",
      candidate.content ?? content,
      "",
      "This is reviewable memory evidence. It does not silently alter design or implementation files.",
    ].join("\n"),
    data,
  };
}

function safeTool(ctx, handler) {
  return async (params, runContext) => {
    try {
      return await handler(params, runContext);
    } catch (error) {
      ctx.logger.warn("SPS Default Memory tool failed", { message: error instanceof Error ? error.message : String(error) });
      return {
        error: "memory_unavailable",
        content: "SPS Default Memory is temporarily unavailable. Continue from the active room, task, documents, and source files.",
      };
    }
  };
}

const declarations = new Map(manifest.tools.map((tool) => [tool.name, tool]));

const plugin = definePlugin({
  async setup(ctx) {
    ctx.tools.register("memory-recall", declarations.get("memory-recall"), safeTool(ctx, recall));
    ctx.tools.register("memory-propose", declarations.get("memory-propose"), safeTool(ctx, propose));
    for (const eventType of MEMORY_LIFECYCLE_EVENTS) {
      ctx.events.on(eventType, async (event) => {
        await recordLifecycleCandidate(ctx, event);
      });
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
