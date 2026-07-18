import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pathModule from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);

const TEST_ENV_DIR = pathModule.join(__dirname, "test-env");
const TEST_PORT = 3199;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function setupTestEnvironment() {
  await cleanTestEnvironment();
  await fs.mkdir(TEST_ENV_DIR, { recursive: true });
  await fs.mkdir(pathModule.join(TEST_ENV_DIR, "data"), { recursive: true });

  const companyLearnings = [
    "# Company Learning Journal",
    "",
    "## Infrastructure",
    "- 2026-07-01: Company core infrastructure configured."
  ].join("\n");

  const projectLearnings = [
    "# Project Learning Journal",
    "",
    "## Tasks",
    "- 2026-07-02: Project task tracking system established."
  ].join("\n");

  const agentLearnings = [
    "# Agent Learning Journal",
    "",
    "## Guidelines",
    "- 2026-07-03: Agent code generation parameters optimized."
  ].join("\n");

  const testConfig = {
    server: {
      host: "127.0.0.1",
      port: TEST_PORT
    },
    security: {
      allowedOrigins: [],
      token: null
    },
    dataDir: "./data",
    journals: [
      {
        id: "test-company",
        name: "Test Company Journal",
        scope: "company",
        companyId: "comp-123",
        path: "./company-learnings.md"
      },
      {
        id: "test-project",
        name: "Test Project Journal",
        scope: "project",
        companyId: "comp-123",
        projectId: "proj-456",
        path: "./project-learnings.md"
      },
      {
        id: "test-agent",
        name: "Test Agent Journal",
        scope: "agent",
        companyId: "comp-123",
        agentId: "agent-789",
        path: "./agent-learnings.md"
      }
    ]
  };

  await fs.writeFile(pathModule.join(TEST_ENV_DIR, "company-learnings.md"), companyLearnings, "utf8");
  await fs.writeFile(pathModule.join(TEST_ENV_DIR, "project-learnings.md"), projectLearnings, "utf8");
  await fs.writeFile(pathModule.join(TEST_ENV_DIR, "agent-learnings.md"), agentLearnings, "utf8");
  await fs.writeFile(pathModule.join(TEST_ENV_DIR, "config.json"), JSON.stringify(testConfig, null, 2), "utf8");
}

async function cleanTestEnvironment() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(TEST_ENV_DIR, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await wait(100 * (attempt + 1));
    }
  }
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once("exit", resolve));
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("Starting Memory Filter Verification Tests...");
  await setupTestEnvironment();

  const sidecarProcess = spawn("node", [
    pathModule.join(__dirname, "memory-sidecar.mjs"),
    "--config",
    pathModule.join(TEST_ENV_DIR, "config.json")
  ], {
    cwd: TEST_ENV_DIR,
    stdio: "inherit"
  });

  // Give the server a moment to start up
  await wait(1500);

  let success = true;

  try {
    // ----------------------------------------------------
    // Test 1: GET /memory/items (Approved items)
    // ----------------------------------------------------
    console.log("\n--- Testing GET /memory/items ---");

    // No filters
    let res = await fetch(`${BASE_URL}/memory/items`);
    let data = await res.json();
    console.log(`No filters: found ${data.items.length} items (expected 3)`);
    if (data.items.length !== 3) success = false;

    // Filter by companyId
    res = await fetch(`${BASE_URL}/memory/items?companyId=comp-123`);
    data = await res.json();
    console.log(`companyId=comp-123: found ${data.items.length} items (expected 3)`);
    if (data.items.length !== 3) success = false;

    res = await fetch(`${BASE_URL}/memory/items?companyId=other`);
    data = await res.json();
    console.log(`companyId=other: found ${data.items.length} items (expected 0)`);
    if (data.items.length !== 0) success = false;

    // Filter by projectId
    res = await fetch(`${BASE_URL}/memory/items?projectId=proj-456`);
    data = await res.json();
    console.log(`projectId=proj-456: found ${data.items.length} items (expected 1)`);
    if (data.items.length !== 1 || data.items[0].projectId !== "proj-456") success = false;

    res = await fetch(`${BASE_URL}/memory/items?projectId=other`);
    data = await res.json();
    console.log(`projectId=other: found ${data.items.length} items (expected 0)`);
    if (data.items.length !== 0) success = false;

    // Filter by agentId
    res = await fetch(`${BASE_URL}/memory/items?agentId=agent-789`);
    data = await res.json();
    console.log(`agentId=agent-789: found ${data.items.length} items (expected 1)`);
    if (data.items.length !== 1 || data.items[0].agentId !== "agent-789") success = false;

    res = await fetch(`${BASE_URL}/memory/items?agentId=other`);
    data = await res.json();
    console.log(`agentId=other: found ${data.items.length} items (expected 0)`);
    if (data.items.length !== 0) success = false;

    // ----------------------------------------------------
    // Test 2: GET /memory/search (Search items)
    // ----------------------------------------------------
    console.log("\n--- Testing GET /memory/search ---");

    // Search all
    res = await fetch(`${BASE_URL}/memory/search?q=journal`);
    data = await res.json();
    console.log(`Search all: found ${data.items.length} items (expected 3)`);
    if (data.items.length !== 3) success = false;

    // Search with project filter
    res = await fetch(`${BASE_URL}/memory/search?q=journal&projectId=proj-456`);
    data = await res.json();
    console.log(`Search with projectId=proj-456: found ${data.items.length} items (expected 1)`);
    if (data.items.length !== 1 || data.items[0].projectId !== "proj-456") success = false;

    // Search with agent filter
    res = await fetch(`${BASE_URL}/memory/search?q=journal&agentId=agent-789`);
    data = await res.json();
    console.log(`Search with agentId=agent-789: found ${data.items.length} items (expected 1)`);
    if (data.items.length !== 1 || data.items[0].agentId !== "agent-789") success = false;

    // ----------------------------------------------------
    // Test 3: POST /memory/candidates
    // ----------------------------------------------------
    console.log("\n--- Creating memory candidates ---");
    const candA = {
      scope: "project",
      type: "learning",
      content: "Candidate memory for project A",
      companyId: "comp-123",
      projectId: "proj-456",
      agentId: "agent-789",
      issueId: "issue-111"
    };

    const candB = {
      scope: "project",
      type: "learning",
      content: "Candidate memory for project B",
      companyId: "comp-123",
      projectId: "proj-other",
      agentId: "agent-other",
      issueId: "issue-222"
    };

    await fetch(`${BASE_URL}/memory/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candA)
    });

    await fetch(`${BASE_URL}/memory/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candB)
    });

    // ----------------------------------------------------
    // Test 4: GET /memory/candidates (Candidates filter)
    // ----------------------------------------------------
    console.log("\n--- Testing GET /memory/candidates ---");

    // All candidates
    res = await fetch(`${BASE_URL}/memory/candidates`);
    data = await res.json();
    console.log(`All candidates: found ${data.candidates.length} candidates (expected 2)`);
    if (data.candidates.length !== 2) success = false;

    // Filter by projectId
    res = await fetch(`${BASE_URL}/memory/candidates?projectId=proj-456`);
    data = await res.json();
    console.log(`projectId=proj-456: found ${data.candidates.length} candidates (expected 1)`);
    if (data.candidates.length !== 1 || data.candidates[0].projectId !== "proj-456") success = false;

    // Filter candidates by companyId.
    res = await fetch(`${BASE_URL}/memory/candidates?companyId=comp-123`);
    data = await res.json();
    console.log(`companyId=comp-123: found ${data.candidates.length} candidates (expected 2)`);
    if (data.candidates.length !== 2 || data.candidates.some((candidate) => candidate.companyId !== "comp-123")) success = false;

    res = await fetch(`${BASE_URL}/memory/candidates?companyId=other`);
    data = await res.json();
    console.log(`companyId=other: found ${data.candidates.length} candidates (expected 0)`);
    if (data.candidates.length !== 0) success = false;

    // Filter by agentId
    res = await fetch(`${BASE_URL}/memory/candidates?agentId=agent-789`);
    data = await res.json();
    console.log(`agentId=agent-789: found ${data.candidates.length} candidates (expected 1)`);
    if (data.candidates.length !== 1 || data.candidates[0].agentId !== "agent-789") success = false;

    // Filter by issueId
    res = await fetch(`${BASE_URL}/memory/candidates?issueId=issue-222`);
    data = await res.json();
    console.log(`issueId=issue-222: found ${data.candidates.length} candidates (expected 1)`);
    if (data.candidates.length !== 1 || data.candidates[0].issueId !== "issue-222") success = false;

    // ----------------------------------------------------
    // Test 5: Sidecar POST Idempotency
    // ----------------------------------------------------
    console.log("\n--- Testing Sidecar POST Idempotency ---");
    const candIdempotent = {
      scope: "project",
      type: "learning",
      content: "Idempotency test candidate content",
      idempotencyKey: "test-idempotency-key-xyz"
    };

    // First POST: Should create the candidate (201 Created)
    let postRes1 = await fetch(`${BASE_URL}/memory/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candIdempotent)
    });
    let postData1 = await postRes1.json();
    console.log(`First POST status: ${postRes1.status} (expected 201)`);
    console.log(`First POST ID: ${postData1.candidate?.id}`);
    if (postRes1.status !== 201 || !postData1.candidate?.id) success = false;

    // Second POST: Should return existing candidate (200 OK) rather than appending
    let postRes2 = await fetch(`${BASE_URL}/memory/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candIdempotent)
    });
    let postData2 = await postRes2.json();
    console.log(`Second POST status: ${postRes2.status} (expected 200)`);
    console.log(`Second POST ID: ${postData2.candidate?.id}`);
    if (postRes2.status !== 200 || postData2.candidate?.id !== postData1.candidate?.id) success = false;

    // Check count of candidates in sidecar (should only have increased by 1, total 3 now)
    res = await fetch(`${BASE_URL}/memory/candidates`);
    data = await res.json();
    console.log(`Total candidates: found ${data.candidates.length} (expected 3)`);
    if (data.candidates.length !== 3) success = false;

    // Two simultaneous retries with the same idempotency key must still append once.
    const concurrentCandidate = {
      scope: "project",
      type: "learning",
      content: "Concurrent idempotency test candidate content",
      idempotencyKey: "test-idempotency-concurrent-xyz"
    };
    const [concurrentResA, concurrentResB] = await Promise.all([
      fetch(`${BASE_URL}/memory/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(concurrentCandidate)
      }),
      fetch(`${BASE_URL}/memory/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(concurrentCandidate)
      })
    ]);
    const concurrentDataA = await concurrentResA.json();
    const concurrentDataB = await concurrentResB.json();
    const concurrentStatuses = [concurrentResA.status, concurrentResB.status].sort((a, b) => a - b);
    console.log(`Concurrent POST statuses: ${concurrentStatuses.join(",")} (expected 200,201)`);
    if (
      concurrentStatuses.join(",") !== "200,201" ||
      concurrentDataA.candidate?.id !== concurrentDataB.candidate?.id
    ) success = false;

    res = await fetch(`${BASE_URL}/memory/candidates`);
    data = await res.json();
    console.log(`Total candidates after concurrent retries: found ${data.candidates.length} (expected 4)`);
    if (data.candidates.length !== 4) success = false;

  } catch (error) {
    console.error("Test execution failed:", error);
    success = false;
  } finally {
    console.log("\nStopping Sidecar Server...");
    sidecarProcess.kill();
    await Promise.race([waitForExit(sidecarProcess), wait(3000)]);
    await cleanTestEnvironment();
  }

  if (success) {
    console.log("\nSUCCESS: All memory namespace filtering verification tests passed!");
    process.exitCode = 0;
  } else {
    console.log("\nFAILURE: Some verification tests failed.");
    process.exitCode = 1;
  }
}

runTests();
