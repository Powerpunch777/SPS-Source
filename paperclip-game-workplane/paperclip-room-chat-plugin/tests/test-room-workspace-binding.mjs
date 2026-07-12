import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { chooseDefaultWorkspace, loadRoomState } = await import("../dist/worker.js");

const companyId = "company-workspace";
const issue = {
  id: "room-workspace",
  projectId: "project-workspace",
  title: "Designer",
  status: "todo",
  parentId: null,
  assigneeAgentId: null,
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: "project:project-workspace:agent-room:designer"
};
const agent = { id: "designer", name: "Designer", role: "designer", status: "idle", adapterConfig: {} };
const documents = new Map();
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  const key = decodeURIComponent(String(url).split("/").at(-1));
  const payload = JSON.parse(init.body);
  const document = { latestRevisionId: `rev-${documents.size + 1}`, body: payload.body };
  documents.set(key, document);
  return new Response(JSON.stringify(document), { status: 200 });
};

const ctx = {
  config: { get: async () => ({ paperclipApiUrl: "http://127.0.0.1:3100" }) },
  projects: {
    listWorkspaces: async () => [
      { id: "design-workspace", name: "Design repository", path: process.cwd(), isPrimary: false },
      { id: "implementation-workspace", name: "Implementation repository", path: process.cwd(), isPrimary: true }
    ]
  },
  issues: { documents: { get: async (_issueId, key) => documents.get(key) ?? null } }
};

const state = await loadRoomState(ctx, companyId, issue, agent);
assert.equal(state.workspace.projectWorkspaceId, "design-workspace");
assert.equal(state.workspace.kind, "design");
assert.equal(Object.hasOwn(state, "workingDirectory"), false);
assert.equal(JSON.parse(documents.get("ROOM_STATE").body).workspace.projectWorkspaceId, "design-workspace");

const mixedWorkspaces = [
  { id: "design-workspace", name: "Design repository", cwd: "C:/workspace/design", isPrimary: false },
  { id: "implementation-workspace", name: "Game repository", cwd: process.cwd(), isPrimary: true }
];
assert.equal(
  chooseDefaultWorkspace({ name: "Image Worker", role: "designer", adapterConfig: {} }, mixedWorkspaces).id,
  "implementation-workspace"
);
assert.equal(
  chooseDefaultWorkspace({ name: "Voice Worker", role: "general", adapterConfig: { cwd: process.cwd() } }, mixedWorkspaces).id,
  "implementation-workspace"
);

globalThis.fetch = originalFetch;
console.log("PASS Room binds a registered Project Workspace ID and routes image or voice workers to the implementation Workspace");
