import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { chooseDefaultWorkspace, chooseTaskWorkspace, loadRoomState, normalizeWorkspaceProfile, parseState, workspaceGitChanges } = await import("../dist/worker.js");

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
assert.equal(parseState(documents.get("ROOM_STATE").body).workspace.projectWorkspaceId, "design-workspace");

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

const explicitProfile = normalizeWorkspaceProfile({
  configured: true,
  defaultWorkspaceId: "implementation-workspace",
  agentWorkspaceIds: { designer: "design-workspace", imageWorker: "design-workspace" }
}, mixedWorkspaces);
assert.equal(
  chooseDefaultWorkspace({ id: "designer", name: "Designer", role: "general", adapterConfig: {} }, mixedWorkspaces, explicitProfile).id,
  "design-workspace"
);
assert.equal(
  chooseTaskWorkspace(mixedWorkspaces, "implementation", "", explicitProfile, "imageWorker").id,
  "implementation-workspace"
);
assert.equal(
  chooseTaskWorkspace(mixedWorkspaces, "implementation", "implementation-workspace", explicitProfile, "imageWorker").id,
  "implementation-workspace"
);

const defaultOnlyProfile = normalizeWorkspaceProfile({
  configured: true,
  defaultWorkspaceId: "design-workspace"
}, mixedWorkspaces);
assert.equal(
  chooseDefaultWorkspace({ id: "default-room", name: "Default Room", role: "general", adapterConfig: {} }, mixedWorkspaces, defaultOnlyProfile).id,
  "design-workspace"
);
assert.equal(
  chooseTaskWorkspace(mixedWorkspaces, "implementation", "", defaultOnlyProfile, "codeWorker").id,
  "implementation-workspace"
);

const customTaskTypeProfile = normalizeWorkspaceProfile({
  configured: true,
  taskTypes: [
    { id: "research", label: "Research and discovery" },
    { id: "release", label: "Release preparation" }
  ],
  taskWorkspaceIds: {
    research: "design-workspace",
    release: "implementation-workspace",
    "not a valid key": "design-workspace"
  }
}, mixedWorkspaces);
assert.deepEqual(customTaskTypeProfile.taskTypes, [
  { id: "research", label: "Research and discovery" },
  { id: "release", label: "Release preparation" }
]);
assert.deepEqual(customTaskTypeProfile.taskWorkspaceIds, {
  research: "design-workspace",
  release: "implementation-workspace"
});
assert.equal(
  chooseTaskWorkspace(mixedWorkspaces, "research", "", customTaskTypeProfile).id,
  "design-workspace"
);
assert.equal(
  chooseTaskWorkspace(mixedWorkspaces, "release", "", customTaskTypeProfile).id,
  "implementation-workspace"
);

const unicodeRepo = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-room-workspace-"));
try {
  execFileSync("git", ["init"], { cwd: unicodeRepo, stdio: "ignore" });
  fs.writeFileSync(path.join(unicodeRepo, "한글 변경.txt"), "UTF-8 path\n", "utf8");
  const changes = workspaceGitChanges({ id: "unicode-workspace", name: "Unicode repository", cwd: unicodeRepo, metadata: { kind: "design" } });
  assert.equal(changes.available, true);
  assert.deepEqual(changes.files.map((file) => file.path), ["한글 변경.txt"]);
} finally {
  fs.rmSync(unicodeRepo, { recursive: true, force: true });
}

const nestedWorkspaceRepo = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-room-workspace-scope-"));
try {
  const nestedWorkspace = path.join(nestedWorkspaceRepo, "project-workspace");
  fs.mkdirSync(nestedWorkspace);
  execFileSync("git", ["init"], { cwd: nestedWorkspaceRepo, stdio: "ignore" });
  fs.writeFileSync(path.join(nestedWorkspaceRepo, "outside-workspace.txt"), "outside\n", "utf8");
  fs.writeFileSync(path.join(nestedWorkspace, "inside-workspace.txt"), "inside\n", "utf8");
  const changes = workspaceGitChanges({ id: "nested-workspace", name: "Nested workspace", cwd: nestedWorkspace, metadata: { kind: "implementation" } });
  assert.equal(changes.available, true);
  assert.deepEqual(changes.files.map((file) => file.path), ["inside-workspace.txt"]);
  // CI's short TEMP alias and user-created junctions must not widen Changes.
  const aliasRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sps-workspace-alias-"));
  try {
    const alias = path.join(aliasRoot, "workspace");
    fs.symlinkSync(nestedWorkspace, alias, process.platform === "win32" ? "junction" : "dir");
    for (const relativePaths of ["true", "false"]) {
      execFileSync("git", ["config", "status.relativePaths", relativePaths], { cwd: nestedWorkspaceRepo });
      const aliasedChanges = workspaceGitChanges({ id: "aliased-workspace", cwd: alias });
      assert.equal(aliasedChanges.available, true);
      assert.deepEqual(aliasedChanges.files.map((file) => file.path), ["inside-workspace.txt"]);
    }
  } finally {
    fs.rmSync(aliasRoot, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(nestedWorkspaceRepo, { recursive: true, force: true });
}

globalThis.fetch = originalFetch;
console.log("PASS Room binds registered Project Workspaces, routes specialist Workers, preserves UTF-8 Git paths, and scopes Changes to the selected Workspace");
