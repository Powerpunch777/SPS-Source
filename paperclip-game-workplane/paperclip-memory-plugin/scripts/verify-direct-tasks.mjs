import { createTestHarness as originalCreateTestHarness } from "@paperclipai/plugin-sdk/testing";
import plugin from "../dist/worker.js";
import manifest from "../dist/manifest.js";
import assert from "node:assert";
import net from "node:net";
import crypto from "node:crypto";

const defaultParentId = "parent-ok-123";
const defaultParentIssue = {
  id: defaultParentId,
  companyId: "comp-123",
  projectId: "proj-456",
  title: "[Agent Room] Code Worker",
  status: "todo"
};

const originalOnApiRequest = plugin.definition.onApiRequest.bind(plugin.definition);
plugin.definition.onApiRequest = async (input) => {
  if (input && input.routeKey === "direct-tasks-submit" && input.body) {
    if (!input.body.parentId) {
      input.body.parentId = defaultParentId;
    }
  }
  return originalOnApiRequest(input);
};

export function createTestHarness(opts) {
  const harness = originalCreateTestHarness(opts);
  
  // Seed the parent issue by default
  harness.seed({
    issues: [defaultParentIssue]
  });

  const originalPerformAction = harness.performAction.bind(harness);
  harness.performAction = async (actionName, params, actionCtx) => {
    if (actionName === "direct-task-submit") {
      const newParams = {
        parentId: defaultParentId,
        ...params
      };
      return originalPerformAction(actionName, newParams, actionCtx);
    }
    return originalPerformAction(actionName, params, actionCtx);
  };

  const originalList = harness.ctx.issues.list.bind(harness.ctx.issues);
  harness.ctx.issues.list = async (filter) => {
    const list = await originalList(filter);
    const configVal = await harness.ctx.config.get();
    if (configVal && configVal.directTaskTransport === "legacy-http-token") {
      return list.filter(issue => issue.id !== defaultParentId);
    }
    return list;
  };

  return harness;
}

// Mock fetch requests to simulate Direct Task Bridge and Memory Sidecar
let mockFetchHandler = null;

globalThis.fetch = async (urlStr, options = {}) => {
  if (mockFetchHandler) {
    return mockFetchHandler(urlStr, options);
  }
  return new Response(JSON.stringify({}), { status: 200 });
};

async function runTests() {
  console.log("=================================================");
  console.log("Running Direct Task Integration Tests...");
  console.log("=================================================");

  // 1. DISABLED CONFIG TEST
  console.log("- Running Test: Disabled config has zero side effects...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: false,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    await plugin.definition.setup(harness.ctx);

    // Mock secrets.resolve to assert it's never called when disabled
    let resolveCount = 0;
    harness.ctx.secrets.resolve = async (ref) => {
      resolveCount++;
      return "mock-secret";
    };

    // Call submit route
    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      params: {},
      query: {},
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Test Jump Mechanics",
        description: "Verify Character.cpp jumps",
        idempotencyKey: "idem-key-disabled-123"
      },
      actor: { actorType: "user", actorId: "usr-789" },
      companyId: "comp-123",
      headers: {}
    };

    const response = await plugin.definition.onApiRequest(input);
    assert.strictEqual(response.status, 403);
    assert.strictEqual(response.body.error, "direct_task_launch_disabled");

    // Verify no issue was created
    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 0);

    // Run finalizer job while disabled
    await harness.runJob("direct-task-finalizer");

    // Verify secrets.resolve was called zero times
    assert.strictEqual(resolveCount, 0, "secrets.resolve must be called 0 times when disabled");

    console.log("  => Passed!");
  }

  // 2. INVALID INPUT REJECTION
  console.log("- Running Test: Invalid input/config/URL is rejected before writes...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    await plugin.definition.setup(harness.ctx);

    // Mock secrets.resolve to assert it's never called
    let resolveCount = 0;
    harness.ctx.secrets.resolve = async (ref) => {
      resolveCount++;
      return "mock-secret";
    };

    const baseBody = {
      companyId: "comp-123",
      projectId: "proj-456",
      role: "unreal-code",
      title: "Test",
      description: "Desc",
      idempotencyKey: "idem-key-valid-123"
    };

    const testCases = [
      { body: { ...baseBody, role: "invalid-role" }, desc: "invalid role" },
      { body: { ...baseBody, title: "" }, desc: "empty title" },
      { body: { ...baseBody, title: "a".repeat(201) }, desc: "title too long" },
      { body: { ...baseBody, description: "a".repeat(4001) }, desc: "description too long" },
      { body: { ...baseBody, uproject: "../outside.uproject" }, desc: "uproject traversal" },
      { body: { ...baseBody, uproject: "/abs/path.uproject" }, desc: "uproject absolute" },
      { body: { ...baseBody, uproject: "valid.uproject\\traversal" }, desc: "uproject backslash" },
      { body: { ...baseBody, uproject: "valid.txt" }, desc: "uproject non-uproject extension" },
      { body: { ...baseBody, idempotencyKey: "weak" }, desc: "idempotencyKey too short" },
      { body: { ...baseBody, idempotencyKey: "invalid_key!" }, desc: "idempotencyKey invalid format" }
    ];

    for (const tc of testCases) {
      resolveCount = 0;
      const input = {
        routeKey: "direct-tasks-submit",
        method: "POST",
        path: "/direct-tasks/submit",
        params: {},
        query: {},
        body: tc.body,
        actor: { actorType: "user", actorId: "usr-789" },
        companyId: "comp-123",
        headers: {}
      };
      const response = await plugin.definition.onApiRequest(input);
      assert.strictEqual(response.status, 400, `Should reject ${tc.desc}`);
      assert.strictEqual(response.body.error, "invalid_input");
      assert.strictEqual(resolveCount, 0, `secrets.resolve must be called 0 times for invalid input: ${tc.desc}`);
    }

    // Test strict URL validation
    const invalidUrls = [
      "http://localhost:3105",
      "http://[::1]:3105",
      "http://user:pass@127.0.0.1:3105",
      "http://127.0.0.1:3105?foo=bar",
      "http://127.0.0.1:3105#hash",
      "https://127.0.0.1:3105",
      "http://127.0.0.1",
      "http://127.0.0.1:invalid",
      "http://127.0.0.1:3105/path"
    ];

    const loopbackInput = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      params: {},
      query: {},
      body: baseBody,
      actor: { actorType: "user", actorId: "usr-789" },
      companyId: "comp-123",
      headers: {}
    };

    for (const badUrl of invalidUrls) {
      resolveCount = 0;
      harness.setConfig({
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: badUrl,
        directBridgeSecretRef: "bridge-token"
      });
      const response = await plugin.definition.onApiRequest(loopbackInput);
      assert.strictEqual(response.status, 400, `Should reject bad URL: ${badUrl}`);
      assert.strictEqual(response.body.error, "invalid_bridge_config");
      assert.strictEqual(resolveCount, 0, `secrets.resolve must be called 0 times for invalid URL: ${badUrl}`);
    }

    // Test missing/empty/invalid secret ref
    const invalidSecretRefs = [
      "",
      "   ",
      null,
      undefined,
      12345
    ];

    for (const badSecretRef of invalidSecretRefs) {
      resolveCount = 0;
      harness.setConfig({
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: badSecretRef
      });
      const response = await plugin.definition.onApiRequest(loopbackInput);
      assert.strictEqual(response.status, 400, `Should reject bad secret ref: ${badSecretRef}`);
      assert.strictEqual(resolveCount, 0, `secrets.resolve must be called 0 times for bad secret ref: ${badSecretRef}`);
    }

    // Verify no issue was created
    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 0);
    console.log("  => Passed!");
  }

  // 3. COMPANY MISMATCH REJECTION
  console.log("- Running Test: Host-resolved companyId mismatch is rejected...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    await plugin.definition.setup(harness.ctx);

    // Mock secrets.resolve to assert it's never called
    let resolveCount = 0;
    harness.ctx.secrets.resolve = async (ref) => {
      resolveCount++;
      return "mock-secret";
    };

    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      body: {
        companyId: "comp-mismatch",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Test",
        description: "Desc",
        idempotencyKey: "idem-key-mismatch"
      },
      companyId: "comp-123" // Host-resolved differs
    };

    const response = await plugin.definition.onApiRequest(input);
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, "company_mismatch");
    assert.strictEqual(resolveCount, 0, "secrets.resolve must be called 0 times on company mismatch");

    // Verify no issue was created
    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 0);
    console.log("  => Passed!");
  }

  // 4. VALID SUBMIT & NORMALIZED PAYLOAD & IDEMPOTENCY
  console.log("- Running Test: Valid submit produces one unassigned issue and one bridge payload...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    // Seed mock project
    harness.seed({
      projects: [
        {
          id: "proj-456",
          companyId: "comp-123",
          displayName: "My Unreal Project",
          projectKey: "my-unreal-project"
        }
      ]
    });

    await plugin.definition.setup(harness.ctx);

    // Mock secrets.resolve and assert called exactly once
    let resolveCount = 0;
    harness.ctx.secrets.resolve = async (ref) => {
      resolveCount++;
      assert.strictEqual(ref, "bridge-token");
      return "super-secret-bridge-token";
    };

    let fetchCalled = false;
    mockFetchHandler = (urlStr, options) => {
      fetchCalled = true;
      const url = new URL(urlStr);
      assert.strictEqual(url.pathname, "/direct-task/submit");
      assert.strictEqual(options.method, "POST");
      assert.strictEqual(options.headers["Authorization"], "Bearer super-secret-bridge-token");
      assert.strictEqual(options.headers["content-type"], "application/json");

      const body = JSON.parse(options.body);
      assert.strictEqual(body.role, "unreal-code");
      assert.strictEqual(body.companyId, "comp-123");
      assert.strictEqual(body.projectId, "proj-456");
      assert.ok(body.issueId);
      assert.strictEqual(body.title, "Test Jump Mechanics");
      assert.strictEqual(body.description, "Verify character jump");
      assert.strictEqual(body.idempotencyKey, "idem-key-success-123");
      assert.strictEqual(body.projectFile, "MyProject.uproject");

      return new Response(JSON.stringify({
        jobId: "job-00000000000000000000000000000001",
        status: "running"
      }), { status: 201 });
    };

    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      params: {},
      query: {},
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Test Jump Mechanics",
        description: "Verify character jump",
        uproject: "MyProject.uproject",
        idempotencyKey: "idem-key-success-123"
      },
      actor: { actorType: "user", actorId: "usr-789" },
      companyId: "comp-123",
      headers: {}
    };

    const response = await plugin.definition.onApiRequest(input);
    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.jobId, "job-00000000000000000000000000000001");
    assert.strictEqual(response.body.status, "running");

    assert.ok(fetchCalled);
    assert.strictEqual(resolveCount, 1, "secrets.resolve must be called exactly once for valid path");

    // Verify exactly one unassigned issue was created
    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 1);
    const createdIssue = issues[0];
    assert.strictEqual(createdIssue.title, "Test Jump Mechanics");
    assert.strictEqual(createdIssue.description, "Verify character jump");
    assert.ok(!createdIssue.assigneeAgentId);
    assert.strictEqual(createdIssue.assigneeUserId, null);
    assert.strictEqual(createdIssue.originKind, "plugin:local.memory-sidecar:direct-task");
    assert.strictEqual(createdIssue.originId, "idem-key-success-123");

    // Verify active job is saved in state
    const stateVal = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(stateVal);
    assert.strictEqual(stateVal.jobId, "job-00000000000000000000000000000001");
    assert.strictEqual(stateVal.idempotencyKey, "idem-key-success-123");
    assert.strictEqual(stateVal.issueId, createdIssue.id);

    // Duplicate idempotency test
    console.log("- Running Test: Duplicate idempotency does not duplicate work...");
    fetchCalled = false;
    resolveCount = 0;
    mockFetchHandler = () => {
      assert.fail("Fetch should not be called again for duplicate idempotency key");
    };

    const responseDup = await plugin.definition.onApiRequest(input);
    assert.strictEqual(responseDup.status, 200);
    assert.strictEqual(responseDup.body.success, true);
    assert.strictEqual(responseDup.body.jobId, "job-00000000000000000000000000000001");
    assert.strictEqual(resolveCount, 0, "secrets.resolve must be called 0 times on duplicate idempotency hit");

    // Ensure no new issue was created
    const issuesDup = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issuesDup.length, 1);

    console.log("  => Passed!");
  }

  // 5. COMPLETED AND FAILED FINALIZER PATHS
  console.log("- Running Test: Finalizer paths are idempotent and preserve boundaries...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    const mockIssue = {
      id: "iss-mock-123",
      companyId: "comp-123",
      projectId: "proj-456",
      title: "Direct Job",
      status: "todo",
      assigneeAgentId: undefined,
      assigneeUserId: null
    };

    harness.seed({
      issues: [mockIssue]
    });

    await plugin.definition.setup(harness.ctx);

    // Mock secrets.resolve
    let resolveCount = 0;
    harness.ctx.secrets.resolve = async () => {
      resolveCount++;
      return "super-secret-bridge-token";
    };

    // Set active job in state
    const activeJobVal = {
      jobId: "job-00000000000000000000000000000999",
      idempotencyKey: "idem-finalizer-1",
      issueId: "iss-mock-123",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running",
      createdAt: new Date().toISOString()
    };
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobVal);

    // Case 5a: Finalizer polling - Success path
    let pollCalled = false;
    mockFetchHandler = (urlStr, options) => {
      pollCalled = true;
      const url = new URL(urlStr);
      assert.strictEqual(url.pathname, "/direct-task/status/job-00000000000000000000000000000999");
      assert.strictEqual(options.method, "GET");
      assert.strictEqual(options.headers["Authorization"], "Bearer super-secret-bridge-token");

      return new Response(JSON.stringify({
        jobId: "job-00000000000000000000000000000999",
        status: "completed",
        exitCode: 0,
        error: null,
        closeSummary: "## Close Summary\n\nGoal: Accomplished!\n\nResult: Verified jump mechanics."
      }), { status: 200 });
    };

    await harness.runJob("direct-task-finalizer");
    assert.ok(pollCalled);
    assert.strictEqual(resolveCount, 1, "secrets.resolve must be called exactly once for success poll path");

    // Verify issue waits for user review after a successful worker run
    const updatedIssue = await harness.ctx.issues.get("iss-mock-123", "comp-123");
    assert.strictEqual(updatedIssue.status, "in_review");
    assert.ok(!updatedIssue.assigneeAgentId, "Must never assign an agent");

    // Verify comment was posted
    const comments = await harness.ctx.issues.listComments("iss-mock-123", "comp-123");
    assert.strictEqual(comments.length, 1);
    assert.ok(comments[0].body.includes("## Close Summary"));
    assert.ok(comments[0].body.includes("direct-task-bridge-marker: job-00000000000000000000000000000999 - in_review"));

    // Verify active job is cleared from state
    const stateAfterSuccess = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(!stateAfterSuccess);

    // Case 5b: Success path idempotency check on rerun (returns early because issue.status is terminal)
    pollCalled = false;
    resolveCount = 0;
    // Put job back in state
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobVal);
    mockFetchHandler = () => {
      assert.fail("Should not poll because issue is already in a terminal state");
    };

    await harness.runJob("direct-task-finalizer");
    // State should be cleared immediately without polling or secret resolution
    const stateAfterSuccessIdem = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(!stateAfterSuccessIdem);
    assert.strictEqual(resolveCount, 0, "secrets.resolve must be called 0 times on success path idempotency rerun");

    // Case 5c: Finalizer polling - Failure path
    const mockIssue2 = {
      id: "iss-mock-456",
      companyId: "comp-123",
      projectId: "proj-456",
      title: "Direct Job Failure",
      status: "todo",
      assigneeAgentId: undefined,
      assigneeUserId: null
    };
    harness.seed({
      issues: [mockIssue2]
    });

    const activeJobValFailure = {
      jobId: "job-00000000000000000000000000000888",
      idempotencyKey: "idem-finalizer-2",
      issueId: "iss-mock-456",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running",
      createdAt: new Date().toISOString()
    };
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobValFailure);

    pollCalled = false;
    resolveCount = 0;
    mockFetchHandler = (urlStr, options) => {
      pollCalled = true;
      return new Response(JSON.stringify({
        jobId: "job-00000000000000000000000000000888",
        status: "failed",
        exitCode: 1,
        error: "fatal_compilation_error",
        closeSummary: "Failed compiling jump mechanics."
      }), { status: 200 });
    };

    await harness.runJob("direct-task-finalizer");
    assert.ok(pollCalled);
    assert.strictEqual(resolveCount, 1, "secrets.resolve must be called exactly once for failed poll path");

    // Verify issue is marked blocked
    const updatedIssue2 = await harness.ctx.issues.get("iss-mock-456", "comp-123");
    assert.strictEqual(updatedIssue2.status, "blocked");
    assert.ok(!updatedIssue2.assigneeAgentId, "Must never assign an agent");

    // Verify comment was posted
    const commentsFailure = await harness.ctx.issues.listComments("iss-mock-456", "comp-123");
    assert.strictEqual(commentsFailure.length, 1);
    assert.ok(commentsFailure[0].body.includes("execution failed"));
    assert.ok(commentsFailure[0].body.includes("direct-task-bridge-marker: job-00000000000000000000000000000888 - blocked"));
    assert.ok(commentsFailure[0].body.length <= 4000);

    // Verify state cleared
    const stateAfterFailure = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(!stateAfterFailure);

    console.log("  => Passed!");
  }

  // 6. INVALID BRIDGE SUCCESS RESPONSE FAILS CLOSED
  console.log("- Running Test: Invalid bridge success response fails closed...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });
    harness.seed({
      projects: [{ id: "proj-456", companyId: "comp-123" }]
    });
    await plugin.definition.setup(harness.ctx);
    harness.ctx.secrets.resolve = async () => "super-secret-bridge-token";

    // Returns success HTTP status but invalid body (missing jobId)
    mockFetchHandler = () => {
      return new Response(JSON.stringify({
        status: "running"
      }), { status: 201 });
    };

    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Test",
        description: "Desc",
        idempotencyKey: "idem-invalid-success"
      },
      companyId: "comp-123"
    };

    const response = await plugin.definition.onApiRequest(input);
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, "bridge_dispatch_failed");

    // Verify issue was created but cancelled
    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].status, "cancelled");

    // Verify state not saved
    const stateVal = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(!stateVal);
    console.log("  => Passed!");
  }

  // 7. SECRET IS ABSENT FROM LOGS/RESPONSE/STATE/COMMENTS
  console.log("- Running Test: Secret text remains completely hidden...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    harness.seed({
      projects: [
        {
          id: "proj-456",
          companyId: "comp-123",
          displayName: "My Unreal Project",
          projectKey: "my-unreal-project"
        }
      ],
      issues: [
        {
          id: "iss-mock-123",
          companyId: "comp-123",
          projectId: "proj-456",
          title: "Secret Echo Issue",
          status: "todo"
        }
      ]
    });

    await plugin.definition.setup(harness.ctx);

    const secretToken = "very-private-secret-12345!";
    harness.ctx.secrets.resolve = async () => secretToken;

    // Bridge echoes secret in error
    mockFetchHandler = () => {
      return new Response(JSON.stringify({ error: `Echoing secret: ${secretToken}` }), { status: 400 });
    };

    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      params: {},
      query: {},
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Jump",
        description: "Desc",
        idempotencyKey: "idem-key-secret-test"
      },
      actor: { actorType: "user", actorId: "usr-789" },
      companyId: "comp-123",
      headers: {}
    };

    const response = await plugin.definition.onApiRequest(input);

    // Assert secret is not in response
    const responseString = JSON.stringify(response);
    assert.ok(!responseString.includes(secretToken));

    // Assert secret is not in comments
    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    const createdIssue = issues.find(i => i.originId === "idem-key-secret-test");
    assert.ok(createdIssue);
    const comments = await harness.ctx.issues.listComments(createdIssue.id, "comp-123");
    assert.ok(!comments[0].body.includes(secretToken));

    // Now test finalizer secret echo redaction
    const activeJobVal = {
      jobId: "job-0000000000000000000000000000ece0",
      idempotencyKey: "idem-secret-echo-finalizer",
      issueId: "iss-mock-123",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running"
    };
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobVal);

    mockFetchHandler = () => {
      return new Response(JSON.stringify({
        jobId: "job-0000000000000000000000000000ece0",
        status: "failed",
        exitCode: 1,
        error: `failed with secret: ${secretToken}`,
        closeSummary: `failed close summary containing secret: ${secretToken}`
      }), { status: 200 });
    };

    await harness.runJob("direct-task-finalizer");

    const finalizerComments = await harness.ctx.issues.listComments("iss-mock-123", "comp-123");
    const terminalComment = finalizerComments.find(c => c.body.includes("direct-task-bridge-marker"));
    assert.ok(terminalComment);
    assert.ok(!terminalComment.body.includes(secretToken), "Secret must not be in terminal comment");

    // Assert secret is not in logs
    const logString = JSON.stringify(harness.logs);
    assert.ok(!logString.includes(secretToken));

    // Assert secret is not in state
    const stateVal = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    const stateString = JSON.stringify(stateVal) || "";
    assert.ok(!stateString.includes(secretToken));

    console.log("  => Passed!");
  }

  // 8. RETRY CONVERGENCE & EXACTLY ONE COMMENT (SIMULATING PARTIAL DATABASE UPDATE FAILURE)
  console.log("- Running Test: Finalizer partial-update retry produces exactly one marker-bearing comment and converges...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    const mockIssue = {
      id: "iss-retry-test",
      companyId: "comp-123",
      projectId: "proj-456",
      title: "Retry Job",
      status: "todo"
    };

    harness.seed({
      issues: [mockIssue]
    });

    await plugin.definition.setup(harness.ctx);
    
    let resolveCount = 0;
    harness.ctx.secrets.resolve = async () => {
      resolveCount++;
      return "super-secret-bridge-token";
    };

    const activeJobVal = {
      jobId: "job-00000000000000000000000000000123",
      idempotencyKey: "idem-retry-123",
      issueId: "iss-retry-test",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running"
    };
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobVal);

    mockFetchHandler = () => {
      return new Response(JSON.stringify({
        jobId: "job-00000000000000000000000000000123",
        status: "completed",
        exitCode: 0,
        closeSummary: "## Close Summary\nGoal: done."
      }), { status: 200 });
    };

    // Simulate real partial failure: first issues.update throws!
    let updateCount = 0;
    const originalUpdate = harness.ctx.issues.update.bind(harness.ctx.issues);
    harness.ctx.issues.update = async (id, patch, companyId) => {
      updateCount++;
      if (updateCount === 1) {
        throw new Error("Simulated database failure during issues.update");
      }
      return originalUpdate(id, patch, companyId);
    };

    // First finalizer run: should write comment and then throw on update
    await harness.runJob("direct-task-finalizer");

    // Verify comment is posted with the outcome encoded in the marker
    const comments = await harness.ctx.issues.listComments("iss-retry-test", "comp-123");
    assert.strictEqual(comments.length, 1);
    assert.ok(comments[0].body.includes("direct-task-bridge-marker: job-00000000000000000000000000000123 - in_review"));

    // Verify issue status remains "todo" since update failed
    const issueAfterFail = await harness.ctx.issues.get("iss-retry-test", "comp-123");
    assert.strictEqual(issueAfterFail.status, "todo");

    // Verify secrets.resolve was called once
    assert.strictEqual(resolveCount, 1);

    // Mock bridge is now completely offline / throws error, and secrets.resolve will assert-fail to ensure it is not called!
    mockFetchHandler = () => {
      throw new Error("Bridge is offline");
    };
    harness.ctx.secrets.resolve = async () => {
      assert.fail("secrets.resolve should not be called during retry/convergence path");
    };
    resolveCount = 0;

    // Retry finalizer run: should read comment marker and converge
    await harness.runJob("direct-task-finalizer");

    // Verify no new comment was added
    const commentsAfterRetry = await harness.ctx.issues.listComments("iss-retry-test", "comp-123");
    assert.strictEqual(commentsAfterRetry.length, 1, "Must produce exactly one comment");

    // Verify issue status converged to user review
    const issueFinal = await harness.ctx.issues.get("iss-retry-test", "comp-123");
    assert.strictEqual(issueFinal.status, "in_review");

    // Verify active-job state is cleared
    const stateVal = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(!stateVal);

    // Verify secrets.resolve was called 0 times on retry
    assert.strictEqual(resolveCount, 0);

    console.log("  => Passed!");
  }

  // 9. MALFORMED / MISMATCHED STATUS CANNOT MARK IN REVIEW
  console.log("- Running Test: Malformed or mismatched bridge status cannot mark in review...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    const mockIssue = {
      id: "iss-malformed-test",
      companyId: "comp-123",
      projectId: "proj-456",
      title: "Malformed Job",
      status: "todo"
    };

    harness.seed({
      issues: [mockIssue]
    });

    await plugin.definition.setup(harness.ctx);
    harness.ctx.secrets.resolve = async () => "super-secret-bridge-token";

    const activeJobVal = {
      jobId: "job-00000000000000000000000000000c1d",
      idempotencyKey: "idem-malformed-123",
      issueId: "iss-malformed-test",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running"
    };
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobVal);

    // Mismatched job ID in status response
    mockFetchHandler = () => {
      return new Response(JSON.stringify({
        jobId: "job-00000000000000000000000000000de0",
        status: "completed",
        exitCode: 0,
        closeSummary: "## Close Summary\nGoal: done."
      }), { status: 200 });
    };

    await harness.runJob("direct-task-finalizer");

    // Verify issue was marked blocked (fail closed), not in_review!
    const issueFinal = await harness.ctx.issues.get("iss-malformed-test", "comp-123");
    assert.strictEqual(issueFinal.status, "blocked");

    // Verify active-job state is cleared
    const stateVal = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(!stateVal);

    console.log("  => Passed!");
  }

  // 10. GENERIC OUTER ERRORS AND SECRET LEAK PREVENTION
  console.log("- Running Test: Generic outer errors never expose a known secret value...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    await plugin.definition.setup(harness.ctx);

    const secretToken = "super-confidential-secret-key-999";
    harness.ctx.secrets.resolve = async () => secretToken;

    // Force ctx.projects.get to throw an error containing the secret
    harness.ctx.projects.get = async () => {
      throw new Error("Secret leaked: " + secretToken);
    };

    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Test Error",
        description: "Verify outer catch error behavior",
        idempotencyKey: "idem-key-error-leak-test"
      },
      companyId: "comp-123"
    };

    const response = await plugin.definition.onApiRequest(input);
    
    // Assert status is 500
    assert.strictEqual(response.status, 500);
    // Assert response does NOT contain the secret
    const responseString = JSON.stringify(response);
    assert.ok(!responseString.includes(secretToken), "Response must not contain the secret token");
    // Assert response message is generic
    assert.strictEqual(response.body.message, "An internal server error occurred.");

    // Assert logs do not contain the secret
    const logsString = JSON.stringify(harness.logs);
    assert.ok(!logsString.includes(secretToken), "Logs must not contain the secret token");

    // Test finalizer outer catch behavior
    // Seed active job
    const activeJobVal = {
      jobId: "job-00000000000000000000000000000e1a",
      idempotencyKey: "idem-error-leak-finalizer",
      issueId: "iss-error-leak-test",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running"
    };
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobVal);

    // Force ctx.issues.get to throw an error containing the secret
    harness.ctx.issues.get = async () => {
      throw new Error("Secret leaked in finalizer: " + secretToken);
    };

    // Run finalizer job: the wrapper catches the error and should log a generic message
    await harness.runJob("direct-task-finalizer");

    // Assert that harness logs do not contain the secret
    const logsAfterFinalizer = JSON.stringify(harness.logs);
    assert.ok(!logsAfterFinalizer.includes(secretToken), "Finalizer logs must not contain the secret token");

    console.log("  => Passed!");
  }

  // 11. SUBMIT RESPONSE WITH INVALID BUT NON-EMPTY JOB ID
  console.log("- Running Test: Submit response with invalid but non-empty job ID is rejected...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    harness.seed({
      projects: [
        {
          id: "proj-456",
          companyId: "comp-123",
          displayName: "My Unreal Project",
          projectKey: "my-unreal-project"
        }
      ]
    });

    await plugin.definition.setup(harness.ctx);
    harness.ctx.secrets.resolve = async () => "super-secret-bridge-token";

    // Returns HTTP 201 but with invalid jobId format
    mockFetchHandler = () => {
      return new Response(JSON.stringify({
        jobId: "job-invalid-format-123",
        status: "running"
      }), { status: 201 });
    };

    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Test Invalid Submit JobID",
        description: "Desc",
        idempotencyKey: "idem-invalid-submit-jobid"
      },
      companyId: "comp-123"
    };

    const response = await plugin.definition.onApiRequest(input);
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, "bridge_dispatch_failed");

    // Verify issue was created but cancelled
    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].status, "cancelled");

    // Verify comment was posted and doesn't leak raw job ID
    const comments = await harness.ctx.issues.listComments(issues[0].id, "comp-123");
    assert.strictEqual(comments.length, 1);
    assert.ok(comments[0].body.includes("Failed to dispatch job"));
    assert.ok(!comments[0].body.includes("job-invalid-format-123"), "Should not leak the invalid jobId in comments");

    // Verify no active job state is stored
    const stateVal = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(!stateVal);

    console.log("  => Passed!");
  }

  // 12. CORRUPT PERSISTED ACTIVE-STATE JOB ID FAILS CLOSED
  console.log("- Running Test: Corrupt persisted active-state job ID fails closed without fetch or secret resolution...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });

    const mockIssue = {
      id: "iss-corrupt-test",
      companyId: "comp-123",
      projectId: "proj-456",
      title: "Corrupt Job",
      status: "todo"
    };

    harness.seed({
      issues: [mockIssue]
    });

    await plugin.definition.setup(harness.ctx);

    // If secrets.resolve or fetch are called, the test must fail!
    harness.ctx.secrets.resolve = async () => {
      assert.fail("secrets.resolve must not be called for corrupt job ID finalization");
    };

    mockFetchHandler = () => {
      assert.fail("Fetch must not be called for corrupt job ID finalization");
    };

    // Put invalid/corrupt job ID in state
    const corruptActiveJobVal = {
      jobId: "job-corrupt-format-12345",
      idempotencyKey: "idem-corrupt-123",
      issueId: "iss-corrupt-test",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running"
    };
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, corruptActiveJobVal);

    // Run finalizer job
    await harness.runJob("direct-task-finalizer");

    // Verify issue status is updated to blocked (fail closed)
    const updatedIssue = await harness.ctx.issues.get("iss-corrupt-test", "comp-123");
    assert.strictEqual(updatedIssue.status, "blocked");

    // Verify active job state is cleared
    const stateVal = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
    assert.ok(!stateVal);

    // Verify comment is posted without leaking the corrupt ID
    const comments = await harness.ctx.issues.listComments("iss-corrupt-test", "comp-123");
    assert.strictEqual(comments.length, 1);
    assert.ok(comments[0].body.includes("Invalid job state record"));
    assert.ok(!comments[0].body.includes("job-corrupt-format-12345"), "Should not leak corrupt jobId in comments");

    console.log("  => Passed!");
  }

  // 13. Action Context Refusal
  console.log("- Running Test: Action context refusal for non-user/missing-company contexts...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });
    await plugin.definition.setup(harness.ctx);
    let resolveCount = 0;
    harness.ctx.secrets.resolve = async () => { resolveCount++; return "token"; };

    const invalidContexts = [
      { actor: { type: "system", companyId: "comp-123" }, companyId: "comp-123", desc: "non-user type system" },
      { actor: { type: "agent", companyId: "comp-123" }, companyId: "comp-123", desc: "non-user type agent" },
      { actor: { type: "user", companyId: null }, companyId: null, desc: "missing companyId" },
      { actor: null, companyId: "comp-123", desc: "null actor" },
      { actor: { type: "user", userId: "", companyId: "comp-123" }, companyId: "comp-123", desc: "empty userId" },
      { actor: { type: "user", userId: "   ", companyId: "comp-123" }, companyId: "comp-123", desc: "whitespace userId" },
      { actor: { type: "user", userId: null, companyId: "comp-123" }, companyId: "comp-123", desc: "null userId" },
      { actor: { type: "user", companyId: "comp-123" }, companyId: "comp-123", desc: "missing userId" }
    ];

    const params = {
      projectId: "proj-456",
      role: "unreal-code",
      title: "Test",
      description: "Desc",
      idempotencyKey: "idem-action-refusal"
    };

    for (const contextCase of invalidContexts) {
      const response = await harness.performAction("direct-task-submit", params, {
        actor: contextCase.actor,
        companyId: contextCase.companyId
      });
      assert.strictEqual(response.ok, false);
      assert.strictEqual(response.code, "forbidden");
      assert.strictEqual(resolveCount, 0, `secrets.resolve must not be called: ${contextCase.desc}`);
    }

    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 0);
    console.log("  => Passed!");
  }

  // 14. Disabled valid board action
  console.log("- Running Test: Disabled valid board action returns launch disabled code...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: false,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });
    await plugin.definition.setup(harness.ctx);
    let resolveCount = 0;
    harness.ctx.secrets.resolve = async () => { resolveCount++; return "token"; };

    const params = {
      projectId: "proj-456",
      role: "unreal-code",
      title: "Test",
      description: "Desc",
      idempotencyKey: "idem-action-disabled"
    };

    const response = await harness.performAction("direct-task-submit", params, {
      actor: { type: "user", userId: "usr-789", companyId: "comp-123" },
      companyId: "comp-123"
    });

    assert.strictEqual(response.ok, false);
    assert.strictEqual(response.code, "direct_task_launch_disabled");
    assert.strictEqual(resolveCount, 0, "secrets.resolve must not be called when disabled");

    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 0);
    console.log("  => Passed!");
  }

  // 15. Valid board action uses host company scope
  console.log("- Running Test: Valid board action uses host company scope, creates one unassigned issue...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });
    harness.seed({
      projects: [{ id: "proj-456", companyId: "comp-123" }]
    });
    await plugin.definition.setup(harness.ctx);
    harness.ctx.secrets.resolve = async () => "token";

    let fetchCalled = false;
    mockFetchHandler = (urlStr, options) => {
      fetchCalled = true;
      const body = JSON.parse(options.body);
      assert.strictEqual(body.companyId, "comp-123", "Should force host companyId 'comp-123'");
      return new Response(JSON.stringify({
        jobId: "job-00000000000000000000000000000002",
        status: "running"
      }), { status: 201 });
    };

    const params = {
      companyId: "comp-spoofed", // Attempting a different company
      projectId: "proj-456",
      role: "unreal-code",
      title: "Action Test",
      description: "Action Desc",
      idempotencyKey: "idem-action-success"
    };

    const response = await harness.performAction("direct-task-submit", params, {
      actor: { type: "user", userId: "usr-789", companyId: "comp-123" },
      companyId: "comp-123" // Host-resolved
    });

    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.jobId, "job-00000000000000000000000000000002");
    assert.strictEqual(response.status, "running");
    assert.strictEqual(response.taskHref, null);

    // Verify it only returned safe structured fields (no secret references or bridge URLs)
    const allowedKeys = ["ok", "issueId", "identifier", "jobId", "status", "taskHref"];
    for (const key of Object.keys(response)) {
      assert.ok(allowedKeys.includes(key), `Returned key '${key}' is not allowed`);
    }

    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].title, "Action Test");
    assert.ok(!issues[0].assigneeAgentId);

    console.log("  => Passed!");
  }

  // 16. Duplicate action submission
  console.log("- Running Test: Duplicate action submission with same idempotency key returns cached result...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });
    harness.seed({
      projects: [{ id: "proj-456", companyId: "comp-123" }]
    });
    await plugin.definition.setup(harness.ctx);
    harness.ctx.secrets.resolve = async () => "token";

    let fetchCount = 0;
    mockFetchHandler = (urlStr, options) => {
      fetchCount++;
      return new Response(JSON.stringify({
        jobId: "job-00000000000000000000000000000003",
        status: "running"
      }), { status: 201 });
    };

    const params = {
      projectId: "proj-456",
      role: "unreal-code",
      title: "Duplicate Action Test",
      description: "Duplicate Action Desc",
      idempotencyKey: "idem-action-dup-123"
    };

    const response1 = await harness.performAction("direct-task-submit", params, {
      actor: { type: "user", userId: "usr-789", companyId: "comp-123" },
      companyId: "comp-123"
    });

    const response2 = await harness.performAction("direct-task-submit", params, {
      actor: { type: "user", userId: "usr-789", companyId: "comp-123" },
      companyId: "comp-123"
    });

    assert.strictEqual(response1.ok, true);
    assert.strictEqual(response2.ok, true);
    assert.strictEqual(response1.issueId, response2.issueId);
    assert.strictEqual(response1.jobId, response2.jobId);
    assert.strictEqual(fetchCount, 1, "Fetch must be called exactly once");

    const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
    assert.strictEqual(issues.length, 1);

    console.log("  => Passed!");
  }

  // 17. Action failures do not leak secrets
  console.log("- Running Test: Action failures do not leak secrets or raw bridge error...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "legacy-http-token",
directBridgeUrl: "http://127.0.0.1:3105",
        directBridgeSecretRef: "bridge-token"
      }
    });
    harness.seed({
      projects: [{ id: "proj-456", companyId: "comp-123" }]
    });
    await plugin.definition.setup(harness.ctx);
    
    const secretToken = "very-private-secret-action-999";
    harness.ctx.secrets.resolve = async () => secretToken;

    mockFetchHandler = () => {
      return new Response(JSON.stringify({ error: `Raw bridge error with secret: ${secretToken}` }), { status: 400 });
    };

    const params = {
      projectId: "proj-456",
      role: "unreal-code",
      title: "Error Action Test",
      description: "Error Action Desc",
      idempotencyKey: "idem-action-error-999"
    };

    const response = await harness.performAction("direct-task-submit", params, {
      actor: { type: "user", userId: "usr-789", companyId: "comp-123" },
      companyId: "comp-123"
    });

    assert.strictEqual(response.ok, false);
    const responseString = JSON.stringify(response);
    assert.ok(!responseString.includes(secretToken), "Action failure response must not contain the secret token");
    assert.ok(!responseString.includes("Raw bridge error"), "Action failure response must not contain raw bridge error details");

    console.log("  => Passed!");
  }

  // 18. Source/UI validation check
  console.log("- Running Test: Source/UI validation check of MemoryTab.jsx...");
  {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const uiFilePath = path.join(import.meta.dirname, "../src/ui/MemoryTab.jsx");
    const content = await fs.readFile(uiFilePath, "utf8");

    // 1. Confirms the tab calls the plugin action endpoint
    assert.ok(content.includes("/actions/direct-task-submit"), "MemoryTab.jsx must call the action endpoint '/actions/direct-task-submit'");
    assert.ok(content.includes("resJson?.data?.result"), "MemoryTab.jsx must support data-wrapped Paperclip action responses");

    // 2. Keeps Launch unavailable before valid preview
    assert.ok(content.includes("id=\"launch-btn\""), "MemoryTab.jsx must define the launch button");

    // 3. Uses/reuses an idempotency key
    assert.ok(content.includes("idempotencyKey"), "MemoryTab.jsx must reference and use an idempotencyKey");
    assert.ok(content.includes("agent-room-select"), "MemoryTab.jsx must provide an Agent Room selector");
    assert.ok(content.includes("parentId: this._currentDraft.parentId"), "MemoryTab.jsx must submit the selected Agent Room as parentId");
    assert.ok(content.includes("Controlled Local Execution"), "MemoryTab.jsx must describe the deployed controlled execution state");

    // 4. Never references a loopback bridge URL or secret field
    const hasLoopbackUrl = /127\.0\.0\.1|localhost|3105/i.test(content);
    assert.ok(!hasLoopbackUrl, "MemoryTab.jsx must never reference a loopback bridge URL");
    assert.ok(!content.includes("directBridgeSecretRef") && !content.includes("bridgeSecret") && !content.includes("super-secret"), "MemoryTab.jsx must never reference secret fields or bridge tokens");

    // 5. Source/UI contract test for companyPrefix + encodeURIComponent route construction and absence of forbidden patterns
    assert.ok(content.includes("companyPrefix"), "MemoryTab.jsx must reference companyPrefix");
    assert.ok(content.includes("encodeURIComponent(companyPrefix)"), "MemoryTab.jsx must use encodeURIComponent on companyPrefix");
    assert.ok(content.includes("encodeURIComponent(identifier)"), "MemoryTab.jsx must use encodeURIComponent on identifier");
    
    // Verify regex validation for prefix and identifier exists
    assert.ok(content.includes("/^[A-Za-z0-9_-]{1,80}$/.test(companyPrefix)"), "MemoryTab.jsx must validate companyPrefix regex");
    assert.ok(content.includes("/^[A-Za-z0-9_-]{1,120}$/.test(identifier)"), "MemoryTab.jsx must validate identifier regex");

    // Assert absence of `/issues/${body.issueId}`/hardcoded `CMP` route patterns
    assert.ok(!content.includes("issues/${body.issueId}"), "MemoryTab.jsx must not construct a route using body.issueId");
    assert.ok(!content.includes("issues/${issueId}"), "MemoryTab.jsx must not construct a route using issueId");
    assert.ok(!content.includes("/CMP/"), "MemoryTab.jsx must not contain hardcoded CMP route patterns");

    console.log("  => Passed!");
  }

  // 19. WINDOWS NAMED PIPE - INVALID PIPE NAME REJECTION
  console.log("- Running Test: Named Pipe - invalid pipe name is rejected...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "windows-named-pipe",
        directPipeName: "Bad Pipe/Name" // invalid characters
      }
    });

    await plugin.definition.setup(harness.ctx);

    // Mock secrets.resolve & fetch to assert they are never called
    let secretsCalled = 0;
    harness.ctx.secrets.resolve = async () => { secretsCalled++; return "token"; };

    let fetchCalled = 0;
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => { fetchCalled++; return new Response(); };

    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Test Pipe",
        description: "Desc",
        idempotencyKey: "idem-pipe-bad-name-123",
        parentId: "iss-parent-123"
      },
      companyId: "comp-123"
    };

    const response = await plugin.definition.onApiRequest(input);
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, "invalid_bridge_config");
    assert.strictEqual(secretsCalled, 0, "secrets.resolve must not be called in named pipe mode");
    assert.strictEqual(fetchCalled, 0, "fetch must not be called in named pipe mode");

    // Restore fetch
    globalThis.fetch = oldFetch;
    console.log("  => Passed!");
  }

  // 20. WINDOWS NAMED PIPE - PARENT CHILD HIERARCHY VALIDATION
  console.log("- Running Test: Named Pipe - parent issue validation & hierarchy...");
  {
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "windows-named-pipe",
        directPipeName: "ValidPipe"
      }
    });

    // Seed mock project
    harness.seed({
      projects: [
        { id: "proj-456", companyId: "comp-123" }
      ]
    });

    await plugin.definition.setup(harness.ctx);

    const baseBody = {
      companyId: "comp-123",
      projectId: "proj-456",
      role: "unreal-code",
      title: "Child Task",
      description: "Child Desc",
      idempotencyKey: "idem-pipe-parent-validation-123",
      parentId: "parent-123"
    };

    // Test cases for parent issue validation
    const parentTestCases = [
      {
        desc: "parent issue not found",
        parent: null,
        expectedError: "Parent issue not found."
      },
      {
        desc: "parent issue in different company",
        parent: { id: "parent-123", companyId: "comp-different", projectId: "proj-456", title: "[Agent Room] Code Worker", status: "todo" },
        expectedError: "Parent issue not found."
      },
      {
        desc: "parent issue in different project hub",
        parent: { id: "parent-123", companyId: "comp-123", projectId: "proj-different", title: "[Agent Room] Code Worker", status: "todo" },
        expectedError: "Parent issue company/project mismatch."
      },
      {
        desc: "parent issue is not a root issue",
        parent: { id: "parent-123", companyId: "comp-123", projectId: "proj-456", title: "[Agent Room] Code Worker", status: "todo", parentId: "grandparent-123" },
        expectedError: "Parent issue must be a root issue."
      },
      {
        desc: "parent issue in terminal status (done)",
        parent: { id: "parent-123", companyId: "comp-123", projectId: "proj-456", title: "[Agent Room] Code Worker", status: "done" },
        expectedError: "Parent issue is in a terminal status."
      },
      {
        desc: "parent issue is assigned to an agent",
        parent: { id: "parent-123", companyId: "comp-123", projectId: "proj-456", title: "[Agent Room] Code Worker", status: "todo", assigneeAgentId: "agent-123" },
        expectedError: "Parent issue must be unassigned."
      },
      {
        desc: "parent issue title does not begin with [Agent Room] ",
        parent: { id: "parent-123", companyId: "comp-123", projectId: "proj-456", title: "Code Worker", status: "todo" },
        expectedError: "Parent issue title must begin with '[Agent Room] '."
      },
      {
        desc: "unreal-code requires exactly [Agent Room] Code Worker",
        parent: { id: "parent-123", companyId: "comp-123", projectId: "proj-456", title: "[Agent Room] QA Worker", status: "todo" },
        expectedError: "unreal-code requires '[Agent Room] Code Worker' parent issue."
      }
    ];

    for (const tc of parentTestCases) {
      if (tc.parent) {
        harness.seed({ issues: [tc.parent] });
      } else {
        harness.seed({ issues: [] });
      }

      const input = {
        routeKey: "direct-tasks-submit",
        method: "POST",
        path: "/direct-tasks/submit",
        body: baseBody,
        companyId: "comp-123"
      };

      const response = await plugin.definition.onApiRequest(input);
      assert.strictEqual(response.status, 400, `Failed for case: ${tc.desc}`);
      assert.strictEqual(response.body.error, "invalid_input");
      assert.strictEqual(response.body.message, tc.expectedError);
    }

    const missingParentResponse = await originalOnApiRequest({
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Missing Parent",
        description: "Must fail before dispatch.",
        idempotencyKey: "idem-pipe-missing-parent-123"
      },
      companyId: "comp-123"
    });
    assert.strictEqual(missingParentResponse.status, 400);
    assert.strictEqual(missingParentResponse.body.error, "invalid_input");
    assert.match(missingParentResponse.body.message, /missing parentId/i);

    console.log("  => Passed!");
  }

  // 21. WINDOWS NAMED PIPE - SUCCESSFUL SUBMIT & ZERO SECRETS/FETCH & WIRE FORMAT
  console.log("- Running Test: Named Pipe - successful submit, wire format, 0 secrets/fetch...");
  {
    const pipeName = `TestPipe-${crypto.randomUUID()}`;
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "windows-named-pipe",
        directPipeName: pipeName
      }
    });

    const parentIssue = {
      id: "parent-ok-123",
      companyId: "comp-123",
      projectId: "proj-456",
      title: "[Agent Room] Code Worker",
      status: "todo",
      goalId: "goal-inherited-789"
    };

    harness.seed({
      projects: [{ id: "proj-456", companyId: "comp-123" }],
      issues: [parentIssue]
    });

    await plugin.definition.setup(harness.ctx);

    // Mock secrets.resolve and fetch to verify 0 calls
    let secretsCalled = 0;
    harness.ctx.secrets.resolve = async () => { secretsCalled++; return "token"; };

    let fetchCalled = 0;
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => { fetchCalled++; return new Response(); };

    // Setup mock named pipe server
    let serverReceivedData = null;
    const pipePath = `\\\\.\\pipe\\${pipeName}`;
    const server = net.createServer((socket) => {
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        if (buffer.includes("\n")) {
          const lines = buffer.split("\n");
          if (lines[0].trim() !== "") {
            serverReceivedData = JSON.parse(lines[0].trim());
            const responsePayload = {
              protocolVersion: 1,
              requestId: serverReceivedData.requestId,
              ok: true,
              statusCode: 201,
              body: {
                jobId: "job-00000000000000000000000000000101",
                status: "running"
              }
            };
            socket.write(JSON.stringify(responsePayload) + "\n", "utf8");
            socket.end();
          }
        }
      });
    });

    await new Promise((resolve) => server.listen(pipePath, resolve));

    const input = {
      routeKey: "direct-tasks-submit",
      method: "POST",
      path: "/direct-tasks/submit",
      body: {
        companyId: "comp-123",
        projectId: "proj-456",
        role: "unreal-code",
        title: "Test Pipe Task",
        description: "Pipe Desc",
        idempotencyKey: "idem-pipe-ok-123",
        parentId: "parent-ok-123"
      },
      companyId: "comp-123"
    };

    try {
      const response = await plugin.definition.onApiRequest(input);
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.jobId, "job-00000000000000000000000000000101");

      // Verify wire format received by server
      assert.ok(serverReceivedData);
      assert.strictEqual(serverReceivedData.protocolVersion, 1);
      assert.ok(serverReceivedData.requestId);
      assert.strictEqual(serverReceivedData.operation, "submit");
      assert.strictEqual(serverReceivedData.payload.role, "unreal-code");
      assert.strictEqual(serverReceivedData.payload.title, "Test Pipe Task");
      assert.strictEqual(serverReceivedData.payload.idempotencyKey, "idem-pipe-ok-123");

      // Verify no secrets/fetch resolved
      assert.strictEqual(secretsCalled, 0, "secrets.resolve must be called 0 times");
      assert.strictEqual(fetchCalled, 0, "fetch must be called 0 times");

      // Verify child issue creation and goal inheritance
      const issues = await harness.ctx.issues.list({ companyId: "comp-123" });
      assert.strictEqual(issues.length, 2);
      const childIssue = issues.find(i => i.id !== "parent-ok-123");
      assert.ok(childIssue);
      assert.strictEqual(childIssue.parentId, "parent-ok-123");
      assert.strictEqual(childIssue.goalId, "goal-inherited-789");
      assert.ok(!childIssue.assigneeAgentId, "Must never assign an agent");
    } finally {
      globalThis.fetch = oldFetch;
      await new Promise((resolve) => server.close(resolve));
    }

    console.log("  => Passed!");
  }

  // 22. WINDOWS NAMED PIPE - FINALIZER STATUS check
  console.log("- Running Test: Named Pipe - finalizer status check & 0 secrets/fetch...");
  {
    const pipeName = `TestPipe-${crypto.randomUUID()}`;
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "windows-named-pipe",
        directPipeName: pipeName
      }
    });

    const mockIssue = {
      id: "iss-pipe-final-123",
      companyId: "comp-123",
      projectId: "proj-456",
      title: "Direct Job Pipe",
      status: "todo"
    };

    harness.seed({
      issues: [mockIssue]
    });

    await plugin.definition.setup(harness.ctx);

    // Mock secrets.resolve and fetch to verify 0 calls
    let secretsCalled = 0;
    harness.ctx.secrets.resolve = async () => { secretsCalled++; return "token"; };

    let fetchCalled = 0;
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => { fetchCalled++; return new Response(); };

    // Setup active-job state
    const activeJobVal = {
      jobId: "job-00000000000000000000000000000202",
      idempotencyKey: "idem-pipe-final-123",
      issueId: "iss-pipe-final-123",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running",
      createdAt: new Date().toISOString()
    };
    await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobVal);

    // Setup mock server
    let serverReceivedData = null;
    const pipePath = `\\\\.\\pipe\\${pipeName}`;
    const server = net.createServer((socket) => {
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        if (buffer.includes("\n")) {
          const lines = buffer.split("\n");
          if (lines[0].trim() !== "") {
            serverReceivedData = JSON.parse(lines[0].trim());
            const responsePayload = {
              protocolVersion: 1,
              requestId: serverReceivedData.requestId,
              ok: true,
              statusCode: 200,
              body: {
                jobId: "job-00000000000000000000000000000202",
                status: "completed",
                exitCode: 0,
                closeSummary: "## Close Summary\nGoal: Verified named pipe."
              }
            };
            socket.write(JSON.stringify(responsePayload) + "\n", "utf8");
            socket.end();
          }
        }
      });
    });

    await new Promise((resolve) => server.listen(pipePath, resolve));

    try {
      await harness.runJob("direct-task-finalizer");

      // Verify wire format
      assert.ok(serverReceivedData);
      assert.strictEqual(serverReceivedData.operation, "status");
      assert.strictEqual(serverReceivedData.jobId, "job-00000000000000000000000000000202");

      // Verify issue waits for user review
      const updatedIssue = await harness.ctx.issues.get("iss-pipe-final-123", "comp-123");
      assert.strictEqual(updatedIssue.status, "in_review");

      // Verify comment contains marker
      const comments = await harness.ctx.issues.listComments("iss-pipe-final-123", "comp-123");
      assert.ok(comments.length > 0);
      assert.ok(comments[0].body.includes("direct-task-bridge-marker: job-00000000000000000000000000000202 - in_review"));

      // Verify no secrets/fetch resolved
      assert.strictEqual(secretsCalled, 0, "secrets.resolve must not be called");
      assert.strictEqual(fetchCalled, 0, "fetch must not be called");
    } finally {
      globalThis.fetch = oldFetch;
      await new Promise((resolve) => server.close(resolve));
    }

    console.log("  => Passed!");
  }

  // 23. WINDOWS NAMED PIPE - MALFORMED/MISMATCHED/OVERSIZED REJECTIONS
  console.log("- Running Test: Named Pipe - malformed, oversized, or mismatched responses fail closed...");
  {
    const pipeName = `TestPipe-${crypto.randomUUID()}`;
    const harness = createTestHarness({
      manifest,
      config: {
        enableDirectTaskLaunch: true,
        directTaskTransport: "windows-named-pipe",
        directPipeName: pipeName
      }
    });

    const mockIssue = {
      id: "iss-pipe-fail-123",
      companyId: "comp-123",
      projectId: "proj-456",
      title: "Direct Job Pipe Failures",
      status: "todo"
    };

    harness.seed({
      issues: [mockIssue]
    });

    await plugin.definition.setup(harness.ctx);

    const activeJobVal = {
      jobId: "job-00000000000000000000000000000303",
      idempotencyKey: "idem-pipe-fail-123",
      issueId: "iss-pipe-fail-123",
      companyId: "comp-123",
      projectId: "proj-456",
      status: "running",
      createdAt: new Date().toISOString()
    };

    // Test cases for pipe protocol failures
    const protocolFailureCases = [
      {
        desc: "mismatched requestId",
        responsePayload: (requestId) => ({
          protocolVersion: 1,
          requestId: "mismatched-request-id-123",
          ok: true,
          statusCode: 200,
          body: { jobId: "job-00000000000000000000000000000303", status: "completed", exitCode: 0, closeSummary: "## Close Summary" }
        })
      },
      {
        desc: "unsupported protocol version",
        responsePayload: (requestId) => ({
          protocolVersion: 2,
          requestId,
          ok: true,
          statusCode: 200,
          body: { jobId: "job-00000000000000000000000000000303", status: "completed", exitCode: 0, closeSummary: "## Close Summary" }
        })
      },
      {
        desc: "inconsistent response envelope",
        responsePayload: (requestId) => ({
          protocolVersion: 1,
          requestId,
          ok: true,
          statusCode: 400,
          body: { error: "invalid_request" }
        })
      },
      {
        desc: "malformed JSON",
        rawResponse: "Not a JSON line\n"
      },
      {
        desc: "oversized response",
        rawResponse: "a".repeat(128 * 1024) + "\n" // 128 KiB, exceeds the 64 KiB client limit
      }
    ];

    for (const tc of protocolFailureCases) {
      await harness.ctx.state.set({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" }, activeJobVal);
      await harness.ctx.issues.update("iss-pipe-fail-123", { status: "todo" }, "comp-123");

      const pipePath = `\\\\.\\pipe\\${pipeName}`;
      const server = net.createServer((socket) => {
        let buffer = "";
        socket.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          if (buffer.includes("\n")) {
            const lines = buffer.split("\n");
            if (lines[0].trim() !== "") {
              const req = JSON.parse(lines[0].trim());
              if (tc.rawResponse) {
                socket.write(tc.rawResponse, "utf8");
              } else {
                const res = tc.responsePayload(req.requestId);
                socket.write(JSON.stringify(res) + "\n", "utf8");
              }
              socket.end();
            }
          }
        });
      });

      await new Promise((resolve) => server.listen(pipePath, resolve));

      try {
        await harness.runJob("direct-task-finalizer");

        // Verify issue is marked blocked (fail closed)
        const updatedIssue = await harness.ctx.issues.get("iss-pipe-fail-123", "comp-123");
        assert.strictEqual(updatedIssue.status, "blocked", `Should fail closed for case: ${tc.desc}`);

        // Verify active job is cleared
        const stateVal = harness.getState({ scopeKind: "instance", namespace: "direct-task-bridge", stateKey: "active-job" });
        assert.ok(!stateVal);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }

    console.log("  => Passed!");
  }

  console.log("\nALL DIRECT TASK INTEGRATION TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

