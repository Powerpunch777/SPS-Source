import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_DIRECTORY = path.resolve(process.env.DIRECT_TASK_BRIDGE_STATE_DIR || __dirname);
const JOBS_FILE = path.join(STATE_DIRECTORY, "jobs.json");
const AUDIT_LOG_FILE = path.join(STATE_DIRECTORY, "audit.log");
const RESULT_DIRECTORY = path.join(STATE_DIRECTORY, "job-results");
const RESULT_CONTRACT_VERSION = 1;
const MAX_STATUS_SUMMARY_CHARS = 8000;

let config = {
  enabled: false,
  server: {
    host: "127.0.0.1",
    port: 3105
  },
  security: {
    bridgeSecret: ""
  },
  projectWorkspaceMappings: {},
  jobTimeoutMs: 300000
};

let jobs = {};
const runningProcesses = new Map();

const ROLE_BOUNDARIES = {
  "unreal-code": "Uses the validated Unreal workspace and defaults to read-only inspection; requested edits are governed by the explicit Task Room scope.",
  "unreal-qa": "Defaults to inspect and report only. It must not edit gameplay code, Blueprints, assets, settings, build, package, launch the editor, run destructive commands, or run a test command unless the Task Room explicitly authorizes that exact action."
};

function isWeakSecret(secret) {
  if (!secret || typeof secret !== "string") return true;
  const val = secret.trim();
  if (val.length < 32) return true;
  const lower = val.toLowerCase();
  if (
    lower.includes("change-this") ||
    lower.includes("example") ||
    lower.includes("placeholder") ||
    lower.includes("secret") ||
    lower.includes("password")
  ) {
    return true;
  }
  return false;
}

function getBridgeSecret() {
  const runtimeSecret = process.env.DIRECT_TASK_BRIDGE_SECRET;
  if (typeof runtimeSecret === "string" && runtimeSecret.trim() !== "") {
    return runtimeSecret.trim();
  }
  return config.security?.bridgeSecret || "";
}

async function loadConfig() {
  const runtimeConfigPath = process.env.DIRECT_TASK_BRIDGE_CONFIG_PATH;
  const localPath = runtimeConfigPath
    ? path.resolve(runtimeConfigPath)
    : path.join(__dirname, "config.local.json");
  const examplePath = path.join(__dirname, "config.example.json");
  
  try {
    const raw = await fs.readFile(localPath, "utf8");
    config = { ...config, ...JSON.parse(raw) };
  } catch (err) {
    if (runtimeConfigPath) {
      throw err;
    }
    if (err.code !== "ENOENT") {
      console.error("Error reading config.local.json:", err);
    }
    try {
      const raw = await fs.readFile(examplePath, "utf8");
      config = { ...config, ...JSON.parse(raw) };
    } catch (exErr) {
      if (exErr.code !== "ENOENT") {
        console.error("Error reading config.example.json:", exErr);
      }
    }
  }

  // Enforce auditLogPath is removed and host is strictly 127.0.0.1
  if (config.auditLogPath !== undefined) {
    delete config.auditLogPath;
  }

  if (config.server && config.server.host !== "127.0.0.1") {
    throw new Error(`Invalid host configuration: ${config.server.host}. Host must be strict 127.0.0.1`);
  }
}

async function loadJobs() {
  try {
    const content = await fs.readFile(JOBS_FILE, "utf8");
    jobs = JSON.parse(content);
    
    // Fail closed on restart: transition any "running" or "pending" jobs to "failed"
    let mutated = false;
    for (const jobId in jobs) {
      if (jobs[jobId].status === "running" || jobs[jobId].status === "pending") {
        jobs[jobId].status = "failed";
        jobs[jobId].error = "Job aborted due to service restart";
        jobs[jobId].exitCode = -1;
        mutated = true;
      }
    }
    if (mutated) {
      await saveJobs();
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Failed to load jobs database:", err);
    }
    jobs = {};
  }
}

async function saveJobs() {
  try {
    await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save jobs database:", err);
  }
}

async function writeAuditEvent(eventData) {
  const logLine = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...eventData
  }) + "\n";
  try {
    await fs.appendFile(AUDIT_LOG_FILE, logLine, "utf8");
  } catch (err) {
    console.error("Failed to write audit event:", err);
  }
}

function sanitizePaths(text) {
  if (!text) return "";
  let sanitized = text;
  
  // 1. Sanitize bridge token/secret
  const bridgeSecret = getBridgeSecret();
  if (bridgeSecret) {
    const escapedSecret = bridgeSecret.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(escapedSecret, 'g'), "<redacted-token>");
  }
  
  // 2. Sanitize mapped workspaces and general paths (both Windows and Unix style)
  for (const wsPath of Object.values(config.projectWorkspaceMappings || {})) {
    if (wsPath) {
      const escaped = wsPath.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      sanitized = sanitized.replace(regex, "<workspace>");
    }
  }
  // Match Windows drive paths like C:\foo\bar or \\server\share
  sanitized = sanitized.replace(/[a-zA-Z]:\\[a-zA-Z0-9_\-\\\s\.]+/g, "<path>");
  // Match Unix-like absolute paths
  sanitized = sanitized.replace(/\/[\w\-\.\/]+/g, (match) => {
    if (match.includes('/') && match.length > 3) {
      return "<path>";
    }
    return match;
  });
  
  // 3. Sanitize prompts
  sanitized = sanitized.replace(/PS\s+[^>]+>/g, "PS >");
  sanitized = sanitized.replace(/[a-zA-Z]:\\[^>]*>/g, ">");
  
  // 4. Sanitize environment variables values
  const envKeys = ["path", "username", "user", "temp", "tmp", "appdata", "localappdata", "homepath", "userprofile", "computername", "os", "windir", "comspec", "pathext", "programfiles", "systemroot"];
  for (const key of envKeys) {
    const val = process.env[key.toUpperCase()] || process.env[key];
    if (val && val.length > 2) {
      const escapedVal = val.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      sanitized = sanitized.replace(new RegExp(escapedVal, 'gi'), `<env-${key}>`);
    }
  }
  
  // Sanitize common env var names at the start of a line
  sanitized = sanitized.replace(/^(Path|PATH|USER|USERNAME|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|OS|COMPUTERNAME|SystemRoot|windir|PSExecutionPolicyPreference|NODE_ENV|ComSpec)=.*/gim, "<env-var>");
  
  return sanitized;
}

function extractCloseSummary(output) {
  if (!output) return "";
  const index = output.indexOf("## Close Summary");
  let summary = index === -1 ? output : output.slice(index);
  
  const MAX_SUMMARY_LENGTH = 8000;
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, MAX_SUMMARY_LENGTH) + "\n[Close Summary truncated due to size limit]";
  }
  return summary;
}

function limitStatusSummary(value) {
  const summary = String(value ?? "");
  if (summary.length <= MAX_STATUS_SUMMARY_CHARS) {
    return summary;
  }
  return `${summary.slice(0, MAX_STATUS_SUMMARY_CHARS)}\n[Close Summary truncated by Direct Task Bridge]`;
}

function resultPathForJob(jobId) {
  if (!/^job-[a-f0-9]{32}$/.test(jobId)) {
    throw new Error("invalid_bridge_job_id");
  }
  return path.join(RESULT_DIRECTORY, `${jobId}.json`);
}

async function readStructuredResult(resultPath, expectedIssueId) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(resultPath, "utf8"));
  } catch (error) {
    return { valid: false, error: error?.code === "ENOENT" ? "bridge_result_missing" : "bridge_result_malformed" };
  }

  if (!parsed || typeof parsed !== "object" || parsed.contractVersion !== RESULT_CONTRACT_VERSION) {
    return { valid: false, error: "bridge_result_contract_invalid" };
  }
  if (parsed.issueId !== expectedIssueId) {
    return { valid: false, error: "bridge_result_issue_mismatch" };
  }
  if (!Number.isInteger(parsed.exitCode) || !["completed", "failed"].includes(parsed.status)) {
    return { valid: false, error: "bridge_result_status_invalid" };
  }
  if (typeof parsed.closeSummary !== "string") {
    return { valid: false, error: "bridge_result_summary_invalid" };
  }
  if (parsed.status === "completed" && (parsed.exitCode !== 0 || !parsed.closeSummary.startsWith("## Close Summary"))) {
    return { valid: false, error: "bridge_result_exit_inconsistent" };
  }

  return {
    valid: true,
    result: {
      status: parsed.status,
      exitCode: parsed.exitCode,
      closeSummary: limitStatusSummary(parsed.closeSummary),
      errorCode: typeof parsed.errorCode === "string" ? parsed.errorCode : null
    }
  };
}

async function finalizeJobFromResult(jobId, processExitCode = 0) {
  const job = jobs[jobId];
  if (!job || job.timedOut) return;

  if (processExitCode !== 0) {
    job.status = "failed";
    job.exitCode = processExitCode;
    job.error = "bridge_process_exit_nonzero";
    job.endTime = new Date().toISOString();
    await saveJobs();
    await writeAuditEvent({ event: "job_result_rejected", jobId, error: job.error });
    return;
  }

  const contract = await readStructuredResult(job.resultPath, job.issueId);
  job.endTime = new Date().toISOString();
  if (!contract.valid) {
    job.status = "failed";
    job.exitCode = -1;
    job.error = contract.error;
    await saveJobs();
    await writeAuditEvent({ event: "job_result_rejected", jobId, error: contract.error });
    return;
  }

  job.status = contract.result.status;
  job.exitCode = contract.result.exitCode;
  job.closeSummary = contract.result.closeSummary;
  job.error = contract.result.errorCode;
  await saveJobs();
  await writeAuditEvent({ event: "job_result_recorded", jobId, status: job.status, exitCode: job.exitCode });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100 * 1024) { // 100KB limit
        reject(new Error("oversized"));
      }
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body));
}

async function validatePayload(body) {
  const { role, companyId, projectId, issueId, title, description, projectFile } = body;
  
  if (!role || (role !== "unreal-code" && role !== "unreal-qa")) {
    return { valid: false, error: "invalid_role" };
  }
  if (!companyId || typeof companyId !== "string" || companyId.trim() === "") {
    return { valid: false, error: "invalid_company_id" };
  }
  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    return { valid: false, error: "invalid_project_id" };
  }
  if (!issueId || typeof issueId !== "string" || issueId.trim() === "") {
    return { valid: false, error: "invalid_issue_id" };
  }
  if (!title || typeof title !== "string" || title.trim() === "" || title.length > 200) {
    return { valid: false, error: "invalid_title" };
  }
  if (!description || typeof description !== "string" || description.trim() === "" || description.length > 4000) {
    return { valid: false, error: "invalid_description" };
  }
  
  const workspacePath = config.projectWorkspaceMappings?.[projectId];
  if (!workspacePath) {
    return { valid: false, error: "project_not_mapped" };
  }

  // Filesystem validation (non-spawning)
  try {
    const stat = await fs.stat(workspacePath);
    if (!stat.isDirectory()) {
      return { valid: false, error: "workspace_not_directory" };
    }
  } catch (err) {
    return { valid: false, error: "workspace_missing" };
  }

  let files = [];
  try {
    files = await fs.readdir(workspacePath);
  } catch (err) {
    return { valid: false, error: "workspace_read_failed" };
  }
  const uprojectFiles = files.filter(f => f.endsWith(".uproject"));
  
  if (projectFile !== undefined && projectFile !== null && projectFile !== "") {
    if (typeof projectFile !== "string") {
      return { valid: false, error: "invalid_project_file" };
    }
    if (projectFile.includes("/") || projectFile.includes("\\") || projectFile.includes("..") || !projectFile.endsWith(".uproject")) {
      return { valid: false, error: "invalid_project_file" };
    }
    const targetPath = path.join(workspacePath, projectFile);
    try {
      const fileStat = await fs.stat(targetPath);
      if (!fileStat.isFile()) {
        return { valid: false, error: "project_file_not_found" };
      }
    } catch (err) {
      return { valid: false, error: "project_file_not_found" };
    }
  } else {
    if (uprojectFiles.length === 0) {
      return { valid: false, error: "missing_uproject" };
    }
    if (uprojectFiles.length > 1) {
      return { valid: false, error: "ambiguous_uproject" };
    }
  }
  
  return { valid: true, workspacePath };
}

function hasActiveJob() {
  return Object.values(jobs).some((j) => j.status === "running" || j.status === "pending");
}

function findJobByIdempotencyKey(key) {
  return Object.values(jobs).find((j) => j.idempotencyKey === key);
}

function runJob(jobId, args, resultPath) {
  jobs[jobId].status = "running";
  jobs[jobId].startTime = new Date().toISOString();
  saveJobs();

  writeAuditEvent({ event: "job_started", jobId, args: args.map(a => (a.includes(' ') ? `"${a}"` : a)) });

  if (config.mockExecution) {
    const duration = config.mockDurationMs || 100;
    const timeoutId = setTimeout(async () => {
      if (!jobs[jobId]) return;

      try {
        await fs.mkdir(RESULT_DIRECTORY, { recursive: true });
        const mode = config.mockResultMode || "success";
        if (mode === "malformed") {
          await fs.writeFile(resultPath, "{not-json", "utf8");
        } else if (mode !== "missing") {
          const workerFailed = mode === "failed";
          const issueId = mode === "mismatch" ? "unexpected-issue" : jobs[jobId].issueId;
          const result = {
            contractVersion: RESULT_CONTRACT_VERSION,
            issueId,
            identifier: "CMP-MOCK",
            status: workerFailed ? "failed" : "completed",
            exitCode: workerFailed ? 7 : 0,
            closeSummary: workerFailed
              ? "## Close Summary\n\nResult: Mock worker failure."
              : "## Close Summary\n\nGoal: Mock Goal\n\nResult: Mock Result\n\nMemory Candidates:\n\nFollow-up Tasks:\n",
            errorCode: workerFailed ? "worker_exit_nonzero" : null
          };
          await fs.writeFile(resultPath, JSON.stringify(result), "utf8");
        }

        await finalizeJobFromResult(jobId, 0);
      } catch (error) {
        jobs[jobId].status = "failed";
        jobs[jobId].exitCode = -1;
        jobs[jobId].error = "bridge_mock_result_write_failed";
        jobs[jobId].endTime = new Date().toISOString();
        await saveJobs();
        await writeAuditEvent({ event: "job_mock_error", jobId, error: String(error?.message || error) });
      }
    }, duration);
    
    runningProcesses.set(jobId, {
      kill: () => {
        clearTimeout(timeoutId);
        if (!jobs[jobId]) return;
        jobs[jobId].status = "failed";
        jobs[jobId].error = "Job aborted by user/kill";
        jobs[jobId].exitCode = -1;
        saveJobs();
      }
    });
    return;
  }

  const psExe = config.powershellExecutable || "powershell.exe";
  let processCompleted = false;
  let stdoutData = "";
  let stderrData = "";

  const childEnvironment = { ...process.env };
  delete childEnvironment.DIRECT_TASK_BRIDGE_SECRET;
  delete childEnvironment.DIRECT_TASK_BRIDGE_CONFIG_PATH;
  delete childEnvironment.DIRECT_TASK_BRIDGE_STATE_DIR;

  const child = spawn(psExe, args, {
    shell: false,
    env: childEnvironment
  });

  runningProcesses.set(jobId, child);

  const timeoutMs = config.jobTimeoutMs || 300000;
  const timeoutId = setTimeout(() => {
    if (!processCompleted) {
      child.kill("SIGKILL");
      if (jobs[jobId]) {
        jobs[jobId].timedOut = true;
        jobs[jobId].status = "failed";
        jobs[jobId].error = `Job timed out after ${timeoutMs}ms`;
        jobs[jobId].exitCode = -1;
        jobs[jobId].endTime = new Date().toISOString();
        saveJobs();
      }
      writeAuditEvent({ event: "job_timeout", jobId, timeoutMs });
    }
  }, timeoutMs);

  const MAX_CAPTURE_BYTES = 100 * 1024;
  let stdoutTruncated = false;
  let stderrTruncated = false;

  child.stdout.on("data", (data) => {
    if (stdoutData.length >= MAX_CAPTURE_BYTES) {
      if (!stdoutTruncated) {
        stdoutTruncated = true;
        stdoutData += "\n[stdout truncated due to size limit]";
      }
      return;
    }
    stdoutData += data.toString();
    if (stdoutData.length > MAX_CAPTURE_BYTES) {
      stdoutData = stdoutData.slice(0, MAX_CAPTURE_BYTES) + "\n[stdout truncated due to size limit]";
      stdoutTruncated = true;
    }
  });

  child.stderr.on("data", (data) => {
    if (stderrData.length >= MAX_CAPTURE_BYTES) {
      if (!stderrTruncated) {
        stderrTruncated = true;
        stderrData += "\n[stderr truncated due to size limit]";
      }
      return;
    }
    stderrData += data.toString();
    if (stderrData.length > MAX_CAPTURE_BYTES) {
      stderrData = stderrData.slice(0, MAX_CAPTURE_BYTES) + "\n[stderr truncated due to size limit]";
      stderrTruncated = true;
    }
  });

  child.on("close", async (code) => {
    processCompleted = true;
    clearTimeout(timeoutId);
    runningProcesses.delete(jobId);

    await finalizeJobFromResult(jobId, code ?? -1);
    await writeAuditEvent({ event: "job_finished", jobId, exitCode: code ?? -1 });
  });

  child.on("error", (err) => {
    processCompleted = true;
    clearTimeout(timeoutId);
    runningProcesses.delete(jobId);

    if (jobs[jobId]) {
      jobs[jobId].status = "failed";
      jobs[jobId].error = `Failed to spawn process: ${err.message}`;
      jobs[jobId].exitCode = -1;
      jobs[jobId].endTime = new Date().toISOString();
      saveJobs();
    }
    
    writeAuditEvent({ event: "job_error", jobId, error: err.message });
  });
}

async function requestListener(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (!config.enabled) {
    return jsonResponse(res, 403, { error: "bridge_disabled" });
  }

  const secret = getBridgeSecret();
  if (!secret) {
    return jsonResponse(res, 401, { error: "bridge_secret_not_configured" });
  }

  if (isWeakSecret(secret)) {
    return jsonResponse(res, 401, { error: "bridge_secret_too_weak" });
  }

  const reqToken = req.headers["x-direct-bridge-token"] || req.headers["x-bridge-token"] || (req.headers["authorization"]?.startsWith("Bearer ") ? req.headers["authorization"].slice(7) : null);
  if (reqToken !== secret) {
    return jsonResponse(res, 401, { error: "unauthorized" });
  }

  try {
    if (method === "POST" && pathname === "/direct-task/preview") {
      const bodyText = await readBody(req);
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return jsonResponse(res, 400, { error: "malformed_json" });
      }

      const validation = await validatePayload(body);
      if (!validation.valid) {
        return jsonResponse(res, 400, { error: validation.error });
      }

      return jsonResponse(res, 200, {
        role: body.role,
        projectId: body.projectId,
        roleBoundary: ROLE_BOUNDARIES[body.role]
      });
    }

    if (method === "POST" && pathname === "/direct-task/submit") {
      const bodyText = await readBody(req);
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return jsonResponse(res, 400, { error: "malformed_json" });
      }

      const { idempotencyKey } = body;
      if (!idempotencyKey || typeof idempotencyKey !== "string") {
        return jsonResponse(res, 400, { error: "invalid_idempotency_key_type" });
      }
      if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        return jsonResponse(res, 400, { error: "invalid_idempotency_key_length" });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)) {
        return jsonResponse(res, 400, { error: "invalid_idempotency_key_format" });
      }

      const validation = await validatePayload(body);
      if (!validation.valid) {
        return jsonResponse(res, 400, { error: validation.error });
      }

      const existingJob = findJobByIdempotencyKey(idempotencyKey);
      if (existingJob) {
        return jsonResponse(res, 200, {
          jobId: existingJob.jobId,
          status: existingJob.status
        });
      }

      if (hasActiveJob()) {
        return jsonResponse(res, 409, { error: "concurrency_limit_exceeded" });
      }

      // Generate jobId server-side only. Do not use body.jobId.
      const jobId = `job-${crypto.randomBytes(16).toString("hex")}`;
      const resultPath = resultPathForJob(jobId);
      try {
        await fs.mkdir(RESULT_DIRECTORY, { recursive: true });
      } catch {
        return jsonResponse(res, 500, { error: "bridge_result_directory_unavailable" });
      }

      jobs[jobId] = {
        jobId,
        idempotencyKey,
        status: "pending",
        role: body.role,
        projectId: body.projectId,
        issueId: body.issueId,
        projectFile: body.projectFile || null,
        resultPath,
        closeSummary: "",
        error: null,
        exitCode: null,
        createdAt: new Date().toISOString()
      };
      await saveJobs();

      const workplaneRoot = path.dirname(__dirname);
      const scriptPath = path.join(workplaneRoot, "scripts", "Invoke-AgyDirectTask.ps1");

      const args = [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-IssueId",
        body.issueId,
        "-WorkspacePath",
        validation.workspacePath,
        "-NoPost",
        "-Unreal",
        "-ProposeCandidates",
        "-ResultPath",
        resultPath
      ];
      if (body.role === "unreal-qa") {
        args.push("-QA");
      }
      if (body.projectFile) {
        const resolvedProjectFile = path.resolve(validation.workspacePath, body.projectFile);
        args.push("-ProjectFile", resolvedProjectFile);
      }

      runJob(jobId, args, resultPath);

      return jsonResponse(res, 201, {
        jobId,
        status: "running"
      });
    }

    if (method === "GET") {
      const match = pathname.match(/^\/direct-task\/status\/([a-zA-Z0-9_-]+)$/);
      if (match) {
        const jobId = match[1];
        const job = jobs[jobId];
        if (!job) {
          return jsonResponse(res, 404, { error: "job_not_found" });
        }

        return jsonResponse(res, 200, {
          jobId: job.jobId,
          status: job.status,
          exitCode: job.exitCode,
          error: sanitizePaths(job.error),
          closeSummary: sanitizePaths(job.closeSummary)
        });
      }
    }

    return jsonResponse(res, 404, { error: "not_found" });
  } catch (err) {
    if (err.message === "oversized") {
      return jsonResponse(res, 413, { error: "payload_too_large" });
    }
    console.error("Server error handling request:", err);
    return jsonResponse(res, 500, { error: "internal_server_error" });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  (async () => {
    try {
      await loadConfig();
    } catch (err) {
      console.error("Failed to load config:", err.message);
      process.exit(1);
    }
    
    // Hardening check on startup
    if (!config.enabled) {
      console.error("Bridge is disabled in configuration.");
      process.exit(1);
    }
    const secret = getBridgeSecret();
    if (!secret || isWeakSecret(secret)) {
      console.error("Bridge cannot start: No secure secret configured, or secret is too weak.");
      process.exit(1);
    }
    
    await loadJobs();
    
    const port = config.server?.port || 3105;
    const host = config.server?.host || "127.0.0.1";
    if (host !== "127.0.0.1") {
      console.error(`Invalid host configuration: ${host}. Host must be strict 127.0.0.1`);
      process.exit(1);
    }
    
    const server = http.createServer(requestListener);
    server.listen(port, host, () => {
      console.log(`Direct Task Bridge listening on http://${host}:${port}`);
    });
  })();
}

export {
  config,
  jobs,
  loadConfig,
  loadJobs,
  saveJobs,
  requestListener,
  sanitizePaths,
  extractCloseSummary,
  JOBS_FILE,
  AUDIT_LOG_FILE,
  runningProcesses,
  isWeakSecret,
  getBridgeSecret
};
