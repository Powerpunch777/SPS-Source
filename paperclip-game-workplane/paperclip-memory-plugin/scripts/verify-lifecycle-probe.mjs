import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import plugin from "../dist/worker.js";
import manifest from "../dist/manifest.js";
import assert from "node:assert";

// Track mock fetch calls
const fetchedUrls = [];
const postedCandidates = [];

globalThis.fetch = async (urlStr, options = {}) => {
  const url = new URL(urlStr);
  fetchedUrls.push({ url: url.pathname + url.search, method: options.method || "GET" });

  if (url.pathname === "/memory/candidates" && options.method === "POST") {
    const body = JSON.parse(options.body);
    postedCandidates.push(body);
    return new Response(JSON.stringify({
      ok: true,
      candidate: {
        id: body.idempotencyKey ? `cand_${body.idempotencyKey}` : "mock-cand-id-999",
        scope: body.scope,
        type: body.type,
        content: body.content,
        idempotencyKey: body.idempotencyKey || null,
        source: body.source
      }
    }), { status: 201 });
  }

  return new Response(JSON.stringify({ items: [], candidates: [] }), { status: 200 });
};

async function testDisabledExtraction() {
  console.log("- Running Test: No-op while disabled...");
  postedCandidates.length = 0;

  const harness = createTestHarness({
    manifest,
    config: {
      sidecarUrl: "http://127.0.0.1:3188",
      sidecarToken: "test-token",
      enableManagedCandidateExtraction: false,
      managedCandidateCompanyId: "comp-123"
    }
  });

  await plugin.definition.setup(harness.ctx);

  harness.seed({
    issues: [
      {
        id: "CMP-35-issue",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "Probe supported managed-agent memory lifecycle hooks",
        status: "open",
        assigneeAgentId: "agent-code-worker",
        description: "Verify lifecycle pre-run and post-run hooks.",
        identifier: "CMP-35"
      }
    ],
    issueComments: [
      {
        id: "comment-1",
        issueId: "CMP-35-issue",
        companyId: "comp-123",
        createdByRunId: "run-abc",
        authorType: "agent",
        body: `## Memory Candidates\n- [2026-07-10] Guideline: Should not run while disabled.`,
        createdAt: "2026-07-10T12:00:00Z"
      }
    ]
  });

  const mockRunFinishedEvent = {
    runId: "run-abc",
    agentId: "agent-code-worker",
    issueId: "CMP-35-issue"
  };

  await harness.emit("agent.run.finished", mockRunFinishedEvent, {
    eventId: "evt-finished-123",
    companyId: "comp-123",
    entityId: "run-abc",
    entityType: "run"
  });

  assert.strictEqual(postedCandidates.length, 0, "No candidates should be proposed when disabled.");
  console.log("  => Passed!");
}

async function testWrongCompanyExtraction() {
  console.log("- Running Test: No-op with wrong company ID...");
  postedCandidates.length = 0;

  const harness = createTestHarness({
    manifest,
    config: {
      sidecarUrl: "http://127.0.0.1:3188",
      sidecarToken: "test-token",
      enableManagedCandidateExtraction: true,
      managedCandidateCompanyId: "comp-different"
    }
  });

  await plugin.definition.setup(harness.ctx);

  harness.seed({
    issues: [
      {
        id: "CMP-35-issue",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "Probe supported managed-agent memory lifecycle hooks",
        status: "open",
        assigneeAgentId: "agent-code-worker",
        description: "Verify lifecycle pre-run and post-run hooks.",
        identifier: "CMP-35"
      }
    ],
    issueComments: [
      {
        id: "comment-1",
        issueId: "CMP-35-issue",
        companyId: "comp-123",
        createdByRunId: "run-abc",
        authorType: "agent",
        body: `## Memory Candidates\n- [2026-07-10] Guideline: Should not run with wrong company.`,
        createdAt: "2026-07-10T12:00:00Z"
      }
    ]
  });

  const mockRunFinishedEvent = {
    runId: "run-abc",
    agentId: "agent-code-worker",
    issueId: "CMP-35-issue"
  };

  await harness.emit("agent.run.finished", mockRunFinishedEvent, {
    eventId: "evt-finished-123",
    companyId: "comp-123",
    entityId: "run-abc",
    entityType: "run"
  });

  assert.strictEqual(postedCandidates.length, 0, "No candidates should be proposed when company ID mismatch.");
  console.log("  => Passed!");
}

async function testSuccessfulExtractionAndMetadata() {
  console.log("- Running Test: Successful extraction and metadata preservation...");
  postedCandidates.length = 0;

  const harness = createTestHarness({
    manifest,
    config: {
      sidecarUrl: "http://127.0.0.1:3188",
      sidecarToken: "test-token",
      enableManagedCandidateExtraction: true,
      managedCandidateCompanyId: "comp-123"
    }
  });

  await plugin.definition.setup(harness.ctx);

  harness.seed({
    issues: [
      {
        id: "CMP-35-issue",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "Probe supported managed-agent memory lifecycle hooks",
        status: "open",
        assigneeAgentId: "agent-code-worker",
        description: "Verify lifecycle pre-run and post-run hooks.",
        identifier: "CMP-35"
      }
    ],
    issueComments: [
      {
        id: "comment-1",
        issueId: "CMP-35-issue",
        companyId: "comp-123",
        createdByRunId: "run-abc",
        authorType: "agent",
        body: `## Memory Candidates\n- [2026-07-10] Architecture Rules: Same run comment.\n\nFollow-up Tasks: None.`,
        createdAt: "2026-07-10T12:00:00Z"
      },
      {
        id: "comment-2",
        issueId: "CMP-35-issue",
        companyId: "comp-123",
        createdByRunId: "run-other",
        authorType: "agent",
        body: `## Memory Candidates\n- [2026-07-10] Architecture Rules: Mismatched run comment.`,
        createdAt: "2026-07-10T12:01:00Z"
      }
    ]
  });

  const mockRunFinishedEvent = {
    runId: "run-abc",
    agentId: "agent-code-worker",
    issueId: "CMP-35-issue"
  };

  await harness.emit("agent.run.finished", mockRunFinishedEvent, {
    eventId: "evt-finished-123",
    companyId: "comp-123",
    entityId: "run-abc",
    entityType: "run"
  });

  assert.strictEqual(postedCandidates.length, 1, "Only comments authored by the same run should be considered.");
  const proposed = postedCandidates[0];
  
  assert.strictEqual(proposed.companyId, "comp-123");
  assert.strictEqual(proposed.projectId, "proj-456");
  assert.strictEqual(proposed.agentId, "agent-code-worker");
  assert.strictEqual(proposed.issueId, "CMP-35-issue");
  assert.strictEqual(proposed.source.runId, "run-abc");
  assert.strictEqual(proposed.source.commentId, "comment-1");
  assert.ok(proposed.idempotencyKey, "Should have calculated a deterministic idempotency key.");
  assert.ok(!proposed.content.includes("Follow-up Tasks"), "Candidate extraction must stop before inline follow-up text.");

  console.log("  => Passed!");
}

async function testIdempotentRepeatedEvent() {
  console.log("- Running Test: Deterministic idempotency key over repeated event...");
  postedCandidates.length = 0;

  const harness = createTestHarness({
    manifest,
    config: {
      sidecarUrl: "http://127.0.0.1:3188",
      sidecarToken: "test-token",
      enableManagedCandidateExtraction: true,
      managedCandidateCompanyId: "comp-123"
    }
  });

  await plugin.definition.setup(harness.ctx);

  harness.seed({
    issues: [
      {
        id: "CMP-35-issue",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "Probe supported managed-agent memory lifecycle hooks",
        status: "open",
        assigneeAgentId: "agent-code-worker",
        description: "Verify lifecycle pre-run and post-run hooks.",
        identifier: "CMP-35"
      }
    ],
    issueComments: [
      {
        id: "comment-1",
        issueId: "CMP-35-issue",
        companyId: "comp-123",
        createdByRunId: "run-abc",
        authorType: "agent",
        body: `## Memory Candidates\n- [2026-07-10] Test: deterministic key check.`,
        createdAt: "2026-07-10T12:00:00Z"
      }
    ]
  });

  const mockRunFinishedEvent = {
    runId: "run-abc",
    agentId: "agent-code-worker",
    issueId: "CMP-35-issue"
  };

  // First emit
  await harness.emit("agent.run.finished", mockRunFinishedEvent, {
    eventId: "evt-finished-123",
    companyId: "comp-123",
    entityId: "run-abc",
    entityType: "run"
  });

  // Second emit
  await harness.emit("agent.run.finished", mockRunFinishedEvent, {
    eventId: "evt-finished-124",
    companyId: "comp-123",
    entityId: "run-abc",
    entityType: "run"
  });

  assert.strictEqual(postedCandidates.length, 2, "Plugin submits both times; sidecar handles deduplication.");
  assert.strictEqual(postedCandidates[0].idempotencyKey, postedCandidates[1].idempotencyKey, "The keys must be deterministic and identical.");
  console.log("  => Passed!");
}

async function testBoundsEnforcement() {
  console.log("- Running Test: Size and count bounds enforcement...");
  postedCandidates.length = 0;

  const harness = createTestHarness({
    manifest,
    config: {
      sidecarUrl: "http://127.0.0.1:3188",
      sidecarToken: "test-token",
      enableManagedCandidateExtraction: true,
      managedCandidateCompanyId: "comp-123"
    }
  });

  await plugin.definition.setup(harness.ctx);

  const largeContent = "A".repeat(5000);

  // Seed 7 comments with valid candidate sections
  const issueComments = [];
  for (let i = 1; i <= 7; i++) {
    issueComments.push({
      id: `comment-${i}`,
      issueId: "CMP-35-issue",
      companyId: "comp-123",
      createdByRunId: "run-abc",
      authorType: "agent",
      body: `## Memory Candidates\n${i === 1 ? largeContent : `Candidate-${i}`}`,
      createdAt: `2026-07-10T12:0${i}:00Z`
    });
  }

  harness.seed({
    issues: [
      {
        id: "CMP-35-issue",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "Probe supported managed-agent memory lifecycle hooks",
        status: "open",
        assigneeAgentId: "agent-code-worker",
        description: "Verify lifecycle pre-run and post-run hooks.",
        identifier: "CMP-35"
      }
    ],
    issueComments
  });

  const mockRunFinishedEvent = {
    runId: "run-abc",
    agentId: "agent-code-worker",
    issueId: "CMP-35-issue"
  };

  await harness.emit("agent.run.finished", mockRunFinishedEvent, {
    eventId: "evt-finished-123",
    companyId: "comp-123",
    entityId: "run-abc",
    entityType: "run"
  });

  // Verify count limit (max 5)
  assert.strictEqual(postedCandidates.length, 5, "Should bound candidates per run to 5.");

  // Verify size limit of the first candidate (truncated to 4000)
  assert.strictEqual(postedCandidates[0].content.length, 4000, "Should truncate candidate content exceeding 4000 chars.");

  console.log("  => Passed!");
}

async function main() {
  console.log("=================================================");
  console.log("Running Paperclip Managed Agent Lifecycle Probe Tests...");
  console.log("=================================================");

  // Pre-run Prompt Interceptor verification
  const hasPromptInterceptor = typeof plugin.definition.onAgentRunStarting === "function" ||
                               typeof plugin.definition.onBeforePromptGeneration === "function";
  assert.strictEqual(hasPromptInterceptor, false, "Paperclip Plugin SDK does not define any pre-run prompt mutation hook.");
  console.log("- Pre-run verification: confirmed no pre-run prompt mutation hook exists.");

  await testDisabledExtraction();
  await testWrongCompanyExtraction();
  await testSuccessfulExtractionAndMetadata();
  await testIdempotentRepeatedEvent();
  await testBoundsEnforcement();

  console.log("\nSUCCESS: Lifecycle capability probe run completed successfully!");
}

main().catch(err => {
  console.error("Probe failed:", err);
  process.exit(1);
});
