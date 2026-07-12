import assert from "node:assert";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:url";
import filePathUrl from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = filePathUrl.dirname(__filename);

import {
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
  isWeakSecret
} from "./direct-task-bridge.mjs";

const TEMP_WORKSPACE = filePathUrl.join(__dirname, "temp-test-workspace");

async function setupWorkspace() {
  await fs.mkdir(TEMP_WORKSPACE, { recursive: true });
}

async function cleanupWorkspace() {
  try {
    await fs.rm(TEMP_WORKSPACE, { recursive: true, force: true });
  } catch {}
}

function request(port, method, pathname, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          bodyText: data,
          bodyJson: json
        });
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function cleanFiles() {
  try {
    await fs.unlink(JOBS_FILE);
  } catch {}
  try {
    await fs.unlink(AUDIT_LOG_FILE);
  } catch {}
  try {
    await fs.unlink(filePathUrl.join(__dirname, "config.local.json"));
  } catch {}
  try {
    await fs.rm(filePathUrl.join(__dirname, "job-results"), { recursive: true, force: true });
  } catch {}
}

async function runTests() {
  console.log("=== Starting Direct Task Bridge Node Tests ===");
  await cleanFiles();
  await cleanupWorkspace();
  await setupWorkspace();

  // Write a dummy .uproject to make the default workspace valid
  await fs.writeFile(filePathUrl.join(TEMP_WORKSPACE, "MyGame.uproject"), "{}", "utf8");

  // Configure for testing (using a strong 32+ char secret)
  config.enabled = true;
  config.security.bridgeSecret = "strong-token-xyz-123-abc-456-789-uvw-xyz-val-999";
  config.projectWorkspaceMappings = {
    "proj-test-1": TEMP_WORKSPACE
  };
  config.mockExecution = true;
  config.mockResultMode = "success";
  config.mockDurationMs = 50;
  config.jobTimeoutMs = 1000;
  
  // Clear jobs in memory and save
  for (const k in jobs) { delete jobs[k]; }
  await saveJobs();

  // Start server on dynamic port
  const server = http.createServer(requestListener);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  const validHeaders = { "x-direct-bridge-token": "strong-token-xyz-123-abc-456-789-uvw-xyz-val-999" };
  const validPayload = {
    role: "unreal-code",
    companyId: "comp-id-1",
    projectId: "proj-test-1",
    issueId: "CMP-53",
    title: "Test Job",
    description: "This is a test job description"
  };

  try {
    // 1. Host Rejection Test
    console.log("Running Host Rejection Test...");
    const tempConfigPath = filePathUrl.join(__dirname, "config.local.json");
    await fs.writeFile(tempConfigPath, JSON.stringify({ server: { host: "0.0.0.0" } }), "utf8");
    await assert.rejects(
      async () => { await loadConfig(); },
      /Invalid host configuration/
    );
    await fs.unlink(tempConfigPath);
    // Reload normal config
    await loadConfig();
    config.enabled = true;
    config.security.bridgeSecret = "strong-token-xyz-123-abc-456-789-uvw-xyz-val-999";
    config.projectWorkspaceMappings = {
      "proj-test-1": TEMP_WORKSPACE
    };

    // 2. Secret Strength Validation
    console.log("Running Secret Strength Validation Test...");
    assert.ok(isWeakSecret("short-secret"));
    assert.ok(isWeakSecret("change-this-to-a-secure-token-in-production-must-be-32-chars-long"));
    assert.ok(isWeakSecret("example-secret-placeholder-token"));
    assert.ok(!isWeakSecret("strong-token-xyz-123-abc-456-789-uvw-xyz-val-999"));

    // Verify weak secret in request fails
    config.security.bridgeSecret = "change-this-to-a-secure-token-in-production-must-be-32-chars-long";
    let resWeak = await request(port, "POST", "/direct-task/preview", { "x-direct-bridge-token": config.security.bridgeSecret }, validPayload);
    assert.strictEqual(resWeak.status, 401);
    assert.strictEqual(resWeak.bodyJson.error, "bridge_secret_too_weak");
    config.security.bridgeSecret = "strong-token-xyz-123-abc-456-789-uvw-xyz-val-999"; // Restore

    // 3. No Wildcard CORS Test
    console.log("Running No Wildcard CORS Test...");
    let resCors = await request(port, "POST", "/direct-task/preview", validHeaders, validPayload);
    assert.strictEqual(resCors.headers["access-control-allow-origin"], undefined);
    assert.strictEqual(resCors.headers["access-control-allow-methods"], undefined);
    assert.strictEqual(resCors.headers["access-control-allow-headers"], undefined);

    // 4. Exact Field Limits Test (title 200, description 4000)
    console.log("Running Exact Field Limits Test...");
    const longTitle = "a".repeat(201);
    let resLimit = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, title: longTitle });
    assert.strictEqual(resLimit.status, 400);
    assert.strictEqual(resLimit.bodyJson.error, "invalid_title");

    const longDesc = "a".repeat(4001);
    resLimit = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, description: longDesc });
    assert.strictEqual(resLimit.status, 400);
    assert.strictEqual(resLimit.bodyJson.error, "invalid_description");

    // 5. Invalid Idempotency / Client jobId Handling Test
    console.log("Running Idempotency / Client jobId Handling Test...");
    // 5a. Idempotency type check
    let resIdem = await request(port, "POST", "/direct-task/submit", validHeaders, { ...validPayload, idempotencyKey: 12345 });
    assert.strictEqual(resIdem.status, 400);
    assert.strictEqual(resIdem.bodyJson.error, "invalid_idempotency_key_type");

    // 5b. Idempotency length check
    resIdem = await request(port, "POST", "/direct-task/submit", validHeaders, { ...validPayload, idempotencyKey: "short" });
    assert.strictEqual(resIdem.status, 400);
    assert.strictEqual(resIdem.bodyJson.error, "invalid_idempotency_key_length");

    // 5c. Idempotency format check
    resIdem = await request(port, "POST", "/direct-task/submit", validHeaders, { ...validPayload, idempotencyKey: "invalid@key" });
    assert.strictEqual(resIdem.status, 400);
    assert.strictEqual(resIdem.bodyJson.error, "invalid_idempotency_key_format");

    // 5d. Client-supplied jobId is ignored (generated server-side)
    const clientJobId = "client-selected-id";
    const resSubmit = await request(port, "POST", "/direct-task/submit", validHeaders, {
      ...validPayload,
      jobId: clientJobId,
      idempotencyKey: "valid-idempotency-key"
    });
    assert.strictEqual(resSubmit.status, 201);
    assert.ok(resSubmit.bodyJson.jobId !== clientJobId);
    assert.ok(resSubmit.bodyJson.jobId.startsWith("job-"));

    // Clean running process mapping
    for (const k in jobs) { delete jobs[k]; }
    await saveJobs();

    // 6. Output / Status Truncation & Path/Token/Env Sanitization Test
    console.log("Running Output / Status Truncation & Sanitization Test...");
    const rawText = `Error at C:\\Users\\young\\workspace\\my-project\\main.cpp. Secret is strong-token-xyz-123-abc-456-789-uvw-xyz-val-999. PS C:\\Users\\young> echo Path=${process.env.PATH || ""}`;
    const sanitized = sanitizePaths(rawText);
    assert.ok(!sanitized.includes("C:\\Users\\young"));
    assert.ok(!sanitized.includes("strong-token-xyz-123-abc-456-789-uvw-xyz-val-999"));
    assert.ok(sanitized.includes("<redacted-token>"));
    assert.ok(sanitized.includes("<path>"));

    const longSummaryText = "## Close Summary\n" + "a".repeat(10000);
    const extracted = extractCloseSummary(longSummaryText);
    assert.ok(extracted.includes("truncated due to size limit"));
    assert.ok(extracted.length < 10000);

    // 7. Workspace Validation without Spawning Test
    console.log("Running Workspace Validation without Spawning Test...");
    // 7a. Workspace missing
    config.projectWorkspaceMappings = { "proj-test-1": filePathUrl.join(TEMP_WORKSPACE, "nonexistent-folder") };
    let resWS = await request(port, "POST", "/direct-task/preview", validHeaders, validPayload);
    assert.strictEqual(resWS.status, 400);
    assert.strictEqual(resWS.bodyJson.error, "workspace_missing");

    // 7b. Workspace not directory
    const dummyFilePath = filePathUrl.join(TEMP_WORKSPACE, "dummy-file.txt");
    await fs.writeFile(dummyFilePath, "hello", "utf8");
    config.projectWorkspaceMappings = { "proj-test-1": dummyFilePath };
    resWS = await request(port, "POST", "/direct-task/preview", validHeaders, validPayload);
    assert.strictEqual(resWS.status, 400);
    assert.strictEqual(resWS.bodyJson.error, "workspace_not_directory");

    // 7c. Missing .uproject
    await fs.unlink(dummyFilePath);
    await fs.unlink(filePathUrl.join(TEMP_WORKSPACE, "MyGame.uproject"));
    config.projectWorkspaceMappings = { "proj-test-1": TEMP_WORKSPACE };
    resWS = await request(port, "POST", "/direct-task/preview", validHeaders, validPayload);
    assert.strictEqual(resWS.status, 400);
    assert.strictEqual(resWS.bodyJson.error, "missing_uproject");

    // 7d. Ambiguous .uproject
    await fs.writeFile(filePathUrl.join(TEMP_WORKSPACE, "game1.uproject"), "{}");
    await fs.writeFile(filePathUrl.join(TEMP_WORKSPACE, "game2.uproject"), "{}");
    resWS = await request(port, "POST", "/direct-task/preview", validHeaders, validPayload);
    assert.strictEqual(resWS.status, 400);
    assert.strictEqual(resWS.bodyJson.error, "ambiguous_uproject");

    // 7e. Invalid optional relative .uproject selection
    resWS = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, projectFile: "nonexistent.uproject" });
    assert.strictEqual(resWS.status, 400);
    assert.strictEqual(resWS.bodyJson.error, "project_file_not_found");

    // 7f. Valid selection with projectFile
    resWS = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, projectFile: "game1.uproject" });
    assert.strictEqual(resWS.status, 200);

    // Restore to single MyGame.uproject
    await fs.unlink(filePathUrl.join(TEMP_WORKSPACE, "game1.uproject"));
    await fs.unlink(filePathUrl.join(TEMP_WORKSPACE, "game2.uproject"));
    await fs.writeFile(filePathUrl.join(TEMP_WORKSPACE, "MyGame.uproject"), "{}", "utf8");

    // 8. No Spawn on Preview Test
    console.log("Running No Spawn on Preview Test...");
    for (const k in jobs) { delete jobs[k]; }
    await saveJobs();
    resWS = await request(port, "POST", "/direct-task/preview", validHeaders, validPayload);
    assert.strictEqual(resWS.status, 200);
    assert.strictEqual(Object.keys(jobs).length, 0); // No jobs spawned

    // --- PRIOR TESTS RETAINED & ADAPTED ---
    console.log("Running Prior Retained Tests...");

    // Test Case 1: Disabled bridge fails
    config.enabled = false;
    let res = await request(port, "POST", "/direct-task/preview", validHeaders, validPayload);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.bodyJson.error, "bridge_disabled");
    
    res = await request(port, "POST", "/direct-task/submit", validHeaders, { ...validPayload, idempotencyKey: "idem-test-1" });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.bodyJson.error, "bridge_disabled");
    config.enabled = true;

    // Test Case 2: Missing or invalid token fails
    res = await request(port, "POST", "/direct-task/preview", {}, validPayload);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.bodyJson.error, "unauthorized");

    res = await request(port, "POST", "/direct-task/preview", { "x-direct-bridge-token": "wrong-token-value-here-which-is-too-long" }, validPayload);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.bodyJson.error, "unauthorized");

    // Test Case 3: Preview validation checks
    // Valid preview
    res = await request(port, "POST", "/direct-task/preview", validHeaders, validPayload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.bodyJson.role, "unreal-code");
    assert.ok(res.bodyJson.roleBoundary.includes("read-only"));

    // QA preview
    res = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, role: "unreal-qa" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.bodyJson.role, "unreal-qa");
    assert.ok(res.bodyJson.roleBoundary.includes("inspect and report"));

    // Invalid role
    res = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, role: "other-role" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.bodyJson.error, "invalid_role");

    // Project not mapped
    res = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, projectId: "unmapped" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.bodyJson.error, "project_not_mapped");

    // Invalid project file (contains ..)
    res = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, projectFile: "../traversal.uproject" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.bodyJson.error, "invalid_project_file");

    // Invalid project file (contains separator)
    res = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, projectFile: "sub/test.uproject" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.bodyJson.error, "invalid_project_file");

    // Invalid project file (wrong extension)
    res = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, projectFile: "test.json" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.bodyJson.error, "invalid_project_file");

    // Valid project file (relative name, ends with .uproject)
    res = await request(port, "POST", "/direct-task/preview", validHeaders, { ...validPayload, projectFile: "MyGame.uproject" });
    assert.strictEqual(res.status, 200);

    // Test Case 4: Submit runs and supports status polling
    const resS = await request(port, "POST", "/direct-task/submit", validHeaders, {
      ...validPayload,
      idempotencyKey: "idem-case-4"
    });
    assert.strictEqual(resS.status, 201);
    const generatedJobId = resS.bodyJson.jobId;
    assert.strictEqual(resS.bodyJson.status, "running");

    // Wait for the mock job to complete
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Get Status
    res = await request(port, "GET", `/direct-task/status/${generatedJobId}`, validHeaders);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.bodyJson.jobId, generatedJobId);
    assert.strictEqual(res.bodyJson.status, "completed");
    assert.strictEqual(res.bodyJson.exitCode, 0);
    assert.ok(res.bodyJson.closeSummary.includes("## Close Summary"));
    assert.ok(jobs[generatedJobId].resultPath.includes("job-results"));
    assert.ok(!Object.prototype.hasOwnProperty.call(res.bodyJson, "resultPath"));

    // Test Case 5: Duplicate idempotency is stable
    res = await request(port, "POST", "/direct-task/submit", validHeaders, {
      ...validPayload,
      idempotencyKey: "idem-case-4"
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.bodyJson.jobId, generatedJobId);

    // Test Case 5a: Structured result failures do not become completed jobs.
    config.mockDurationMs = 50;
    for (const [mode, expectedError, expectedExitCode] of [
      ["missing", "bridge_result_missing", -1],
      ["malformed", "bridge_result_malformed", -1],
      ["mismatch", "bridge_result_issue_mismatch", -1],
      ["failed", "worker_exit_nonzero", 7]
    ]) {
      config.mockResultMode = mode;
      const submit = await request(port, "POST", "/direct-task/submit", validHeaders, {
        ...validPayload,
        idempotencyKey: `idem-result-${mode}`
      });
      assert.strictEqual(submit.status, 201);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const status = await request(port, "GET", `/direct-task/status/${submit.bodyJson.jobId}`, validHeaders);
      assert.strictEqual(status.status, 200);
      assert.strictEqual(status.bodyJson.status, "failed");
      assert.strictEqual(status.bodyJson.error, expectedError);
      assert.strictEqual(status.bodyJson.exitCode, expectedExitCode);
    }
    config.mockResultMode = "success";

    // Test Case 6: Concurrency blocks
    config.mockDurationMs = 500; // make it run longer
    
    // Start slow job
    const resSlow = await request(port, "POST", "/direct-task/submit", validHeaders, {
      ...validPayload,
      idempotencyKey: "idem-slow-job"
    });
    assert.strictEqual(resSlow.status, 201);

    // Try starting another concurrent job
    res = await request(port, "POST", "/direct-task/submit", validHeaders, {
      ...validPayload,
      idempotencyKey: "idem-concurrent-job"
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.bodyJson.error, "concurrency_limit_exceeded");

    // Wait for slow job to finish
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Test Case 7: Fail closed on restart
    // Manually inject a running job to jobs.json
    const restartJobs = {
      "restart-job-1": {
        jobId: "restart-job-1",
        idempotencyKey: "idem-restart-job",
        status: "running",
        role: "unreal-code",
        projectId: "proj-test-1",
        issueId: "CMP-53",
        output: "Job output...",
        error: null,
        exitCode: null
      }
    };
    await fs.writeFile(JOBS_FILE, JSON.stringify(restartJobs, null, 2), "utf8");

    // Trigger loadJobs (simulates service restart)
    await loadJobs();

    // Verify it failed closed
    assert.strictEqual(jobs["restart-job-1"].status, "failed");
    assert.ok(jobs["restart-job-1"].error.includes("service restart"));
    assert.strictEqual(jobs["restart-job-1"].exitCode, -1);

    console.log("=== All Direct Task Bridge tests passed successfully! ===");
  } finally {
    server.close();
    await cleanFiles();
    await cleanupWorkspace();
  }
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
