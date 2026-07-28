import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { chooseTaskWorkspace, handleCodexServerRequest, handleProjectTasksView, handleProjectWorkplaneView, handleRoomTaskSummary, handleRoomWorkspaceView, handleTaskOwnerFeedback, handleTaskRoomView, loadAgentInstructions, parseState, provisionProjectAgentRooms, serializeState, setActiveThreadContextForTest, workspaceKindForProjectWorkspace } = await import("../dist/worker.js");

const companyId = "company-1";
const projectId = "project-1";
const roomId = "room-1";
const ctoAgent = { id: "agent-cto", name: "Primary CTO", role: "cto", status: "idle", adapterConfig: { cwd: "C:\\missing-workspace" } };
const codeWorker = { id: "worker-1", name: "Code Worker", role: "engineer", status: "idle", adapterConfig: {} };
const existingTaskId = "task-existing";
const createdTaskId = "task-created";
const issues = new Map([
  [roomId, {
    id: roomId,
    companyId,
    projectId,
    title: ctoAgent.name,
    status: "todo",
    parentId: null,
    assigneeAgentId: null,
    originKind: "plugin:local.room-chat:agent-room-provisioning",
    originId: `project:${projectId}:agent-room:${ctoAgent.id}`
  }],
  [existingTaskId, {
    id: existingTaskId,
    companyId,
    identifier: "CMP-100",
    projectId,
    parentId: roomId,
    title: "Existing player change",
    status: "in_progress",
    description: "Existing scope\n\nAffected Paths:\n- Source/Player.cpp\n"
  }]
]);
const comments = new Map();
const documents = new Map();
const documentWrites = [];
const apiOperations = [];
let createdCount = 0;
let failAgentListRequest = false;
const originalFetch = globalThis.fetch;
const projectWorkspaces = [
  { id: "design-workspace", name: "Design repository", path: "C:\\workspace\\design", isPrimary: true },
  { id: "implementation-workspace", name: "Implementation repository", path: "C:\\workspace\\implementation", isPrimary: false }
];

assert.equal(chooseTaskWorkspace(projectWorkspaces, "implementation", "design-workspace").id, "implementation-workspace");
assert.equal(chooseTaskWorkspace(projectWorkspaces, "art", "design-workspace").id, "implementation-workspace");

const gameDesignParentWorkspaces = [
  {
    id: "school-design-workspace",
    name: "School Arcade Design Workspace",
    path: "C:\\Users\\young\\Documents\\Game Design\\school-arcade-design",
    isPrimary: true
  },
  {
    id: "school-implementation-workspace",
    name: "School Arcade Unity Implementation",
    path: "C:\\Users\\young\\Documents\\Game Design\\school-arcade-unity",
    isPrimary: false
  }
];
assert.equal(workspaceKindForProjectWorkspace(gameDesignParentWorkspaces[0]), "design");
assert.equal(workspaceKindForProjectWorkspace(gameDesignParentWorkspaces[1]), "implementation");
assert.equal(workspaceKindForProjectWorkspace({ id: "research-workspace", name: "Research and references", path: "C:\\workspace\\research" }), "design");
assert.equal(workspaceKindForProjectWorkspace({ id: "build-workspace", name: "Build output", path: "C:\\workspace\\build" }), "implementation");
assert.equal(
  chooseTaskWorkspace(gameDesignParentWorkspaces, "art", "school-implementation-workspace").id,
  "school-implementation-workspace"
);

assert.match(loadAgentInstructions({ adapterConfig: { instructionsFilePath: "relative/AGENTS.md" } }), /No managed Agent AGENTS\.md/);
assert.match(loadAgentInstructions({ adapterConfig: { instructionsFilePath: "C:\\missing\\AGENTS.md" } }), /No managed Agent AGENTS\.md/);

globalThis.fetch = async (url, init = {}) => {
  const requestUrl = new URL(String(url));
  const method = String(init.method || "GET").toUpperCase();
  const pathname = decodeURIComponent(requestUrl.pathname);
  const requestBody = init.body ? JSON.parse(String(init.body)) : null;
  const respond = (body, status = 200) => new Response(body === null ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

  if (method === "GET" && pathname === `/api/companies/${companyId}/agents`) {
    if (failAgentListRequest) {
      failAgentListRequest = false;
      return respond({ error: "temporary transport failure" }, 503);
    }
    return respond([ctoAgent, codeWorker]);
  }

  if (method === "GET" && pathname === `/api/companies/${companyId}/issues`) {
    const requestedProjectId = requestUrl.searchParams.get("projectId");
    const projectIssues = [...issues.values()].filter((issue) => !requestedProjectId || issue.projectId === requestedProjectId);
    return respond(projectIssues);
  }

  if (method === "POST" && pathname === `/api/companies/${companyId}/issues`) {
    apiOperations.push({ kind: "create", body: requestBody });
    createdCount += 1;
    const created = {
      id: createdTaskId,
      identifier: "CMP-101",
      companyId,
      ...requestBody
    };
    issues.set(created.id, created);
    return respond(created, 201);
  }

  if (method === "GET" && pathname === `/api/projects/${projectId}/workspaces`) {
    return respond(projectWorkspaces);
  }

  const documentMatch = pathname.match(/^\/api\/issues\/([^/]+)\/documents\/([^/]+)$/);
  if (documentMatch) {
    const [, issueId, key] = documentMatch;
    const documentKey = `${issueId}:${key}`;
    if (method === "GET") {
      return documents.has(documentKey) ? respond(documents.get(documentKey)) : respond({ error: "not found" }, 404);
    }
    if (method === "PUT") {
      apiOperations.push({ kind: "document", issueId, key });
      const document = {
        id: `document-${documents.size + 1}`,
        issueId,
        key,
        ...requestBody,
        latestRevisionId: `revision-${documents.size + 1}`
      };
      documents.set(documentKey, document);
      documentWrites.push({ url: String(url), body: requestBody });
      return respond(document);
    }
  }

  const commentsMatch = pathname.match(/^\/api\/issues\/([^/]+)\/comments$/);
  if (commentsMatch) {
    const issueId = commentsMatch[1];
    if (method === "GET") return respond(comments.get(issueId) ?? []);
    if (method === "POST") {
      apiOperations.push({ kind: "comment", issueId, body: requestBody.body });
      const item = { id: `comment-${(comments.get(issueId) ?? []).length + 1}`, body: requestBody.body };
      comments.set(issueId, [...(comments.get(issueId) ?? []), item]);
      return respond(item, 201);
    }
  }

  const issueMatch = pathname.match(/^\/api\/issues\/([^/]+)$/);
  if (issueMatch) {
    const issueId = issueMatch[1];
    if (method === "GET") return issues.has(issueId) ? respond(issues.get(issueId)) : respond({ error: "not found" }, 404);
    if (method === "PATCH") {
      apiOperations.push({ kind: "activate", issueId, body: requestBody });
      const issue = issues.get(issueId);
      if (!issue) return respond({ error: "not found" }, 404);
      const { comment: commentBody, ...patch } = requestBody;
      Object.assign(issue, patch);
      let comment = null;
      if (commentBody) {
        comment = { id: `comment-${(comments.get(issueId) ?? []).length + 1}`, body: commentBody };
        comments.set(issueId, [...(comments.get(issueId) ?? []), comment]);
      }
      return respond({ ...issue, comment });
    }
  }

  throw new Error(`Unexpected Paperclip API request: ${method} ${requestUrl}`);
};

const ctx = {
  config: { get: async () => ({ enableTaskAssignment: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async (issueId) => issues.get(issueId) ?? null,
    list: async () => [...issues.values()],
    create: async (input) => {
      createdCount += 1;
      const created = {
        id: createdTaskId,
        identifier: "CMP-101",
        projectId: input.projectId,
        parentId: input.parentId,
        title: input.title,
        description: input.description,
        status: input.status,
        assigneeAgentId: input.assigneeAgentId,
        blockedByIssueIds: input.blockedByIssueIds
      };
      issues.set(created.id, created);
      return created;
    },
    update: async (issueId, input) => {
      const issue = issues.get(issueId);
      Object.assign(issue, input);
      return issue;
    },
    createComment: async (issueId, body) => {
      const item = { id: `comment-${(comments.get(issueId) ?? []).length + 1}`, body };
      comments.set(issueId, [...(comments.get(issueId) ?? []), item]);
      return item;
    },
    listComments: async (issueId) => comments.get(issueId) ?? [],
    documents: { get: async () => null }
  },
  agents: {
    list: async () => [ctoAgent, codeWorker],
    get: async (agentId) => [ctoAgent, codeWorker].find((agent) => agent.id === agentId) ?? null
  },
  projects: {
    get: async () => ({ id: projectId, name: "Workspace Test" })
  }
};

setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: roomId,
  agentId: ctoAgent.id,
  agentName: ctoAgent.name,
  agentRole: ctoAgent.role,
  workplaneRole: "cto",
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent"
});

const expiredToolCtx = new Proxy({}, {
  get() {
    throw new Error("expired invocation scope");
  }
});

const runTool = async (tool, args) => {
  const response = await handleCodexServerRequest(expiredToolCtx, {
    method: "item/tool/call",
    params: { threadId: "thread-1", namespace: "paperclip", tool, arguments: args, callId: `call-${tool}` }
  });
  return JSON.parse(response.contentItems[0].text);
};

ctx.projects.listWorkspaces = async () => projectWorkspaces;

// A retained Codex app-server client sends dynamic tool calls after its first
// plugin invocation has expired. The active Room Job must provide the current
// Core capability scope instead of falling back to an unauthenticated HTTP
// request against an authenticated Owner Host.
const currentSchedulerScope = {
  ...ctx,
  issues: {
    ...ctx.issues,
    documents: {
      ...ctx.issues.documents,
      upsert: async (input) => ({ id: "core-document", ...input })
    }
  },
  projects: { ...ctx.projects },
  agents: { ...ctx.agents }
};
setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: roomId,
  agentId: ctoAgent.id,
  agentName: ctoAgent.name,
  agentRole: ctoAgent.role,
  workplaneRole: "cto",
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent",
  invocationCtx: currentSchedulerScope
});

const workers = await runTool("list_workers", {});
assert.deepEqual(workers.map((agent) => agent.id), [codeWorker.id]);

setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: "image-worker-room",
  agentId: "image-worker-agent",
  agentName: "Image Worker",
  agentRole: "designer",
  workplaneRole: "image-worker",
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent"
});
const workerTaskCreation = await runTool("create_task", {
  title: "Worker must not delegate",
  description: "This call must be rejected by the managed company role boundary.",
  assigneeAgentId: codeWorker.id,
  maturity: "exploration"
});
assert.equal(workerTaskCreation.ok, false);
assert.equal(workerTaskCreation.code, "agent_cannot_create_tasks");
const workerMemoryWrite = await runTool("memory_propose", { content: "A Worker must not propose organization memory by default." });
assert.equal(workerMemoryWrite.ok, false);
assert.equal(workerMemoryWrite.code, "memory_write_disabled");

setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: roomId,
  agentId: ctoAgent.id,
  agentName: ctoAgent.name,
  agentRole: ctoAgent.role,
  workplaneRole: "cto",
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent"
});

const activeTasks = await runTool("list_active_tasks", {});
assert.deepEqual(activeTasks.map((task) => task.id), [existingTaskId]);

setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: roomId,
  agentId: ctoAgent.id,
  agentName: ctoAgent.name,
  agentRole: ctoAgent.role,
  workplaneRole: "cto",
  workplanePolicy: { roleId: "cto", kind: "lead", assignableRoleIds: ["worker"], memoryAccess: "none", reviewMode: "automatic" },
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent"
});
const disabledMemoryRead = await runTool("memory_search", { query: "Project decision" });
assert.equal(disabledMemoryRead.ok, false);
assert.equal(disabledMemoryRead.code, "memory_read_disabled");

setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: roomId,
  agentId: ctoAgent.id,
  agentName: ctoAgent.name,
  agentRole: ctoAgent.role,
  workplaneRole: "cto",
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent"
});

failAgentListRequest = true;
const transportFailure = await runTool("list_workers", {});
assert.equal(transportFailure.ok, false);
assert.equal(transportFailure.code, "paperclip_tool_request_failed");
assert.match(transportFailure.message, /HTTP 503/);

const preview = await runTool("preview_task", { affectedPaths: ["Source/Player.cpp"] });
assert.equal(preview.ok, true);
assert.equal(preview.conflicts.length, 1);
assert.equal(preview.conflicts[0].id, existingTaskId);

const parentPathPreview = await runTool("preview_task", { affectedPaths: ["source"] });
assert.equal(parentPathPreview.conflicts.length, 1);
assert.equal(parentPathPreview.conflicts[0].id, existingTaskId);

const conflict = await runTool("create_task", {
  title: "Change player behavior",
  description: "Implement approved player behavior.",
  assigneeAgentId: codeWorker.id,
  maturity: "committed implementation",
  taskType: "implementation",
  affectedPaths: ["C:\\workspace\\implementation\\Source\\Player.cpp"],
  designReferences: ["Design/Player.md"]
});
assert.equal(conflict.ok, false);
assert.equal(conflict.code, "task_path_conflict");
assert.equal(createdCount, 0);

setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: roomId,
  agentId: ctoAgent.id,
  agentName: ctoAgent.name,
  agentRole: ctoAgent.role,
  workplaneRole: "cto",
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent",
  workspaceProfile: {
    configured: true,
    taskTypes: [{ id: "research", label: "Research and discovery" }],
    taskWorkspaceIds: { research: "design-workspace" }
  }
});

const created = await runTool("create_task", {
  title: "Change player behavior",
  description: "Implement approved player behavior.",
  assigneeAgentId: codeWorker.id,
  maturity: "committed implementation",
  taskType: "research",
  projectWorkspaceId: "design-workspace",
  affectedPaths: ["Source/Player.cpp"],
  designReferences: ["Design/Player.md"],
  acceptanceCriteria: ["Player behavior matches the approved design."],
  verification: ["Run the focused test."],
  blockedByIssueIds: [existingTaskId]
});
assert.equal(created.ok, true);
assert.equal(created.task.id, createdTaskId);
assert.equal(issues.get(createdTaskId).status, "todo");
assert.equal(issues.get(createdTaskId).assigneeAgentId, codeWorker.id);
assert.deepEqual(issues.get(createdTaskId).blockedByIssueIds, [existingTaskId]);
assert.deepEqual(apiOperations.map((operation) => operation.kind), ["create", "document", "comment", "activate", "document"]);
assert.equal(apiOperations[0].body.status, "backlog");
assert.equal(apiOperations[0].body.assigneeAgentId, null);
assert.equal(apiOperations[0].body.projectWorkspaceId, "design-workspace");
assert.equal(issues.get(createdTaskId).projectWorkspaceId, "design-workspace");
assert.deepEqual(apiOperations[0].body.executionPolicy, {
  mode: "normal",
  commentRequired: true,
  stages: [],
  failure: {
    automaticRetry: false,
    preserveAssignee: true,
    wakeRecoveryOwner: false
  }
});
assert.equal(apiOperations[3].body.status, "todo");
assert.equal(apiOperations[3].body.assigneeAgentId, codeWorker.id);
assert.equal(documentWrites.length, 2);
const taskStateWrite = documentWrites.find((write) => /\/api\/issues\/task-created\/documents\/TASK_ROOM_STATE$/.test(write.url));
const workStateWrite = documentWrites.find((write) => /\/api\/issues\/room-1\/documents\/ROOM_WORK_STATE$/.test(write.url));
assert.ok(taskStateWrite);
assert.ok(workStateWrite);
assert.equal(parseState(taskStateWrite.body.body).owningAgentName, ctoAgent.name);
assert.equal(parseState(taskStateWrite.body.body).maturity, "committed implementation");
assert.equal(parseState(taskStateWrite.body.body).projectWorkspaceId, "design-workspace");
assert.equal(parseState(taskStateWrite.body.body).taskType, "research");
assert.equal(parseState(taskStateWrite.body.body).review.mode, "automatic");
assert.deepEqual(parseState(taskStateWrite.body.body).declaredAffectedPaths, ["Source/Player.cpp"]);
assert.match(comments.get(createdTaskId)[0].body, /- Source\/Player\.cpp/);
assert.match(comments.get(createdTaskId)[0].body, /Affected Paths \(relative to the selected Project Workspace\)/);
assert.match(apiOperations[0].body.description, /Affected Paths \(relative to the selected Project Workspace\)/);
assert.doesNotMatch(comments.get(createdTaskId)[0].body, /\\research|\\implementation/);
assert.equal(parseState(workStateWrite.body.body).waitingFor.kind, "worker");
assert.match(comments.get(createdTaskId)[0].body, /Owner Agent: Primary CTO/);

const outsideWorkspace = await runTool("create_task", {
  title: "Reject cross-workspace path",
  description: "This Task must not be created.",
  assigneeAgentId: codeWorker.id,
  maturity: "exploration",
  taskType: "implementation",
  affectedPaths: ["C:\\workspace\\design\\Design\\Only.md"],
  designReferences: [],
  acceptanceCriteria: ["The tool rejects the path before Task creation."],
  verification: ["Inspect the tool response."]
});
assert.equal(outsideWorkspace.ok, false);
assert.equal(outsideWorkspace.code, "affected_path_outside_workspace");
assert.equal(createdCount, 1);

const taskStateBody = taskStateWrite.body.body;
ctx.projects.listWorkspaces = undefined;
ctx.issues.documents.get = async (issueId, key) => (
  issueId === createdTaskId && key === "TASK_ROOM_STATE" ? { body: taskStateBody } : null
);
const taskView = await handleTaskRoomView(ctx, { companyId, issueId: createdTaskId });
assert.equal(taskView.task.id, createdTaskId);
assert.equal(taskView.state.owningAgentId, ctoAgent.id);

const roomTaskSummary = await handleRoomTaskSummary(ctx, { companyId, issueId: roomId });
assert.equal(roomTaskSummary.room.id, roomId);
assert.equal(roomTaskSummary.tasks.length, 2);
assert.equal(roomTaskSummary.activeTaskCount, 2);
assert.equal(roomTaskSummary.tasks.find((task) => task.id === createdTaskId).assigneeAgent.name, codeWorker.name);
assert.equal(roomTaskSummary.referencedFiles.some((file) => file.path === "Design/Player.md"), true);

const roomWorkspace = await handleRoomWorkspaceView(ctx, { companyId, issueId: roomId });
assert.equal(roomWorkspace.project.name, "Workspace Test");
assert.equal(roomWorkspace.workspaces[0].name, "Primary CTO 작업 폴더");
assert.equal(roomWorkspace.workspaces[0].available, false);

const disabledFeedback = await handleTaskOwnerFeedback({ ...ctx, config: { get: async () => ({ enableCodexRooms: false }) } }, {
  issueId: createdTaskId,
  message: "Please review the scope."
}, { actor: { type: "user" }, companyId });
assert.equal(disabledFeedback.ok, false);
assert.equal(disabledFeedback.code, "codex_rooms_disabled");

const manager = { id: "agent-manager", name: "Manager", role: "ceo", status: "idle", adapterConfig: {} };
const reflectionCoach = {
  id: "agent-reflection-coach",
  name: "Reflection Coach",
  role: "general",
  status: "paused",
  adapterConfig: {},
  metadata: { paperclipBuiltInAgent: { key: "reflection-coach" } }
};
const provisionedIssues = [{
  id: "existing-manager", projectId: "project-provision", title: "Manager", status: "todo", parentId: null,
  assigneeAgentId: null, assigneeUserId: null,
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: "project:project-provision:agent-room:agent-manager"
}, {
  id: "existing-reflection-coach", projectId: "project-provision", title: "Reflection Coach", status: "todo", parentId: null,
  assigneeAgentId: null, assigneeUserId: null,
  originKind: "plugin:local.room-chat:operation:agent-room",
  originId: "project:project-provision:agent-room:agent-reflection-coach"
}];
const provisionCtx = {
  agents: { list: async () => [manager, ctoAgent, codeWorker, reflectionCoach] },
  issues: {
    list: async () => provisionedIssues,
    create: async (input) => {
      const issue = { id: `room-${provisionedIssues.length}`, identifier: `CMP-${provisionedIssues.length}`, ...input };
      provisionedIssues.push(issue);
      return issue;
    },
    update: async (id, patch) => {
      const issue = provisionedIssues.find((candidate) => candidate.id === id);
      Object.assign(issue, patch);
      return issue;
    }
  }
};
const provisioned = await provisionProjectAgentRooms(provisionCtx, companyId, "project-provision");
assert.equal(provisioned.created.length, 2);
assert.equal(provisioned.retired.length, 1);
assert.deepEqual(provisioned.created.map((room) => room.title).sort(), ["Code Worker", "Primary CTO"]);
assert.ok(provisionedIssues.every((issue) => issue.parentId === null && issue.assigneeAgentId === null));
assert.equal(provisionedIssues.find((issue) => issue.id === "existing-reflection-coach").status, "cancelled");
assert.equal(provisionedIssues.some((issue) => issue.title === "Reflection Coach" && issue.status !== "cancelled"), false);
const secondProvision = await provisionProjectAgentRooms(provisionCtx, companyId, "project-provision");
assert.equal(secondProvision.created.length, 0);
assert.equal(secondProvision.retired.length, 0);
assert.equal(provisionedIssues.length, 4);
codeWorker.status = "terminated";
const retiredWorkerRoom = await provisionProjectAgentRooms(provisionCtx, companyId, "project-provision");
assert.equal(retiredWorkerRoom.created.length, 0);
assert.equal(retiredWorkerRoom.retired.length, 1);
assert.equal(provisionedIssues.find((issue) => issue.title === "Code Worker").status, "cancelled");
codeWorker.status = "idle";

const workplaneAgents = [manager, { id: "agent-designer", name: "Designer", role: "designer", status: "idle", adapterConfig: {} }];
const workplaneIssues = [
  {
    id: "manager-room", identifier: "CMP-201", projectId: "project-workplane", parentId: null,
    title: "Manager", status: "todo", assigneeAgentId: null, assigneeUserId: null,
    originKind: "plugin:local.room-chat:agent-room-provisioning",
    originId: "project:project-workplane:agent-room:agent-manager"
  },
  {
    id: "designer-room", identifier: "CMP-202", projectId: "project-workplane", parentId: null,
    title: "Designer", status: "todo", assigneeAgentId: null, assigneeUserId: null,
    originKind: "plugin:local.room-chat:agent-room-provisioning",
    originId: "project:project-workplane:agent-room:agent-designer"
  },
  {
    id: "legacy-role-room", identifier: "CMP-203", projectId: "project-workplane", parentId: null,
    title: "[Agent Room] CTO", status: "todo", assigneeAgentId: null, assigneeUserId: null,
    originKind: "plugin:local.room-chat:project-room-provisioning"
  },
  {
    id: "task-in-room", identifier: "CMP-204", projectId: "project-workplane", parentId: "manager-room",
    title: "Draft HUD layout", status: "in_review", assigneeAgentId: codeWorker.id
  },
  {
    id: "root-task", identifier: "CMP-205", projectId: "project-workplane", parentId: null,
    title: "Legacy project task", status: "todo", assigneeAgentId: null
  }
];
const workplane = await handleProjectWorkplaneView({
  projects: { get: async () => ({ id: "project-workplane", name: "Workplane Test" }) },
  agents: { list: async () => workplaneAgents },
  issues: {
    list: async () => workplaneIssues,
    create: async () => { throw new Error("All hired Agents already have Rooms."); },
    update: async (issueId, patch) => {
      const issue = workplaneIssues.find((entry) => entry.id === issueId);
      Object.assign(issue, patch);
      return issue;
    }
  }
}, { companyId, projectId: "project-workplane" });
assert.equal(workplane.provisionedAgentRoomCount, 0);
assert.equal(workplane.retiredLegacyRoleRoomCount, 1);
assert.equal(workplane.activeLegacyRoleRoomCount, 0);
assert.equal(workplane.rooms.length, 2);
assert.deepEqual(workplane.rooms.map((room) => room.title).sort(), ["Designer", "Manager"]);
assert.equal(workplane.taskCount, 2);

const taskBoardWithoutProject = await handleProjectTasksView({
  projects: { list: async () => [{ id: "project-workplane", name: "Workplane Test" }] },
  issues: { list: async () => { throw new Error("Task Board must not load Tasks before project selection."); } }
}, { companyId });
assert.equal(taskBoardWithoutProject.requiresProjectSelection, true);
assert.equal(taskBoardWithoutProject.selectedProjectId, null);
assert.equal(taskBoardWithoutProject.tasks.length, 0);

const taskBoard = await handleProjectTasksView({
  projects: { list: async () => [{ id: "project-workplane", name: "Workplane Test" }] },
  issues: { list: async () => workplaneIssues }
}, { companyId, projectId: "project-workplane" });
assert.equal(taskBoard.requiresProjectSelection, false);
assert.equal(taskBoard.selectedProjectId, "project-workplane");
assert.deepEqual(taskBoard.project, { id: "project-workplane", name: "Workplane Test" });
assert.equal(taskBoard.tasks.length, 2);
assert.equal(taskBoard.tasks.find((task) => task.id === "task-in-room").parentRoom.id, "manager-room");
assert.ok(taskBoard.tasks.every((task) => task.project.id === "project-workplane"));

const reviewedTaskState = parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body);
reviewedTaskState.review = {
  required: "owning_agent",
  status: "owner_review_requested",
  workerReportCommentId: "worker-report-before-feedback",
  workerReportFingerprint: "report-fingerprint-before-feedback",
  updatedAt: new Date().toISOString()
};
reviewedTaskState.ownerNotification = {
  status: "completed",
  reportCommentId: "worker-report-before-feedback",
  reportFingerprint: "report-fingerprint-before-feedback",
  resultCommentId: "owner-report-before-feedback"
};
documents.set(`${createdTaskId}:TASK_ROOM_STATE`, {
  ...documents.get(`${createdTaskId}:TASK_ROOM_STATE`),
  body: serializeState(reviewedTaskState)
});
issues.get(createdTaskId).status = "in_review";
const feedback = await runTool("post_task_feedback", { taskId: createdTaskId, message: "Keep the change inside the approved scope." });
assert.equal(feedback.ok, true);
assert.match(comments.get(createdTaskId).at(-1).body, /Primary CTO Feedback/);
assert.equal(issues.get(createdTaskId).status, "todo");
assert.equal(issues.get(createdTaskId).assigneeAgentId, codeWorker.id);
const feedbackOperation = [...apiOperations].reverse().find((operation) => operation.kind === "activate");
assert.equal(feedbackOperation.kind, "activate");
assert.equal(feedbackOperation.body.status, "todo");
assert.match(feedbackOperation.body.comment, /Primary CTO Feedback/);
const restartedTaskState = parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body);
assert.equal(restartedTaskState.review.status, "correction_requested");
assert.equal(restartedTaskState.review.correctionRound, 1);
assert.equal(restartedTaskState.review.feedbackCommentId, comments.get(createdTaskId).at(-1).id);
assert.equal(restartedTaskState.review.workerReportCommentId, undefined);
assert.equal(restartedTaskState.ownerNotification, undefined);
assert.equal(restartedTaskState.reviewHistory.at(-1).workerReportCommentId, "worker-report-before-feedback");
assert.equal(restartedTaskState.reviewHistory.at(-1).outcome, "correction_requested");
const feedbackWorkState = parseState(documents.get(`${roomId}:ROOM_WORK_STATE`).body);
assert.equal(feedbackWorkState.waitingFor.kind, "worker");
assert.equal(feedbackWorkState.waitingFor.taskId, createdTaskId);

const taskStateForVerification = parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body);
taskStateForVerification.review.workerReportCommentId = "worker-report-1";
taskStateForVerification.review.acceptedByAgentId = "legacy-owner";
taskStateForVerification.review.acceptedByAgentName = "Legacy Owner";
taskStateForVerification.review.acceptedAt = "2026-07-01T00:00:00.000Z";
documents.set(`${createdTaskId}:TASK_ROOM_STATE`, {
  ...documents.get(`${createdTaskId}:TASK_ROOM_STATE`),
  body: serializeState(taskStateForVerification)
});
issues.get(createdTaskId).status = "in_review";
const completed = await runTool("complete_task", { taskId: createdTaskId, reviewSummary: "All declared acceptance criteria and verification evidence passed." });
assert.equal(completed.ok, true);
assert.equal(issues.get(createdTaskId).status, "done");
assert.equal(completed.verifiedByAgentId, ctoAgent.id);
assert.equal(completed.userApprovalGranted, false);
const verifiedTaskState = parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body);
assert.equal(verifiedTaskState.review.status, "owner_verified");
assert.equal(verifiedTaskState.review.verifiedByAgentId, ctoAgent.id);
assert.equal(verifiedTaskState.review.verificationSummary, "All declared acceptance criteria and verification evidence passed.");
assert.equal(verifiedTaskState.review.acceptedByAgentId, undefined);
assert.equal(verifiedTaskState.review.acceptedByAgentName, undefined);
assert.equal(verifiedTaskState.review.acceptedAt, undefined);
const completedWorkState = parseState(documents.get(`${roomId}:ROOM_WORK_STATE`).body);
assert.equal(completedWorkState.latestOutcome.taskId, createdTaskId);
assert.equal(completedWorkState.latestOutcome.status, "done");
assert.equal(completedWorkState.waitingFor.kind, "user");

setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: "another-cto-room",
  agentId: "another-cto",
  agentName: "Another CTO",
  agentRole: "cto",
  workplaneRole: "cto",
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent"
});
const foreignCompletion = await runTool("complete_task", { taskId: createdTaskId, reviewSummary: "Attempted foreign technical verification." });
assert.equal(foreignCompletion.ok, false);
assert.match(foreignCompletion.message, /created this Task/);

const foreignReopen = await runTool("post_task_feedback", { taskId: createdTaskId, message: "Attempted foreign reopen." });
assert.equal(foreignReopen.ok, false);
assert.match(foreignReopen.message, /created this Task/);

setActiveThreadContextForTest("thread-1", {
  companyId,
  projectId,
  issueId: roomId,
  agentId: ctoAgent.id,
  agentName: ctoAgent.name,
  agentRole: ctoAgent.role,
  workplaneRole: "cto",
  paperclipApiUrl: "http://127.0.0.1:3100",
  enableTaskAssignment: true,
  mode: "agent"
});
const reopenedCompletedTask = await runTool("post_task_feedback", {
  taskId: createdTaskId,
  message: "Later design review requires another correction pass in this same Task."
});
assert.equal(reopenedCompletedTask.ok, true);
assert.equal(reopenedCompletedTask.task.id, createdTaskId);
assert.equal(reopenedCompletedTask.task.status, "todo");
assert.equal(issues.get(createdTaskId).assigneeAgentId, codeWorker.id);
const reopenedCompletedState = parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body);
assert.equal(reopenedCompletedState.review.status, "correction_requested");
assert.equal(reopenedCompletedState.review.feedbackByAgentId, ctoAgent.id);
assert.equal(reopenedCompletedState.reviewHistory.at(-1).outcome, "correction_requested");

codeWorker.status = "paused";
const parkedTask = await runTool("create_task", {
  title: "Prepare paused worker task",
  description: "Keep the authorized work assigned to the selected worker until it is resumed.",
  assigneeAgentId: codeWorker.id,
  maturity: "prototype",
  taskType: "implementation",
  affectedPaths: ["Source/Parked.cpp"],
  acceptanceCriteria: ["The same Task starts after the assigned Worker is resumed."],
  verification: ["Verify the Task id and assignee do not change."]
});
assert.equal(parkedTask.ok, true);
assert.equal(parkedTask.waitingForWorker, true);
assert.equal(parkedTask.task.id, createdTaskId);
assert.equal(issues.get(createdTaskId).status, "blocked");
assert.equal(issues.get(createdTaskId).assigneeAgentId, codeWorker.id);
assert.equal(parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body).dispatch.status, "waiting_for_worker");
assert.equal(parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body).dispatch.reason, "worker_paused_before_start");
assert.match(comments.get(createdTaskId).at(-1).body, /same Task with paperclip\.start_task/);

const createdCountBeforeStart = createdCount;
const stillPaused = await runTool("start_task", { taskId: createdTaskId });
assert.equal(stillPaused.ok, false);
assert.equal(stillPaused.code, "worker_unavailable");
assert.equal(issues.get(createdTaskId).status, "blocked");

codeWorker.status = "idle";
const startedTask = await runTool("start_task", { taskId: createdTaskId });
assert.equal(startedTask.ok, true);
assert.equal(startedTask.reusedTask, true);
assert.equal(startedTask.task.id, createdTaskId);
assert.equal(startedTask.task.status, "todo");
assert.equal(startedTask.task.assigneeAgentId, codeWorker.id);
assert.equal(createdCount, createdCountBeforeStart);
assert.equal(parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body).dispatch.status, "ready");
assert.equal(parseState(documents.get(`${createdTaskId}:TASK_ROOM_STATE`).body).dispatch.reason, null);

const lossyTask = await runTool("create_task", {
  title: "????",
  description: "???? ???",
  assigneeAgentId: codeWorker.id,
  maturity: "exploration",
  taskType: "implementation",
  affectedPaths: ["Source/Other.cpp"]
});
assert.equal(lossyTask.ok, false);
assert.match(lossyTask.message, /lossy encoding/);

setActiveThreadContextForTest("thread-1", null);
globalThis.fetch = originalFetch;
console.log("PASS Agent Room provisioning, identity, Task collision, and owner feedback contract");
