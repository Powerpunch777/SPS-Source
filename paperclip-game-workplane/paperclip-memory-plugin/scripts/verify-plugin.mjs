import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import plugin from "../dist/worker.js";
import manifest from "../dist/manifest.js";
import assert from "node:assert";

// Mock fetch requests to simulate Memory Sidecar
const fetchedUrls = [];

globalThis.fetch = async (urlStr, options) => {
  const url = new URL(urlStr);
  fetchedUrls.push(url.search);

  if (url.pathname === "/memory/items") {
    const scope = url.searchParams.get("scope");
    const companyId = url.searchParams.get("companyId");
    const projectId = url.searchParams.get("projectId");
    const agentId = url.searchParams.get("agentId");

    if (scope === "company") {
      return new Response(JSON.stringify({
        items: [{ id: "mem-comp-1", scope: "company", companyId, text: "Company memory item" }]
      }));
    } else if (scope === "project") {
      return new Response(JSON.stringify({
        items: [{ id: "mem-proj-1", scope: "project", companyId, projectId, text: "Project memory item" }]
      }));
    } else if (scope === "agent") {
      return new Response(JSON.stringify({
        items: [{ id: "mem-agent-1", scope: "agent", companyId, agentId, text: `Agent memory for ${agentId}` }]
      }));
    }
  } else if (url.pathname === "/memory/candidates") {
    return new Response(JSON.stringify({
      candidates: [
        { id: "cand-1", content: "Matching candidate", companyId: "comp-123", projectId: "proj-456", createdAt: "2026-07-10T12:00:00Z" },
        { id: "cand-legacy-1", content: "Legacy candidate missing both", createdAt: "2026-07-10T12:00:00Z" },
        { id: "cand-legacy-2", content: "Legacy candidate missing projectId", companyId: "comp-123", createdAt: "2026-07-10T12:00:00Z" },
        { id: "cand-wrong-proj", content: "Wrong project candidate", companyId: "comp-123", projectId: "proj-other", createdAt: "2026-07-10T12:00:00Z" },
        { id: "cand-wrong-comp", content: "Wrong company candidate", companyId: "comp-other", projectId: "proj-456", createdAt: "2026-07-10T12:00:00Z" }
      ]
    }));
  }

  return new Response(JSON.stringify({ items: [], candidates: [] }));
};

async function main() {
  console.log("Running Memory View Plugin Verification...");

  const harness = createTestHarness({
    manifest,
    config: {
      sidecarUrl: "http://127.0.0.1:3188",
      sidecarToken: "test-token"
    }
  });

  // Register the plugin with the harness context
  await plugin.definition.setup(harness.ctx);

  // Seed mock issues
  harness.seed({
    issues: [
      {
        id: "CMP-22",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "Show assigned agent memory in Task Rooms",
        status: "open",
        assigneeAgentId: "agent-code-worker",
        assigneeUserId: null,
        description: "Assigned to Code Worker",
        workMode: "agent",
        priority: "medium",
        checkoutRunId: null,
        executionRunId: null,
        executionAgentNameKey: null,
        executionLockedAt: null,
        createdByAgentId: null,
        createdByUserId: null,
        responsibleUserId: null,
        issueNumber: 22,
        identifier: "CMP-22",
        requestDepth: 0,
        billingCode: null,
        assigneeAdapterOverrides: null
      },
      {
        id: "CMP-27",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "Unassigned issue",
        status: "open",
        assigneeAgentId: null,
        assigneeUserId: null,
        description: "Unassigned issue",
        workMode: "agent",
        priority: "medium",
        checkoutRunId: null,
        executionRunId: null,
        executionAgentNameKey: null,
        executionLockedAt: null,
        createdByAgentId: null,
        createdByUserId: null,
        responsibleUserId: null,
        issueNumber: 27,
        identifier: "CMP-27",
        requestDepth: 0,
        billingCode: null,
        assigneeAdapterOverrides: null
      },
      {
        id: "room-code",
        identifier: "CMP-71",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "[Agent Room] Code Worker",
        status: "backlog",
        assigneeAgentId: null,
        assigneeUserId: null,
        parentId: null
      },
      {
        id: "room-qa",
        identifier: "CMP-77",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "[Agent Room] QA Worker",
        status: "backlog",
        assigneeAgentId: null,
        assigneeUserId: null,
        parentId: null
      },
      {
        id: "room-closed",
        identifier: "CMP-99",
        companyId: "comp-123",
        projectId: "proj-456",
        title: "[Agent Room] Code Worker",
        status: "done",
        assigneeAgentId: null,
        assigneeUserId: null,
        parentId: null
      }
    ]
  });

  // Case 1: CMP-22 (Assigned to Code Worker)
  console.log("\n--- Testing CMP-22 (Assigned) ---");
  fetchedUrls.length = 0; // Clear history
  const cmp22Result = await harness.getData("memory-view", {
    companyId: "comp-123",
    projectId: "proj-456",
    issueId: "CMP-22"
  });

  console.log("CMP-22 Result keys:", Object.keys(cmp22Result));
  console.log("hasAssignee:", cmp22Result.hasAssignee);
  console.log("agentMemories count:", cmp22Result.agentMemories.length);
  console.log("agentMemories content:", cmp22Result.agentMemories[0]?.text);

  assert.strictEqual(cmp22Result.hasAssignee, true, "CMP-22 should report hasAssignee: true");
  assert.strictEqual(cmp22Result.agentMemories.length, 1, "CMP-22 should return 1 agent memory");
  assert.strictEqual(cmp22Result.agentMemories[0].text, "Agent memory for agent-code-worker", "CMP-22 agent memory should match");
  assert.ok(fetchedUrls.some(s => s.includes("scope=agent")), "Should have fetched agent scope memory");

  // Case 2: CMP-27 (Unassigned)
  console.log("\n--- Testing CMP-27 (Unassigned) ---");
  fetchedUrls.length = 0; // Clear history
  const cmp27Result = await harness.getData("memory-view", {
    companyId: "comp-123",
    projectId: "proj-456",
    issueId: "CMP-27"
  });

  console.log("CMP-27 Result keys:", Object.keys(cmp27Result));
  console.log("hasAssignee:", cmp27Result.hasAssignee);
  console.log("agentMemories count:", cmp27Result.agentMemories.length);

  assert.strictEqual(cmp27Result.hasAssignee, false, "CMP-27 should report hasAssignee: false");
  assert.strictEqual(cmp27Result.agentMemories.length, 0, "CMP-27 should return 0 agent memory");
  assert.ok(!fetchedUrls.some(s => s.includes("scope=agent")), "Should NOT have fetched agent scope memory for unassigned task");

  // Case 3: an issue outside the active company must not leak company memory.
  await assert.rejects(
    harness.getData("memory-view", {
      companyId: "comp-123",
      issueId: "missing-issue"
    }),
    /Issue was not found in the active company/
  );

  // Case 4: Project Hub Candidates Queue - Correct filtering (success)
  console.log("\n--- Testing Project Hub Candidates Queue (Success) ---");
  const candidatesResult = await harness.getData("project-memory-candidates-view", {
    companyId: "comp-123",
    projectId: "proj-456"
  });
  console.log("Candidates count:", candidatesResult.candidates.length);
  console.log("Candidate content:", candidatesResult.candidates[0]?.content);
  assert.strictEqual(candidatesResult.candidates.length, 1, "Should filter out legacy/mismatched candidates");
  assert.strictEqual(candidatesResult.candidates[0].id, "cand-1", "Should return the matching candidate");

  // Case 5: Project Hub Candidates Queue - Fail Closed on missing companyId
  console.log("\n--- Testing Project Hub Candidates Queue (Fail Closed - Missing companyId) ---");
  await assert.rejects(
    harness.getData("project-memory-candidates-view", {
      projectId: "proj-456"
    }),
    /companyId and projectId are required for project-memory-candidates-view data/
  );

  // Case 6: Project Hub Candidates Queue - Fail Closed on missing projectId
  console.log("\n--- Testing Project Hub Candidates Queue (Fail Closed - Missing projectId) ---");
  await assert.rejects(
    harness.getData("project-memory-candidates-view", {
      companyId: "comp-123"
    }),
    /companyId and projectId are required for project-memory-candidates-view data/
  );

  // Case 7: Direct Task Agent Room choices are role-bound and open only.
  console.log("\n--- Testing Direct Task Agent Room choices ---");
  const agentRooms = await harness.getData("direct-task-agent-rooms", {
    companyId: "comp-123",
    projectId: "proj-456"
  });
  assert.deepStrictEqual(agentRooms.agentRooms.map((room) => room.id).sort(), ["room-code", "room-qa"]);
  assert.strictEqual(agentRooms.agentRooms.find((room) => room.id === "room-code").role, "unreal-code");

  // Case 8: Direct Task Preview - Valid unreal-code request
  console.log("\n--- Testing Direct Task Preview (Valid unreal-code) ---");
  const codePreview = await harness.getData("direct-task-preview", {
    companyId: "comp-123",
    projectId: "proj-456",
    parentId: "room-code",
    role: "unreal-code",
    title: "Implement jump mechanics",
    description: "Please implement the jump mechanic in Character.cpp"
  });
  console.log("unreal-code valid:", codePreview.valid);
  assert.strictEqual(codePreview.valid, true, "Should be valid");
  assert.strictEqual(codePreview.roleLabel, "Unreal Code Worker");
  assert.ok(codePreview.roleBoundary.includes("validated Unreal workspace"));
  assert.ok(codePreview.roleBoundary.includes("read-only inspection"));
  assert.ok(codePreview.paperclipStatement.includes("Task Room"));

  // Case 9: Direct Task Preview - Valid unreal-qa request
  console.log("\n--- Testing Direct Task Preview (Valid unreal-qa) ---");
  const qaPreview = await harness.getData("direct-task-preview", {
    companyId: "comp-123",
    projectId: "proj-456",
    parentId: "room-qa",
    role: "unreal-qa",
    title: "Test jump mechanics",
    description: "Run automated tests for character jump"
  });
  console.log("unreal-qa valid:", qaPreview.valid);
  assert.strictEqual(qaPreview.valid, true, "Should be valid");
  assert.strictEqual(qaPreview.roleLabel, "Unreal QA Worker");
  assert.ok(qaPreview.roleBoundary.includes("inspect and report only"));
  assert.ok(qaPreview.roleBoundary.includes("run a test command"));

  // Case 10: Direct Task Preview - Invalid role
  console.log("\n--- Testing Direct Task Preview (Invalid role) ---");
  const invalidRolePreview = await harness.getData("direct-task-preview", {
    companyId: "comp-123",
    projectId: "proj-456",
    role: "unreal-admin",
    title: "Admin task",
    description: "Do admin stuff"
  });
  console.log("invalid role valid:", invalidRolePreview.valid);
  assert.strictEqual(invalidRolePreview.valid, false, "Should be invalid for unknown role");
  assert.ok(invalidRolePreview.errors.role, "Should have role error");

  // Case 11: Direct Task Preview - Overly long fields
  console.log("\n--- Testing Direct Task Preview (Overly long fields) ---");
  const longTitle = "a".repeat(201);
  const longDesc = "b".repeat(4001);
  const longPreview = await harness.getData("direct-task-preview", {
    companyId: "comp-123",
    projectId: "proj-456",
    role: "unreal-code",
    title: longTitle,
    description: longDesc
  });
  console.log("long fields valid:", longPreview.valid);
  assert.strictEqual(longPreview.valid, false, "Should be invalid due to length bounds");
  assert.ok(longPreview.errors.title, "Should have title error");
  assert.ok(longPreview.errors.description, "Should have description error");

  // Case 12: Direct Task Preview - Missing companyId / projectId
  console.log("\n--- Testing Direct Task Preview (Missing company/project ID) ---");
  const missingContextPreview = await harness.getData("direct-task-preview", {
    role: "unreal-code",
    title: "Valid Title",
    description: "Valid Description"
  });
  console.log("missing context valid:", missingContextPreview.valid);
  assert.strictEqual(missingContextPreview.valid, false, "Should be invalid due to missing context");
  assert.ok(missingContextPreview.errors.companyId, "Should have companyId error");
  assert.ok(missingContextPreview.errors.projectId, "Should have projectId error");

  console.log("\nSUCCESS: All automated validation checks passed!");
}

main().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
