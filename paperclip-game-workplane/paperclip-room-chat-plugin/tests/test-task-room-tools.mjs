import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleCodexServerRequest, handleProjectTasksView, handleProjectWorkplaneView, handleRoomTaskSummary, handleRoomWorkspaceView, handleTaskOwnerFeedback, handleTaskRoomView, loadAgentInstructions, provisionProjectAgentRooms, setActiveThreadContextForTest } = await import("../dist/worker.js");

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
    identifier: "CMP-100",
    projectId,
    parentId: roomId,
    title: "Existing player change",
    status: "in_progress",
    description: "Existing scope\n\nAffected Paths:\n- Source/Player.cpp\n"
  }]
]);
const comments = new Map();
const documentWrites = [];
let createdCount = 0;
const originalFetch = globalThis.fetch;

assert.match(loadAgentInstructions({ adapterConfig: { instructionsFilePath: "relative/AGENTS.md" } }), /No managed Agent AGENTS\.md/);
assert.match(loadAgentInstructions({ adapterConfig: { instructionsFilePath: "C:\\missing\\AGENTS.md" } }), /No managed Agent AGENTS\.md/);

globalThis.fetch = async (url, init) => {
  documentWrites.push({ url: String(url), body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ id: "document-1", ...JSON.parse(init.body) }), { status: 200 });
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
  agentRole: ctoAgent.role
});

const runTool = async (tool, args) => {
  const response = await handleCodexServerRequest(ctx, {
    method: "item/tool/call",
    params: { threadId: "thread-1", namespace: "paperclip", tool, arguments: args, callId: `call-${tool}` }
  });
  return JSON.parse(response.contentItems[0].text);
};

ctx.projects.listWorkspaces = async () => [
  { id: "design-workspace", name: "Design repository", path: process.cwd(), isPrimary: false },
  { id: "implementation-workspace", name: "Implementation repository", path: process.cwd(), isPrimary: true }
];

const preview = await runTool("preview_task", { affectedPaths: ["Source/Player.cpp"] });
assert.equal(preview.ok, true);
assert.equal(preview.conflicts.length, 1);
assert.equal(preview.conflicts[0].id, existingTaskId);

const conflict = await runTool("create_task", {
  title: "Change player behavior",
  description: "Implement approved player behavior.",
  assigneeAgentId: codeWorker.id,
  taskType: "implementation",
  affectedPaths: ["Source/Player.cpp"],
  designReferences: ["Design/Player.md"]
});
assert.equal(conflict.ok, false);
assert.equal(conflict.code, "task_path_conflict");
assert.equal(createdCount, 0);

const created = await runTool("create_task", {
  title: "Change player behavior",
  description: "Implement approved player behavior.",
  assigneeAgentId: codeWorker.id,
  taskType: "implementation",
  affectedPaths: ["Source/Player.cpp"],
  designReferences: ["Design/Player.md"],
  acceptanceCriteria: ["Player behavior matches the approved design."],
  verification: ["Run the focused test."],
  blockedByIssueIds: [existingTaskId]
});
assert.equal(created.ok, true);
assert.equal(created.task.id, createdTaskId);
assert.equal(issues.get(createdTaskId).status, "todo");
assert.deepEqual(issues.get(createdTaskId).blockedByIssueIds, [existingTaskId]);
assert.equal(documentWrites.length, 1);
assert.match(documentWrites[0].url, /\/api\/issues\/task-created\/documents\/TASK_ROOM_STATE$/);
assert.equal(JSON.parse(documentWrites[0].body.body).owningAgentName, ctoAgent.name);
assert.equal(JSON.parse(documentWrites[0].body.body).projectWorkspaceId, "implementation-workspace");
assert.match(comments.get(createdTaskId)[0].body, /Owner Agent: Primary CTO/);

const taskStateBody = documentWrites[0].body.body;
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
const provisionedIssues = [{
  id: "existing-manager", projectId: "project-provision", title: "Manager", status: "todo", parentId: null,
  assigneeAgentId: null, assigneeUserId: null,
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: "project:project-provision:agent-room:agent-manager"
}];
const provisionCtx = {
  agents: { list: async () => [manager, ctoAgent, codeWorker] },
  issues: {
    list: async () => provisionedIssues,
    create: async (input) => {
      const issue = { id: `room-${provisionedIssues.length}`, identifier: `CMP-${provisionedIssues.length}`, ...input };
      provisionedIssues.push(issue);
      return issue;
    }
  }
};
const provisioned = await provisionProjectAgentRooms(provisionCtx, companyId, "project-provision");
assert.equal(provisioned.created.length, 2);
assert.deepEqual(provisioned.created.map((room) => room.title).sort(), ["Code Worker", "Primary CTO"]);
assert.ok(provisionedIssues.every((issue) => issue.parentId === null && issue.assigneeAgentId === null));
assert.ok(provisionedIssues.every((issue) => issue.status === "todo"));
const secondProvision = await provisionProjectAgentRooms(provisionCtx, companyId, "project-provision");
assert.equal(secondProvision.created.length, 0);
assert.equal(provisionedIssues.length, 3);

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
assert.equal(taskBoard.tasks.length, 2);
assert.equal(taskBoard.tasks.find((task) => task.id === "task-in-room").parentRoom.id, "manager-room");
assert.ok(taskBoard.tasks.every((task) => task.project.id === "project-workplane"));

const feedback = await runTool("post_task_feedback", { taskId: createdTaskId, message: "Keep the change inside the approved scope." });
assert.equal(feedback.ok, true);
assert.match(comments.get(createdTaskId).at(-1).body, /Primary CTO Feedback/);

setActiveThreadContextForTest("thread-1", null);
globalThis.fetch = originalFetch;
console.log("PASS Agent Room provisioning, identity, Task collision, and owner feedback contract");
