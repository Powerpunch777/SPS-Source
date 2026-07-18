import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG_PATH = path.join(__dirname, "config.local.json");
const MAX_BODY_BYTES = 1024 * 1024;

let appendQueue = Promise.resolve();

function findArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function corsHeaders(req, config) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-sidecar-token",
    "vary": "Origin"
  };
  const origin = req.headers.origin;
  if (!origin) return headers;
  if ((config.security.allowedOrigins ?? []).includes(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

function isAllowedOrigin(req, config) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return (config.security.allowedOrigins ?? []).includes(origin);
}

function isAuthorized(req, config) {
  if (!config.security.token) return true;
  return req.headers["x-sidecar-token"] === config.security.token;
}

function jsonResponse(req, res, config, status, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, corsHeaders(req, config));
  res.end(data);
}

function notFound(req, res, config) {
  jsonResponse(req, res, config, 404, { error: "not_found" });
}

function stableId(...parts) {
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase();
}

function tokenize(value) {
  return normalizeText(value).match(/[\p{L}\p{N}_-]+/gu) ?? [];
}

function splitScopes(value) {
  if (!value) return null;
  const scopes = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return scopes.length > 0 ? new Set(scopes) : null;
}

function clampLimit(value, fallback = 10) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 50));
}

function clampOffset(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function resolveMaybeRelative(baseDir, value) {
  if (!value) return value;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseDir, value);
}

async function loadConfig() {
  const configPath = path.resolve(
    findArgValue("--config") ?? process.env.MEMORY_SIDECAR_CONFIG ?? DEFAULT_CONFIG_PATH
  );
  const configDir = path.dirname(configPath);
  const config = await readJson(configPath);
  const server = {
    host: config.server?.host ?? "127.0.0.1",
    port: Number(config.server?.port ?? 3188)
  };
  const dataDir = resolveMaybeRelative(configDir, config.dataDir ?? "./data");
  const security = {
    allowedOrigins: config.security?.allowedOrigins ?? [],
    token: process.env.MEMORY_SIDECAR_TOKEN || config.security?.token || null
  };
  const journals = (config.journals ?? []).map((journal) => ({
    ...journal,
    path: resolveMaybeRelative(configDir, journal.path)
  }));
  return { configPath, configDir, server, security, dataDir, journals };
}

function parseLearningJournal(raw, journal) {
  const items = [];
  const warnings = [];
  const lines = raw.split(/\r?\n/);
  let section = "Uncategorized";
  const headingStack = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);

    if (heading) {
      const level = heading[1].length;
      headingStack[level - 1] = heading[2].trim();
      headingStack.length = level;
      section = heading[2].trim();
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\s*:\s*(.+?)\s*$/);
    if (bullet) {
      const date = bullet[1];
      const text = bullet[2];
      const id = stableId(journal.id, date, text);
      items.push({
        id,
        status: "approved",
        scope: journal.scope ?? "unknown",
        journalId: journal.id,
        journalName: journal.name ?? journal.id,
        role: journal.role ?? null,
        agentId: journal.agentId ?? null,
        companyId: journal.companyId ?? null,
        projectId: journal.projectId ?? null,
        date,
        type: "learning",
        section,
        headingPath: headingStack.filter(Boolean),
        text,
        tags: [journal.scope, journal.role, section].filter(Boolean),
        provenance: {
          sourceType: "learning_journal",
          path: journal.path,
          lineStart: lineNumber,
          lineEnd: lineNumber
        }
      });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) && /\d{4}-\d{2}-\d{2}/.test(line)) {
      warnings.push({
        journalId: journal.id,
        path: journal.path,
        line: lineNumber,
        message: "Bullet looks dated but does not match '- YYYY-MM-DD: text'.",
        text: line.trim()
      });
    }
  }

  return { items, warnings };
}

async function loadApprovedMemory(config) {
  const allItems = [];
  const allWarnings = [];

  for (const journal of config.journals) {
    try {
      const raw = await fs.readFile(journal.path, "utf8");
      const { items, warnings } = parseLearningJournal(raw, journal);
      allItems.push(...items);
      allWarnings.push(...warnings);
    } catch (error) {
      allWarnings.push({
        journalId: journal.id,
        path: journal.path,
        message: `Could not read journal: ${error.message}`
      });
    }
  }

  return { items: allItems, warnings: allWarnings };
}

function searchItems(items, query, scopeFilter, limit) {
  const tokens = tokenize(query);
  const normalizedQuery = normalizeText(query);

  return items
    .filter((item) => !scopeFilter || scopeFilter.has(item.scope))
    .map((item) => {
      const haystack = normalizeText([
        item.scope,
        item.role,
        item.section,
        item.headingPath?.join(" "),
        item.text,
        item.tags?.join(" ")
      ].join(" "));
      let score = 0;

      if (!normalizedQuery) {
        score = 1;
      } else {
        if (haystack.includes(normalizedQuery)) score += 5;
        for (const token of tokens) {
          if (haystack.includes(token)) score += 1;
        }
      }

      return { item, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date))
    .slice(0, limit)
    .map(({ item, score }) => ({ ...item, score }));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readCandidates(config) {
  const filePath = path.join(config.dataDir, "memory-candidates.jsonl");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const candidates = [];
    const warnings = [];
    raw
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line, index) => {
        try {
          candidates.push(JSON.parse(line));
        } catch (error) {
          warnings.push({
            line: index + 1,
            message: `Could not parse candidate JSONL line: ${error.message}`
          });
        }
      });
    return { candidates, warnings };
  } catch (error) {
    if (error.code === "ENOENT") return { candidates: [], warnings: [] };
    throw error;
  }
}

async function appendCandidate(config, candidate) {
  const filePath = path.join(config.dataDir, "memory-candidates.jsonl");
  let result;
  appendQueue = appendQueue.catch(() => undefined).then(async () => {
    const { candidates } = await readCandidates(config);
    const existing = candidate.idempotencyKey
      ? candidates.find((item) => item.idempotencyKey === candidate.idempotencyKey)
      : null;

    if (existing) {
      result = { candidate: existing, created: false };
      return;
    }

    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(candidate)}\n`, "utf8");
    result = { candidate, created: true };
  });
  await appendQueue;
  return result;
}

function normalizeIdempotencyKey(value) {
  const key = String(value ?? "").trim();
  if (!key) return null;
  if (key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) return null;
  return key;
}

function validateCandidate(input) {
  if (!input || typeof input !== "object") {
    return "Expected a JSON object.";
  }
  if (!String(input.content ?? "").trim()) {
    return "Candidate content is required.";
  }
  const allowedScopes = new Set(["company", "project", "agent", "task", "artifact", "user"]);
  if (input.scope && !allowedScopes.has(input.scope)) {
    return `Invalid scope '${input.scope}'.`;
  }
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null && String(input.idempotencyKey).trim() !== "" && !normalizeIdempotencyKey(input.idempotencyKey)) {
    return "idempotencyKey must contain at most 128 letters, digits, dots, underscores, colons, or hyphens.";
  }
  return null;
}

function buildCandidate(input) {
  const now = new Date().toISOString();
  const content = String(input.content).trim();
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const id = idempotencyKey
    ? `cand_${idempotencyKey}`
    : `cand_${stableId(now, content, JSON.stringify(input.source ?? {}))}`;
  return {
    id,
    status: "candidate",
    createdAt: now,
    scope: input.scope ?? "project",
    type: input.type ?? "learning",
    content,
    idempotencyKey,
    source: input.source ?? null,
    agentId: input.agentId ?? null,
    issueId: input.issueId ?? null,
    companyId: input.companyId ?? null,
    projectId: input.projectId ?? null,
    tags: Array.isArray(input.tags) ? input.tags.map(String) : []
  };
}

async function handleRequest(req, res, config) {
  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(req, config)) {
      jsonResponse(req, res, config, 403, { error: "origin_not_allowed" });
      return;
    }
    jsonResponse(req, res, config, 204, {});
    return;
  }

  const url = new URL(req.url ?? "/", `http://${config.server.host}:${config.server.port}`);

  if (!isAllowedOrigin(req, config)) {
    jsonResponse(req, res, config, 403, { error: "origin_not_allowed" });
    return;
  }

  if (!isAuthorized(req, config)) {
    jsonResponse(req, res, config, 401, { error: "unauthorized" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    const { items, warnings } = await loadApprovedMemory(config);
    const { candidates, warnings: candidateWarnings } = await readCandidates(config);
    jsonResponse(req, res, config, 200, {
      ok: true,
      service: "paperclip-memory-sidecar",
      approvedMemoryCount: items.length,
      candidateCount: candidates.length,
      warningCount: warnings.length + candidateWarnings.length,
      configPath: config.configPath
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/memory/items") {
    const includeWarnings = url.searchParams.get("includeWarnings") === "true";
    const scopeFilter = splitScopes(url.searchParams.get("scope"));
    const companyIdFilter = url.searchParams.get("companyId");
    const projectIdFilter = url.searchParams.get("projectId");
    const agentIdFilter = url.searchParams.get("agentId");

    const { items, warnings } = await loadApprovedMemory(config);
    const filtered = items.filter((item) => {
      if (scopeFilter && !scopeFilter.has(item.scope)) return false;
      if (companyIdFilter !== null && item.companyId !== companyIdFilter) return false;
      if (projectIdFilter !== null && item.projectId !== projectIdFilter) return false;
      if (agentIdFilter !== null && item.agentId !== agentIdFilter) return false;
      return true;
    });

    jsonResponse(req, res, config, 200, {
      items: filtered,
      warnings: includeWarnings ? warnings : undefined
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/memory/search") {
    const query = url.searchParams.get("q") ?? "";
    const scopeFilter = splitScopes(url.searchParams.get("scope"));
    const companyIdFilter = url.searchParams.get("companyId");
    const projectIdFilter = url.searchParams.get("projectId");
    const agentIdFilter = url.searchParams.get("agentId");
    const limit = clampLimit(url.searchParams.get("limit"), 10);

    const { items, warnings } = await loadApprovedMemory(config);
    const filteredItems = items.filter((item) => {
      if (companyIdFilter !== null && item.companyId !== companyIdFilter) return false;
      if (projectIdFilter !== null && item.projectId !== projectIdFilter) return false;
      if (agentIdFilter !== null && item.agentId !== agentIdFilter) return false;
      return true;
    });

    jsonResponse(req, res, config, 200, {
      query,
      items: searchItems(filteredItems, query, scopeFilter, limit),
      warningCount: warnings.length
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/memory/candidates") {
    const limit = clampLimit(url.searchParams.get("limit"), 50);
    const offset = clampOffset(url.searchParams.get("offset"));
    const companyIdFilter = url.searchParams.get("companyId");
    const issueIdFilter = url.searchParams.get("issueId");
    const projectIdFilter = url.searchParams.get("projectId");
    const agentIdFilter = url.searchParams.get("agentId");

    const { candidates, warnings } = await readCandidates(config);
    const filtered = candidates.filter((cand) => {
      if (companyIdFilter !== null && cand.companyId !== companyIdFilter) return false;
      if (issueIdFilter !== null && cand.issueId !== issueIdFilter) return false;
      if (projectIdFilter !== null && cand.projectId !== projectIdFilter) return false;
      if (agentIdFilter !== null && cand.agentId !== agentIdFilter) return false;
      return true;
    });

    jsonResponse(req, res, config, 200, {
      candidates: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
      warnings
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/memory/candidates") {
    const body = await readBody(req);
    const input = JSON.parse(body || "{}");
    const validationError = validateCandidate(input);
    if (validationError) {
      jsonResponse(req, res, config, 400, { error: "invalid_candidate", message: validationError });
      return;
    }
    const candidate = buildCandidate(input);
    const result = await appendCandidate(config, candidate);
    jsonResponse(req, res, config, result.created ? 201 : 200, { candidate: result.candidate });
    return;
  }

  notFound(req, res, config);
}

async function main() {
  const initialConfig = await loadConfig();
  const server = http.createServer((req, res) => {
    loadConfig().then((config) => handleRequest(req, res, config)).catch((error) => {
      jsonResponse(req, res, initialConfig, 500, {
        error: "internal_error",
        message: error.message
      });
    });
  });

  server.listen(initialConfig.server.port, initialConfig.server.host, () => {
    console.log(
      `paperclip-memory-sidecar listening on http://${initialConfig.server.host}:${initialConfig.server.port}`
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
