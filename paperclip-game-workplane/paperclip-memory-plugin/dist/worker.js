import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import manifest from "./manifest.js";
import crypto from "node:crypto";
import net from "node:net";

let pluginCtx = null;

const DEFAULT_SIDECAR_URL = "http://127.0.0.1:3188";
const MAX_SEARCH_LIMIT = 10;

const toolDeclarations = new Map(
  manifest.tools.map((tool) => [
    tool.name,
    {
      displayName: tool.displayName,
      description: tool.description,
      parametersSchema: tool.parametersSchema
    }
  ])
);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const SUPPORTED_NONTERMINAL_STATUSES = ["running", "pending", "queued"];
const PIPE_PROTOCOL_VERSION = 1;
const MAX_PIPE_RESPONSE_BYTES = 64 * 1024;
const PIPE_RESPONSE_TIMEOUT_MS = 15000;

function redactToken(text, token) {
  if (!text || typeof text !== "string" || !token || typeof token !== "string" || token.trim() === "") {
    return text;
  }
  const escapedToken = token.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(escapedToken, 'g');
  return text.replace(regex, '[REDACTED]');
}

function stringParam(params, key, fallback = "") {
  const value = asRecord(params)[key];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function numberParam(params, key, fallback, min, max) {
  const raw = asRecord(params)[key];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function arrayOfStringsParam(params, key) {
  const value = asRecord(params)[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function getSidecarUrl(config) {
  const raw = String(config.sidecarUrl || process.env.MEMORY_SIDECAR_URL || DEFAULT_SIDECAR_URL).trim();
  const withProtocol = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  const isLoopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]";
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Memory Sidecar URL must use http or https.");
  }
  if (!isLoopback) {
    throw new Error("Memory Sidecar URL must point to localhost or 127.0.0.1.");
  }
  return url;
}

async function getRuntimeConfig(ctx) {
  const config = asRecord(await ctx.config.get());
  const sidecarUrl = getSidecarUrl(config);
  const token = String(config.sidecarToken || process.env.MEMORY_SIDECAR_TOKEN || "").trim();
  return { sidecarUrl, token };
}

async function fetchSidecarJson(ctx, pathname, options = {}) {
  const { sidecarUrl, token } = await getRuntimeConfig(ctx);
  const url = new URL(pathname, sidecarUrl);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    accept: "application/json",
    ...(options.headers ?? {})
  };
  if (token) headers["x-sidecar-token"] = token;

  // The host-managed ctx.http.fetch rejects private/reserved IP ranges.
  // This plugin is intentionally loopback-only, so the safety boundary is the
  // URL validation above and the worker uses Node's standard fetch here.
  const response = await fetch(url.href, {
    method: options.method ?? "GET",
    headers,
    body: options.body
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Memory Sidecar returned non-JSON response: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(
      `Memory Sidecar request failed with ${response.status}: ${data?.message || data?.error || text}`
    );
  }
  return data;
}

function formatSource(item) {
  const provenance = item.provenance ?? {};
  if (!provenance.path) return "Source: unknown";
  const line = provenance.lineStart ? `:${provenance.lineStart}` : "";
  return `Source: ${provenance.path}${line}`;
}

function formatSearchResults(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const lines = [
    "# Memory Search",
    "",
    `Query: ${data?.query ?? ""}`,
    `Results: ${items.length}`,
    `Warning Count: ${data?.warningCount ?? 0}`,
    ""
  ];

  if (items.length === 0) {
    lines.push(
      "No approved memory matched. Continue from Paperclip task comments, documents, work products, and source files."
    );
    return lines.join("\n");
  }

  items.forEach((item, index) => {
    const role = item.role ? `/${item.role}` : "";
    lines.push(`## ${index + 1}. ${item.scope}${role} - ${item.section ?? "Uncategorized"}`);
    lines.push(`Date: ${item.date ?? "unknown"}`);
    lines.push(`Score: ${item.score ?? "n/a"}`);
    lines.push(formatSource(item));
    lines.push("");
    lines.push(String(item.text ?? ""));
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

function buildCandidateBody(params, runCtx) {
  const content = stringParam(params, "content");
  const sourceKind = stringParam(params, "sourceKind", "paperclip_agent_tool");
  const sourceNote = stringParam(params, "sourceNote");
  const issueId = stringParam(params, "issueId");
  return {
    content,
    scope: stringParam(params, "scope", "project") || "project",
    type: stringParam(params, "type", "learning") || "learning",
    issueId: issueId || null,
    agentId: runCtx?.agentId ?? null,
    companyId: runCtx?.companyId ?? null,
    projectId: runCtx?.projectId ?? null,
    tags: arrayOfStringsParam(params, "tags"),
    source: {
      kind: sourceKind || "paperclip_agent_tool",
      note: sourceNote || null,
      runId: runCtx?.runId ?? null,
      projectId: runCtx?.projectId ?? null,
      companyId: runCtx?.companyId ?? null
    }
  };
}

async function handleMemorySearch(ctx, params) {
  const query = stringParam(params, "query");
  if (!query) {
    return {
      error: "query_required",
      content: "Memory search requires a non-empty query."
    };
  }
  const data = await fetchSidecarJson(ctx, "/memory/search", {
    searchParams: {
      q: query,
      scope: stringParam(params, "scope"),
      limit: numberParam(params, "limit", 5, 1, MAX_SEARCH_LIMIT)
    }
  });
  return {
    content: formatSearchResults(data),
    data
  };
}

async function handleMemoryPropose(ctx, params, runCtx) {
  const body = buildCandidateBody(params, runCtx);
  if (!body.content) {
    return {
      error: "content_required",
      content: "Memory candidate content is required."
    };
  }
  const data = await fetchSidecarJson(ctx, "/memory/candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const candidate = data?.candidate ?? {};
  return {
    content: [
      "# Memory Candidate Proposed",
      "",
      `Candidate ID: ${candidate.id ?? "unknown"}`,
      `Scope: ${candidate.scope ?? body.scope}`,
      `Type: ${candidate.type ?? body.type}`,
      "",
      candidate.content ?? body.content,
      "",
      "This is only a candidate. It does not modify approved LEARNINGS.md files."
    ].join("\n"),
    data
  };
}

function safeTool(handler, ctx) {
  return async (params, runCtx) => {
    try {
      return await handler(ctx, params, runCtx);
    } catch (error) {
      ctx.logger.warn("Memory Sidecar tool failed", {
        message: error.message,
        agentId: runCtx?.agentId,
        runId: runCtx?.runId
      });
      return {
        error: "memory_sidecar_unavailable",
        content:
          "Memory Sidecar is unavailable or misconfigured. Continue using Paperclip comments, documents, work products, and LEARNINGS.md files.",
        data: { message: error.message }
      };
    }
  };
}

function safeDataHandler(handler, ctx) {
  return async (params, runCtx) => {
    try {
      return await handler(ctx, params, runCtx);
    } catch (error) {
      ctx.logger.warn("Memory Sidecar data provider failed", {
        message: error.message,
        agentId: runCtx?.agentId,
        runId: runCtx?.runId
      });
      throw error;
    }
  };
}

async function handleMemoryView(ctx, params, runCtx) {
  const companyId = stringParam(params, "companyId");
  const issueId = stringParam(params, "issueId");

  if (!companyId || !issueId) {
    throw new Error("companyId and issueId are required for memory-view data");
  }

  // Read current issue via SDK
  const issue = await ctx.issues.get(issueId, companyId);
  if (!issue) {
    throw new Error("Issue was not found in the active company for memory-view data");
  }
  const currentProjectId = issue?.projectId || null;

  // Fetch approved company memory
  const companyData = await fetchSidecarJson(ctx, "/memory/items", {
    searchParams: {
      scope: "company",
      companyId: companyId
    }
  });

  // Fetch approved project memory
  const projectData = currentProjectId
    ? await fetchSidecarJson(ctx, "/memory/items", {
      searchParams: {
        scope: "project",
        companyId: companyId,
        projectId: currentProjectId
      }
    })
    : { items: [] };

  // Fetch candidates filtered by current issueId
  const candidateData = await fetchSidecarJson(ctx, "/memory/candidates", {
    searchParams: {
      companyId: companyId,
      issueId: issueId
    }
  });

  // Fetch approved agent memory if an assignee exists
  const hasAssignee = !!issue?.assigneeAgentId;
  const agentData = hasAssignee
    ? await fetchSidecarJson(ctx, "/memory/items", {
      searchParams: {
        scope: "agent",
        companyId: companyId,
        agentId: issue.assigneeAgentId
      }
    })
    : { items: [] };

  return {
    companyMemories: companyData?.items ?? [],
    projectMemories: projectData?.items ?? [],
    candidates: candidateData?.candidates ?? [],
    hasAssignee,
    agentMemories: agentData?.items ?? []
  };
}

async function handleProjectMemoryView(ctx, params, runCtx) {
  const companyId = stringParam(params, "companyId");
  const projectId = stringParam(params, "projectId");

  if (!companyId || !projectId) {
    throw new Error("companyId and projectId are required for project-memory-view data");
  }

  // Fetch approved company memory
  const companyData = await fetchSidecarJson(ctx, "/memory/items", {
    searchParams: {
      scope: "company",
      companyId: companyId
    }
  });

  // Fetch approved project memory
  const projectData = await fetchSidecarJson(ctx, "/memory/items", {
    searchParams: {
      scope: "project",
      companyId: companyId,
      projectId: projectId
    }
  });

  // Fetch candidates filtered by projectId
  const candidateData = await fetchSidecarJson(ctx, "/memory/candidates", {
    searchParams: {
      companyId: companyId,
      projectId: projectId
    }
  });

  return {
    companyMemories: companyData?.items ?? [],
    projectMemories: projectData?.items ?? [],
    candidates: candidateData?.candidates ?? []
  };
}

async function handleProjectMemoryCandidatesView(ctx, params, runCtx) {
  const companyId = stringParam(params, "companyId");
  const projectId = stringParam(params, "projectId");

  if (!companyId || !projectId) {
    throw new Error("companyId and projectId are required for project-memory-candidates-view data");
  }

  // Fetch candidates filtered by projectId
  const candidateData = await fetchSidecarJson(ctx, "/memory/candidates", {
    searchParams: {
      companyId: companyId,
      projectId: projectId
    }
  });

  const candidates = Array.isArray(candidateData?.candidates) ? candidateData.candidates : [];

  // Strict project isolation filter: only candidates with exactly matching companyId and projectId.
  // Legacy candidates missing root company/project IDs must remain absent from the strict queue.
  const strictCandidates = candidates.filter((cand) => {
    return cand.companyId === companyId && cand.projectId === projectId;
  });

  return {
    candidates: strictCandidates
  };
}

async function handleDirectTaskPreview(ctx, params, runCtx) {
  const companyId = stringParam(params, "companyId");
  const projectId = stringParam(params, "projectId");
  const role = stringParam(params, "role");
  const parentId = stringParam(params, "parentId");
  const title = stringParam(params, "title");
  const description = stringParam(params, "description");

  const errors = {};
  let isValid = true;

  if (!companyId) {
    errors.companyId = "Company ID is required.";
    isValid = false;
  }
  if (!projectId) {
    errors.projectId = "Project ID is required.";
    isValid = false;
  }
  if (!parentId) {
    errors.parentId = "An Agent Room is required.";
    isValid = false;
  }

  const allowedRoles = ["unreal-code", "unreal-qa"];
  if (!role) {
    errors.role = "Role is required.";
    isValid = false;
  } else if (!allowedRoles.includes(role)) {
    errors.role = "Invalid role selected. Restricted to unreal-code and unreal-qa.";
    isValid = false;
  }

  if (!title) {
    errors.title = "Title is required.";
    isValid = false;
  } else if (title.length > 200) {
    errors.title = `Title must be 200 characters or less (current: ${title.length}).`;
    isValid = false;
  }

  if (!description) {
    errors.description = "Description is required.";
    isValid = false;
  } else if (description.length > 4000) {
    errors.description = `Description must be 4,000 characters or less (current: ${description.length}).`;
    isValid = false;
  }

  let roleLabel = "";
  let roleBoundary = "";
  if (role === "unreal-code") {
    roleLabel = "Unreal Code Worker";
    roleBoundary = "Uses the validated Unreal workspace and defaults to read-only inspection; requested edits are governed by the explicit Task Room scope.";
  } else if (role === "unreal-qa") {
    roleLabel = "Unreal QA Worker";
    roleBoundary = "Defaults to inspect and report only. It must not edit gameplay code, Blueprints, assets, settings, build, package, launch the editor, run destructive commands, or run a test command unless the Task Room explicitly authorizes that exact action.";
  } else {
    roleLabel = "Unknown Worker";
    roleBoundary = "No permissions granted.";
  }

  const paperclipStatement = isValid
    ? `An unassigned child Task Room would be created under the selected Agent Room for the Unreal project.`
    : "Validation failed. No Task Room can be created.";

  return {
    valid: isValid,
    errors,
    roleLabel,
    roleBoundary,
    paperclipStatement
  };
}

function directTaskRoleForAgentRoomTitle(title) {
  if (title === "[Agent Room] Code Worker") return "unreal-code";
  if (title === "[Agent Room] QA Worker") return "unreal-qa";
  return null;
}

async function handleDirectTaskAgentRooms(ctx, params) {
  const companyId = stringParam(params, "companyId");
  const projectId = stringParam(params, "projectId");
  if (!companyId || !projectId) {
    return { agentRooms: [] };
  }

  const issues = await ctx.issues.list({ companyId, projectId, limit: 200 });
  const terminalStatuses = new Set(["done", "blocked", "cancelled"]);
  const agentRooms = issues
    .map((issue) => ({ issue, role: directTaskRoleForAgentRoomTitle(issue.title) }))
    .filter(({ issue, role }) => (
      role &&
      !issue.parentId &&
      !issue.assigneeAgentId &&
      !issue.assigneeUserId &&
      !terminalStatuses.has(issue.status)
    ))
    .map(({ issue, role }) => ({
      id: issue.id,
      identifier: issue.identifier || issue.id,
      title: issue.title,
      role
    }));

  return { agentRooms };
}

function GetMemoryCandidateSectionJs(text) {
  if (!text || typeof text !== "string") {
    return "";
  }
  const pattern = /(?:^|\r?\n)\s*(?:##\s*)?Memory\s+Candidates?\s*:?\s*(?:\r?\n)+(.*?)(?=\r?\n\s*(?:##\s*)?(?:Follow[- ]?up\s+Tasks?|Goal|Result|Changed\s+Files(?:\s+Or\s+Artifacts)?|Artifacts|Verification(?:\s+Performed)?|Durable\s+Lessons)\s*:?\s*(?:\r?\n|$)|$)/is;
  const match = text.match(pattern);
  if (!match) {
    return "";
  }
  let content = match[1];
  const boundary = content.match(/^\s*(?:##\s*)?(?:Follow[- ]?up\s+Tasks?|Goal|Result|Changed\s+Files(?:\s+Or\s+Artifacts)?|Artifacts|Verification(?:\s+Performed)?|Durable\s+Lessons)\s*:/im);
  if (boundary && boundary.index !== undefined) {
    content = content.slice(0, boundary.index);
  }
  return content.trim();
}

function TestEmptyMemoryCandidateJs(content) {
  if (!content || typeof content !== "string" || content.trim() === "") {
    return true;
  }
  const plain = content.replace(/^\s*[-*]\s*/gm, "").trim();
  const emptyPattern = /^(?:none\.?|n\/a|no memory candidates?\.?|none identified\.?|nothing to preserve\.?)$/i;
  return emptyPattern.test(plain);
}

const MAX_CANDIDATE_BODY_SIZE = 4000;
const MAX_CANDIDATES_PER_RUN = 5;

async function extractAndProposeCandidates(ctx, companyId, issueId, runId = null, agentId = null) {
  try {
    if (!issueId || !companyId || !runId) return;

    // Read issue details to get projectId and assigneeAgentId if not provided
    const issue = await ctx.issues.get(issueId, companyId);
    if (!issue) return;

    const projectId = issue.projectId || null;
    const finalAgentId = agentId || issue.assigneeAgentId || null;

    // Fetch comments
    const comments = await ctx.issues.listComments(issueId, companyId);
    if (!comments || comments.length === 0) return;

    // Inspect ONLY comments authored by that exact run (createdByRunId === runId)
    const runComments = comments.filter((c) => c.createdByRunId === runId);
    if (runComments.length === 0) return;

    const candidatesToPropose = [];

    const parseCandidates = (text, commentId, sourceKind) => {
      if (!text) return;
      const match = GetMemoryCandidateSectionJs(text);
      if (match && !TestEmptyMemoryCandidateJs(match)) {
        // Bound the candidate body size
        const boundedContent = match.slice(0, MAX_CANDIDATE_BODY_SIZE);
        candidatesToPropose.push({
          content: boundedContent,
          commentId,
          sourceKind
        });
      }
    };

    // Parse comments
    runComments.forEach((comment) => {
      parseCandidates(
        comment.body,
        comment.id,
        "paperclip_comment"
      );
    });

    // Limit proposed candidates per run
    const limitedCandidates = candidatesToPropose.slice(0, MAX_CANDIDATES_PER_RUN);

    // Submit each found candidate to the sidecar
    for (const cand of limitedCandidates) {
      // Deterministic key: plugin ID + run ID + comment ID
      const pluginId = "local.memory-sidecar";
      const idempotencyKey = crypto
        .createHash("sha256")
        .update(`${pluginId}:${runId}:${cand.commentId}`)
        .digest("hex");

      const payload = {
        content: cand.content,
        scope: "project",
        type: "learning",
        issueId: issueId,
        agentId: finalAgentId,
        companyId: companyId,
        projectId: projectId,
        tags: ["managed-agent-handoff", `issue-${issueId}`],
        idempotencyKey,
        source: {
          kind: cand.sourceKind,
          commentId: cand.commentId,
          note: `Extracted post-run from comment:${cand.commentId}`,
          runId: runId,
          projectId: projectId,
          companyId: companyId
        }
      };

      try {
        await fetchSidecarJson(ctx, "/memory/candidates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        ctx.logger.info("Successfully proposed extracted candidate memory", { issueId, runId, commentId: cand.commentId });
      } catch (err) {
        ctx.logger.warn("Failed to propose extracted memory candidate", {
          message: err.message,
          issueId,
          runId,
          commentId: cand.commentId
        });
      }
    }
  } catch (err) {
    ctx.logger.warn("Guarded post-run candidate extraction failed", {
      message: err.message,
      issueId,
      runId
    });
  }
}

function validateSubmitBody(body) {
  const { companyId, projectId, role, title, description, uproject, idempotencyKey, parentId } = asRecord(body);

  if (!companyId || typeof companyId !== "string" || companyId.trim() === "") {
    throw new Error("Invalid or missing companyId.");
  }
  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    throw new Error("Invalid or missing projectId.");
  }
  if (!role || (role !== "unreal-code" && role !== "unreal-qa")) {
    throw new Error("Invalid or missing role. Allowed: unreal-code, unreal-qa.");
  }
  if (!title || typeof title !== "string" || title.trim() === "" || title.length > 200) {
    throw new Error("Invalid or missing title. Title must be <= 200 characters.");
  }
  if (!description || typeof description !== "string" || description.trim() === "" || description.length > 4000) {
    throw new Error("Invalid or missing description. Description must be <= 4000 characters.");
  }
  if (uproject !== undefined && uproject !== null && uproject !== "") {
    if (typeof uproject !== "string") {
      throw new Error("uproject must be a string.");
    }
    if (uproject.includes("/") || uproject.includes("\\") || uproject.includes("..") || !uproject.endsWith(".uproject")) {
      throw new Error("uproject must be a relative filename ending in .uproject without path traversal.");
    }
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new Error("Invalid or missing idempotencyKey.");
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new Error("idempotencyKey length must be between 8 and 128 characters.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)) {
    throw new Error("idempotencyKey must contain only alphanumeric characters, hyphens, or underscores.");
  }
  if (!parentId || typeof parentId !== "string" || parentId.trim() === "") {
    throw new Error("Invalid or missing parentId.");
  }
}

function validateJobId(jobId) {
  return typeof jobId === "string" && /^job-[a-f0-9]{32}$/.test(jobId);
}

function validateBridgeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("directBridgeUrl is required and must be a string.");
  }
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("http://")) {
    throw new Error("directBridgeUrl must start with http://");
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch (e) {
    throw new Error("Invalid URL format.");
  }
  if (url.protocol !== "http:") {
    throw new Error("directBridgeUrl must use http protocol.");
  }
  if (url.hostname !== "127.0.0.1") {
    throw new Error("directBridgeUrl host must be exactly 127.0.0.1.");
  }
  if (url.username || url.password) {
    throw new Error("directBridgeUrl must not contain userinfo/credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("directBridgeUrl must not contain query parameters or hash.");
  }
  if (url.pathname !== "/") {
    throw new Error("directBridgeUrl must have a root-only base path.");
  }
  if (!url.port) {
    throw new Error("directBridgeUrl must include an explicit port.");
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== url.port) {
    throw new Error("directBridgeUrl port is invalid.");
  }
  return url.href;
}

function getPipePath(pipeName) {
  if (!pipeName || typeof pipeName !== "string") {
    throw new Error("Pipe name is required and must be a string.");
  }
  const name = pipeName.trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name)) {
    throw new Error("Invalid pipe name.");
  }
  return `\\\\.\\pipe\\${name}`;
}

function callNamedPipeBroker(pipeName, operation, payload, jobId) {
  return new Promise((resolve, reject) => {
    let pipePath;
    try {
      pipePath = getPipePath(pipeName);
    } catch (err) {
      return reject(err);
    }

    const requestId = crypto.randomUUID();
    const requestObj = {
      protocolVersion: PIPE_PROTOCOL_VERSION,
      requestId,
      operation
    };
    if (payload !== undefined) requestObj.payload = payload;
    if (jobId !== undefined) requestObj.jobId = jobId;

    const socket = net.connect(pipePath);
    let dataBuffer = "";
    let isFinished = false;
    let byteLength = 0;
    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        socket.destroy();
        reject(new Error("Timeout waiting for response from named pipe."));
      }
    }, PIPE_RESPONSE_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write(JSON.stringify(requestObj) + "\n", "utf8");
    });

    socket.on("data", (chunk) => {
      if (isFinished) return;
      byteLength += chunk.length;
      if (byteLength > MAX_PIPE_RESPONSE_BYTES) {
        isFinished = true;
        clearTimeout(timer);
        socket.destroy();
        const err = new Error("Response from named pipe exceeded size limit.");
        err.isProtocolError = true;
        return reject(err);
      }
      dataBuffer += chunk.toString("utf8");

      if (dataBuffer.includes("\n")) {
        const lines = dataBuffer.split("\n");
        if (lines[0].trim() !== "") {
          isFinished = true;
          clearTimeout(timer);
          socket.destroy();
          processResponse(lines[0]);
        }
      }
    });

    socket.on("end", () => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      processResponse(dataBuffer);
    });

    socket.on("error", (err) => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timer);
      reject(err);
    });

    function processResponse(rawText) {
      const trimmed = rawText.trim();
      if (!trimmed) {
        const err = new Error("Empty response from named pipe.");
        err.isProtocolError = true;
        return reject(err);
      }
      let responseObj;
      try {
        responseObj = JSON.parse(trimmed);
      } catch (err) {
        const wrapperErr = new Error(`Malformed JSON response from named pipe: ${err.message}`);
        wrapperErr.isProtocolError = true;
        return reject(wrapperErr);
      }

      if (!responseObj || typeof responseObj !== "object") {
        const err = new Error("Invalid response object from named pipe.");
        err.isProtocolError = true;
        return reject(err);
      }

      if (responseObj.protocolVersion !== PIPE_PROTOCOL_VERSION) {
        const err = new Error("Unsupported named pipe protocol version.");
        err.isProtocolError = true;
        return reject(err);
      }

      if (responseObj.requestId !== requestId) {
        const err = new Error("Named pipe response request ID mismatch.");
        err.isProtocolError = true;
        return reject(err);
      }

      if (typeof responseObj.ok !== "boolean" || !Number.isInteger(responseObj.statusCode) || responseObj.statusCode < 100 || responseObj.statusCode > 599 || !Object.prototype.hasOwnProperty.call(responseObj, "body")) {
        const err = new Error("Invalid named pipe response envelope.");
        err.isProtocolError = true;
        return reject(err);
      }

      const statusIndicatesSuccess = responseObj.statusCode >= 200 && responseObj.statusCode < 300;
      if (responseObj.ok !== statusIndicatesSuccess) {
        const err = new Error("Named pipe response status is inconsistent.");
        err.isProtocolError = true;
        return reject(err);
      }

      resolve(responseObj);
    }
  });
}

async function handleDirectTaskSubmit(ctx, input) {
  const config = asRecord(await ctx.config.get());
  
  if (!config.enableDirectTaskLaunch) {
    return {
      status: 403,
      body: { error: "direct_task_launch_disabled", message: "Direct Task Launch is disabled." }
    };
  }

  const { companyId, projectId, role, title, description, uproject, idempotencyKey, parentId } = input.body || {};
  if (!input.companyId || companyId !== input.companyId) {
    return {
      status: 400,
      body: { error: "company_mismatch", message: "Company ID mismatch." }
    };
  }

  // Check active job and idempotency first to avoid resolving secrets on repeat/concurrent requests
  const activeJob = await ctx.state.get({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
  if (activeJob) {
    if (!activeJob.jobId || !validateJobId(activeJob.jobId)) {
      try {
        await ctx.issues.createComment(activeJob.issueId, "Direct Task Bridge execution failed: Invalid job state record.", activeJob.companyId);
        await ctx.issues.update(activeJob.issueId, { status: "blocked" }, activeJob.companyId);
      } catch (err) {
        // Ignored
      }
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
      return {
        status: 400,
        body: { error: "invalid_job_state", message: "Invalid job state record." }
      };
    }

    if (activeJob.idempotencyKey === idempotencyKey) {
      return {
        status: 200,
        body: {
          success: true,
          issueId: activeJob.issueId,
          jobId: activeJob.jobId,
          status: activeJob.status
        }
      };
    }
    return {
      status: 409,
      body: { error: "concurrency_limit_exceeded", message: "Another direct task is currently active." }
    };
  }

  try {
    validateSubmitBody(input.body);
  } catch (error) {
    return {
      status: 400,
      body: { error: "invalid_input", message: error.message }
    };
  }

  const transport = config.directTaskTransport || "windows-named-pipe";

  let bridgeUrl;
  let bridgeSecret;
  let pipeName;

  if (transport === "windows-named-pipe") {
    pipeName = config.directPipeName || "PaperclipDirectTaskBroker";
    if (!pipeName || typeof pipeName !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(pipeName)) {
      return {
        status: 400,
        body: { error: "invalid_bridge_config", message: "Invalid pipe name config." }
      };
    }
  } else if (transport === "legacy-http-token") {
    try {
      bridgeUrl = validateBridgeUrl(config.directBridgeUrl);
    } catch (error) {
      return {
        status: 400,
        body: { error: "invalid_bridge_config", message: error.message }
      };
    }

    try {
      const secretRef = config.directBridgeSecretRef;
      if (!secretRef || typeof secretRef !== "string" || secretRef.trim() === "") {
        throw new Error("directBridgeSecretRef must be a non-empty string.");
      }
      bridgeSecret = await ctx.secrets.resolve(secretRef);
    } catch (error) {
      return {
        status: 400,
        body: { error: "bridge_secret_resolution_failed", message: "Bridge secret could not be resolved." }
      };
    }
    if (!bridgeSecret) {
      return {
        status: 400,
        body: { error: "bridge_secret_missing", message: "Bridge secret could not be resolved." }
      };
    }
  } else {
    return {
      status: 400,
      body: { error: "invalid_bridge_config", message: `Unsupported transport: ${transport}` }
    };
  }

  const project = await ctx.projects.get(projectId, companyId);
  if (!project) {
    return {
      status: 400,
      body: { error: "project_not_found", message: "Project not found or mismatch with company." }
    };
  }

  // Parent issue validation
  let parentIssue;
  try {
    parentIssue = await ctx.issues.get(parentId, companyId);
  } catch (error) {
    // Ignored
  }

  if (!parentIssue) {
    return {
      status: 400,
      body: { error: "invalid_input", message: "Parent issue not found." }
    };
  }

  if (parentIssue.companyId !== companyId || parentIssue.projectId !== projectId) {
    return {
      status: 400,
      body: { error: "invalid_input", message: "Parent issue company/project mismatch." }
    };
  }

  if (parentIssue.parentId) {
    return {
      status: 400,
      body: { error: "invalid_input", message: "Parent issue must be a root issue." }
    };
  }

  const terminalStatuses = ["done", "blocked", "cancelled"];
  if (terminalStatuses.includes(parentIssue.status)) {
    return {
      status: 400,
      body: { error: "invalid_input", message: "Parent issue is in a terminal status." }
    };
  }

  if (parentIssue.assigneeAgentId || parentIssue.assigneeUserId) {
    return {
      status: 400,
      body: { error: "invalid_input", message: "Parent issue must be unassigned." }
    };
  }

  if (!parentIssue.title || !parentIssue.title.startsWith("[Agent Room] ")) {
    return {
      status: 400,
      body: { error: "invalid_input", message: "Parent issue title must begin with '[Agent Room] '." }
    };
  }

  if (role === "unreal-code" && parentIssue.title !== "[Agent Room] Code Worker") {
    return {
      status: 400,
      body: { error: "invalid_input", message: "unreal-code requires '[Agent Room] Code Worker' parent issue." }
    };
  }

  if (role === "unreal-qa" && parentIssue.title !== "[Agent Room] QA Worker") {
    return {
      status: 400,
      body: { error: "invalid_input", message: "unreal-qa requires '[Agent Room] QA Worker' parent issue." }
    };
  }

  const existingIssues = await ctx.issues.list({
    companyId,
    projectId,
    originKind: "plugin:local.memory-sidecar:direct-task",
    originId: idempotencyKey
  });

  let issue;
  if (existingIssues.length > 0) {
    issue = existingIssues[0];
    if (
      issue.companyId !== companyId ||
      issue.projectId !== projectId ||
      issue.parentId !== parentId ||
      issue.assigneeAgentId ||
      issue.assigneeUserId ||
      terminalStatuses.includes(issue.status)
    ) {
      return {
        status: 409,
        body: { error: "idempotency_conflict", message: "The existing Direct Task Room is not eligible for this request." }
      };
    }
  } else {
    const createParams = {
      companyId,
      projectId,
      title,
      description,
      status: "todo",
      originKind: "plugin:local.memory-sidecar:direct-task",
      originId: idempotencyKey,
      parentId
    };
    if (parentIssue.goalId) {
      createParams.goalId = parentIssue.goalId;
    }
    issue = await ctx.issues.create(createParams);
  }

  const payload = {
    role,
    companyId,
    projectId,
    issueId: issue.id,
    title,
    description,
    projectFile: uproject || null,
    idempotencyKey
  };

  if (transport === "windows-named-pipe") {
    try {
      const response = await callNamedPipeBroker(pipeName, "submit", payload, undefined);

      const responseData = response.body || {};
      const isValid = response.ok &&
        responseData &&
        validateJobId(responseData.jobId) &&
        typeof responseData.status === "string" &&
        SUPPORTED_NONTERMINAL_STATUSES.includes(responseData.status);

      if (!isValid) {
        await ctx.issues.createComment(issue.id, "Failed to dispatch job to Direct Task Bridge: Invalid response from bridge.", companyId);
        await ctx.issues.update(issue.id, { status: "cancelled" }, companyId);
        await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });

        const status = response.ok ? 400 : (response.statusCode || 400);
        return {
          status,
          body: { error: "bridge_dispatch_failed", message: "Failed to dispatch job to Direct Task Bridge." }
        };
      }

      const activeJobRecord = {
        jobId: responseData.jobId,
        idempotencyKey,
        issueId: issue.id,
        companyId,
        projectId,
        status: responseData.status || "running",
        createdAt: new Date().toISOString()
      };
      await ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobRecord);

      return {
        status: 201,
        body: {
          success: true,
          issueId: issue.id,
          jobId: responseData.jobId,
          status: activeJobRecord.status
        }
      };
    } catch (error) {
      await ctx.issues.createComment(issue.id, "Failed to dispatch job to Direct Task Bridge due to a network error.", companyId);
      await ctx.issues.update(issue.id, { status: "cancelled" }, companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });

      return {
        status: 500,
        body: { error: "bridge_network_error", message: "A network error occurred while contacting the Direct Task Bridge." }
      };
    }
  } else {
    // legacy-http-token
    const submitUrl = new URL("/direct-task/submit", bridgeUrl);
    try {
      const response = await fetch(submitUrl.href, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${bridgeSecret}`
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let responseData = null;
      try {
        responseData = responseText ? JSON.parse(responseText) : null;
      } catch (e) {
        // Ignored
      }

      const isValid = responseData &&
        validateJobId(responseData.jobId) &&
        typeof responseData.status === "string" &&
        SUPPORTED_NONTERMINAL_STATUSES.includes(responseData.status);

      if (!response.ok || !isValid) {
        await ctx.issues.createComment(issue.id, "Failed to dispatch job to Direct Task Bridge: Invalid response from bridge.", companyId);
        await ctx.issues.update(issue.id, { status: "cancelled" }, companyId);
        await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });

        const status = response.ok ? 400 : response.status;
        return {
          status,
          body: { error: "bridge_dispatch_failed", message: "Failed to dispatch job to Direct Task Bridge." }
        };
      }

      const activeJobRecord = {
        jobId: responseData.jobId,
        idempotencyKey,
        issueId: issue.id,
        companyId,
        projectId,
        status: responseData.status || "running",
        createdAt: new Date().toISOString()
      };
      await ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobRecord);

      return {
        status: 201,
        body: {
          success: true,
          issueId: issue.id,
          jobId: responseData.jobId,
          status: activeJobRecord.status
        }
      };
    } catch (error) {
      await ctx.issues.createComment(issue.id, "Failed to dispatch job to Direct Task Bridge due to a network error.", companyId);
      await ctx.issues.update(issue.id, { status: "cancelled" }, companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });

      return {
        status: 500,
        body: { error: "bridge_network_error", message: "A network error occurred while contacting the Direct Task Bridge." }
      };
    }
  }
}

async function handleDirectTaskFinalizer(ctx, job) {
  const config = asRecord(await ctx.config.get());
  if (!config.enableDirectTaskLaunch) {
    return;
  }

  const activeJob = await ctx.state.get({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
  if (!activeJob) {
    return;
  }

  if (!activeJob.jobId || !validateJobId(activeJob.jobId)) {
    try {
      await ctx.issues.createComment(activeJob.issueId, "Direct Task Bridge execution failed: Invalid job state record.", activeJob.companyId);
      await ctx.issues.update(activeJob.issueId, { status: "blocked" }, activeJob.companyId);
    } catch (err) {
      // Ignored
    }
    await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    return;
  }

  const issue = await ctx.issues.get(activeJob.issueId, activeJob.companyId);
  if (!issue || ["done", "blocked", "cancelled"].includes(issue.status)) {
    await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    return;
  }

  // 1. Check existing comments for terminal marker BEFORE any bridge URL validation, secret resolution, or fetch.
  const markerPattern = new RegExp(`<!-- direct-task-bridge-marker: ${activeJob.jobId} - (in_review|blocked) -->`);

  let comments = [];
  try {
    comments = await ctx.issues.listComments(activeJob.issueId, activeJob.companyId);
  } catch (error) {
    ctx.logger.warn("Listing issue comments failed; will retry");
    return;
  }

  const existingComment = comments.find(c => c.body && markerPattern.test(c.body));
  if (existingComment) {
    const match = existingComment.body.match(markerPattern);
    const targetStatus = match[1]; // "in_review" or "blocked"
    await ctx.issues.update(activeJob.issueId, { status: targetStatus }, activeJob.companyId);
    await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    return;
  }

  const transport = config.directTaskTransport || "windows-named-pipe";

  if (transport === "windows-named-pipe") {
    const pipeName = config.directPipeName || "PaperclipDirectTaskBroker";
    if (!pipeName || typeof pipeName !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(pipeName)) {
      ctx.logger.error("Finalizer failed: invalid pipe name config");
      return;
    }

    let response;
    try {
      response = await callNamedPipeBroker(pipeName, "status", undefined, activeJob.jobId);
    } catch (error) {
      if (error.isProtocolError) {
        const marker = `<!-- direct-task-bridge-marker: ${activeJob.jobId} - blocked -->`;
        const commentBody = `Direct Task Bridge execution failed: ${error.message}\n${marker}`;
        await ctx.issues.createComment(activeJob.issueId, commentBody, activeJob.companyId);
        await ctx.issues.update(activeJob.issueId, { status: "blocked" }, activeJob.companyId);
        await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
        return;
      }
      ctx.logger.warn("Polling Direct Task Bridge failed; will retry");
      return;
    }

    if (response.statusCode === 404) {
      const marker = `<!-- direct-task-bridge-marker: ${activeJob.jobId} - blocked -->`;
      const commentBody = `Direct Task job not found on Direct Task Bridge.\n${marker}`;
      await ctx.issues.createComment(activeJob.issueId, commentBody, activeJob.companyId);
      await ctx.issues.update(activeJob.issueId, { status: "blocked" }, activeJob.companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
      return;
    }

    if (!response.ok) {
      ctx.logger.warn(`Polling Direct Task Bridge failed with status ${response.statusCode}; will retry`);
      return;
    }

    let statusData = response.body;
    if (typeof statusData === "string") {
      try {
        statusData = JSON.parse(statusData);
      } catch (e) {
        // Ignored
      }
    }

    const isValidStatusData = statusData &&
      statusData.jobId === activeJob.jobId &&
      typeof statusData.status === "string" &&
      ["completed", "failed", "running", "pending", "queued"].includes(statusData.status);

    if (!isValidStatusData) {
      const marker = `<!-- direct-task-bridge-marker: ${activeJob.jobId} - blocked -->`;
      const commentBody = `Direct Task Bridge execution failed: Invalid status response received from bridge.\n${marker}`;
      await ctx.issues.createComment(activeJob.issueId, commentBody, activeJob.companyId);
      await ctx.issues.update(activeJob.issueId, { status: "blocked" }, activeJob.companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
      return;
    }

    const isCompleted = statusData.status === "completed";
    const isFailed = statusData.status === "failed";

    if (isCompleted || isFailed) {
      const isSuccess = isCompleted &&
        statusData.exitCode === 0 &&
        typeof statusData.closeSummary === "string" &&
        statusData.closeSummary.trim().startsWith("## Close Summary");

      const targetStatus = isSuccess ? "in_review" : "blocked";
      const marker = `<!-- direct-task-bridge-marker: ${activeJob.jobId} - ${targetStatus} -->`;

      let commentBody;
      if (isSuccess) {
        commentBody = statusData.closeSummary;
      } else {
        const errorMsg = statusData.error || "unknown error";
        const exitCodeInfo = statusData.exitCode !== null ? ` (exit code: ${statusData.exitCode})` : "";
        commentBody = `Direct Task Bridge execution failed${exitCodeInfo}.\nError: ${errorMsg}`;
        if (statusData.closeSummary) {
          commentBody += `\n\n${statusData.closeSummary}`;
        }
      }

      commentBody = commentBody.slice(0, 3900) + `\n${marker}`;

      await ctx.issues.createComment(activeJob.issueId, commentBody, activeJob.companyId);
      await ctx.issues.update(activeJob.issueId, { status: targetStatus }, activeJob.companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    } else {
      if (statusData.status !== activeJob.status) {
        activeJob.status = statusData.status;
        await ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJob);
      }
    }
  } else if (transport === "legacy-http-token") {
    // 2. Validate URL and resolve secret only after we confirm we must proceed to contact the bridge.
    let bridgeUrl;
    try {
      bridgeUrl = validateBridgeUrl(config.directBridgeUrl);
    } catch (error) {
      ctx.logger.error("Finalizer failed: invalid bridge URL config");
      return;
    }

    let bridgeSecret;
    try {
      const secretRef = config.directBridgeSecretRef;
      if (!secretRef || typeof secretRef !== "string" || secretRef.trim() === "") {
        throw new Error("directBridgeSecretRef must be a non-empty string.");
      }
      bridgeSecret = await ctx.secrets.resolve(secretRef);
    } catch (error) {
      ctx.logger.error("Finalizer failed: secret resolution failed");
      return;
    }
    if (!bridgeSecret) {
      ctx.logger.error("Finalizer failed: bridge secret is missing");
      return;
    }

    const statusUrl = new URL(`/direct-task/status/${activeJob.jobId}`, bridgeUrl);
    let response;
    try {
      response = await fetch(statusUrl.href, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${bridgeSecret}`
        }
      });
    } catch (error) {
      ctx.logger.warn("Polling Direct Task Bridge failed; will retry");
      return;
    }

    if (response.status === 404) {
      const marker = `<!-- direct-task-bridge-marker: ${activeJob.jobId} - blocked -->`;
      const commentBody = `Direct Task job not found on Direct Task Bridge.\n${marker}`;
      await ctx.issues.createComment(activeJob.issueId, commentBody, activeJob.companyId);
      await ctx.issues.update(activeJob.issueId, { status: "blocked" }, activeJob.companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
      return;
    }

    if (!response.ok) {
      ctx.logger.warn(`Polling Direct Task Bridge failed with status ${response.status}; will retry`);
      return;
    }

    let statusData;
    try {
      statusData = await response.json();
    } catch (error) {
      const marker = `<!-- direct-task-bridge-marker: ${activeJob.jobId} - blocked -->`;
      const commentBody = `Direct Task Bridge returned invalid JSON.\n${marker}`;
      await ctx.issues.createComment(activeJob.issueId, commentBody, activeJob.companyId);
      await ctx.issues.update(activeJob.issueId, { status: "blocked" }, activeJob.companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
      return;
    }

    const isValidStatusData = statusData &&
      statusData.jobId === activeJob.jobId &&
      typeof statusData.status === "string" &&
      ["completed", "failed", "running", "pending", "queued"].includes(statusData.status);

    if (!isValidStatusData) {
      const marker = `<!-- direct-task-bridge-marker: ${activeJob.jobId} - blocked -->`;
      const commentBody = `Direct Task Bridge execution failed: Invalid status response received from bridge.\n${marker}`;
      await ctx.issues.createComment(activeJob.issueId, commentBody, activeJob.companyId);
      await ctx.issues.update(activeJob.issueId, { status: "blocked" }, activeJob.companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
      return;
    }

    const isCompleted = statusData.status === "completed";
    const isFailed = statusData.status === "failed";

    if (isCompleted || isFailed) {
      const isSuccess = isCompleted &&
        statusData.exitCode === 0 &&
        typeof statusData.closeSummary === "string" &&
        statusData.closeSummary.trim().startsWith("## Close Summary");

      const targetStatus = isSuccess ? "in_review" : "blocked";
      const marker = `<!-- direct-task-bridge-marker: ${activeJob.jobId} - ${targetStatus} -->`;

      let commentBody;
      if (isSuccess) {
        commentBody = statusData.closeSummary;
      } else {
        const errorMsg = statusData.error || "unknown error";
        const exitCodeInfo = statusData.exitCode !== null ? ` (exit code: ${statusData.exitCode})` : "";
        commentBody = `Direct Task Bridge execution failed${exitCodeInfo}.\nError: ${errorMsg}`;
        if (statusData.closeSummary) {
          commentBody += `\n\n${statusData.closeSummary}`;
        }
      }

      commentBody = redactToken(commentBody, bridgeSecret);
      commentBody = commentBody.slice(0, 3900) + `\n${marker}`;

      await ctx.issues.createComment(activeJob.issueId, commentBody, activeJob.companyId);
      await ctx.issues.update(activeJob.issueId, { status: targetStatus }, activeJob.companyId);
      await ctx.state.delete({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    } else {
      if (statusData.status !== activeJob.status) {
        activeJob.status = statusData.status;
        await ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJob);
      }
    }
  } else {
    ctx.logger.error("Finalizer failed: unsupported Direct Task transport config");
    return;
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    pluginCtx = ctx;

    ctx.tools.register(
      "memory-search",
      toolDeclarations.get("memory-search"),
      safeTool(handleMemorySearch, ctx)
    );
    ctx.tools.register(
      "memory-propose",
      toolDeclarations.get("memory-propose"),
      safeTool(handleMemoryPropose, ctx)
    );
    ctx.data.register(
      "memory-view",
      safeDataHandler(handleMemoryView, ctx)
    );
    ctx.data.register(
      "project-memory-view",
      safeDataHandler(handleProjectMemoryView, ctx)
    );
    ctx.data.register(
      "project-memory-candidates-view",
      safeDataHandler(handleProjectMemoryCandidatesView, ctx)
    );
    ctx.data.register(
      "direct-task-preview",
      safeDataHandler(handleDirectTaskPreview, ctx)
    );
    ctx.data.register(
      "direct-task-agent-rooms",
      safeDataHandler(handleDirectTaskAgentRooms, ctx)
    );

    ctx.actions.register("direct-task-submit", async (params, actionCtx) => {
      const actor = actionCtx?.actor;
      if (
        !actor ||
        actor.type !== "user" ||
        typeof actor.userId !== "string" ||
        actor.userId.trim() === "" ||
        !actionCtx.companyId ||
        typeof actionCtx.companyId !== "string" ||
        actionCtx.companyId.trim() === ""
      ) {
        return {
          ok: false,
          code: "forbidden",
          message: "Forbidden: Actor must be a user with a valid company context."
        };
      }

      const companyId = actionCtx.companyId;

      const config = asRecord(await ctx.config.get());
      if (!config.enableDirectTaskLaunch) {
        return {
          ok: false,
          code: "direct_task_launch_disabled",
          message: "Direct Task Launch is disabled."
        };
      }

      const submitInput = {
        companyId,
        body: {
          companyId,
          projectId: stringParam(params, "projectId"),
          role: stringParam(params, "role"),
          title: stringParam(params, "title"),
          description: stringParam(params, "description"),
          uproject: stringParam(params, "uproject"),
          idempotencyKey: stringParam(params, "idempotencyKey"),
          parentId: stringParam(params, "parentId")
        }
      };

      try {
        const submitResult = await handleDirectTaskSubmit(ctx, submitInput);
        if (submitResult.status === 200 || submitResult.status === 201) {
          const body = submitResult.body;
          if (body && body.success) {
            const issue = await ctx.issues.get(body.issueId, companyId);
            return {
              ok: true,
              issueId: body.issueId,
              identifier: issue ? issue.identifier : body.issueId,
              jobId: body.jobId,
              status: body.status,
              taskHref: null
            };
          }
        }
        const errBody = submitResult.body || {};
        return {
          ok: false,
          code: errBody.error || "bridge_dispatch_failed",
          message: errBody.message || "Failed to dispatch job to Direct Task Bridge."
        };
      } catch (error) {
        ctx.logger.error("Direct Task submit action failed due to an internal error.");
        return {
          ok: false,
          code: "internal_server_error",
          message: "An internal server error occurred."
        };
      }
    });

    ctx.jobs.register("direct-task-finalizer", async (job) => {
      try {
        await handleDirectTaskFinalizer(ctx, job);
      } catch (error) {
        ctx.logger.error("Direct Task Finalizer job failed due to an internal error.", {
          runId: job.runId
        });
      }
    });

    // Guarded post-run candidate extraction boundary
    if (ctx.manifest.capabilities.includes("events.subscribe")) {
      ctx.events.on("agent.run.finished", async (event) => {
        const config = asRecord(await ctx.config.get());
        const enabled = !!config.enableManagedCandidateExtraction;
        const expectedCompanyId = String(config.managedCandidateCompanyId || "").trim();

        if (!enabled || !expectedCompanyId || expectedCompanyId !== event.companyId) {
          ctx.logger.info("Managed candidate extraction skipped: disabled or company mismatch", {
            enabled,
            expectedCompanyId,
            eventCompanyId: event.companyId
          });
          return;
        }

        const { runId, issueId, agentId } = event.payload || {};
        await extractAndProposeCandidates(ctx, event.companyId, issueId || event.entityId, runId, agentId);
      });
    }
  },
  async onApiRequest(input) {
    if (input.routeKey === "direct-tasks-submit") {
      try {
        return await handleDirectTaskSubmit(pluginCtx, input);
      } catch (error) {
        if (pluginCtx) {
          pluginCtx.logger.error("Direct Task submit API failed due to an internal error.");
        }
        return {
          status: 500,
          body: { error: "internal_server_error", message: "An internal server error occurred." }
        };
      }
    }
    return {
      status: 404,
      body: { error: "not_found", message: "API route not found." }
    };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
