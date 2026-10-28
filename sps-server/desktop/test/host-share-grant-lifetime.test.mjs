import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createSpsHostShareMutationCoordinator, SpsHostShareReconciliationRequiredError } from "../src/host-share-mutation.mjs";
import { createSpsHostProjectShareCredential, spsHostProjectShareName, spsHostProjectSharePath } from "../src/host-project-share.mjs";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const sourcePath = "C:\\fixture-source-a";
const sourceId = "source-a";
const node = { id: "node-a", displayName: "A", status: "active", keyVerifiedAt: "fixture", transportPublicKey: "fixture-key" };
function section(start, end) {
  const from = main.indexOf(start);
  const to = main.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing Main source section: ${start}`);
  return main.slice(from, to);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function harness(overrides = {}) {
  const events = [];
  const handlers = new Map();
  const snapshot = { companyId: "company-a", sources: [{ id: sourceId }], nodes: [node, { ...node, id: "node-b" }], share: null };
  const sandbox = {
    state: {
      profile: { connectionKind: "owner-host", companyId: "company-a", workspaceSources: [{ id: sourceId, sourcePath }], projectWorkspaces: { [sourceId]: sourcePath } },
      teamAccess: { companyId: "company-a", hostname: "host-a.ts.net" },
      encryptedHostProjectShareSecrets: null,
      ownerHostOwnerSubject: "account-a",
    },
    ownerHostManager: {}, ownerHostInstanceGeneration: 1,
    ownerHostStatus: { state: "running", url: "http://127.0.0.1:4444", startedAt: "launch-a" },
    hostShareMutationCoordinator: createSpsHostShareMutationCoordinator(),
    SpsHostShareReconciliationRequiredError,
    structuredClone, path,
    process: { platform: "win32", env: { COMPUTERNAME: "fixture-host" } },
    app: { getPath: () => "fixture-temp-unused" }, os: { hostname: () => "fixture-host" },
    ipcMain: { handle: (name, action) => handlers.set(name, action) },
    publicStatus: () => ({ fixture: true }),
    requireSpsWorkspaceDirectory: async value => value,
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    mainWindow: null,
    currentDesktopAccountSubject: () => "account-a", currentDesktopSessionEpoch: () => 1,
    currentAccountOwnsOwnerHost: () => true,
    isOwnerHostProfile: profile => (profile ?? sandbox.state.profile)?.connectionKind === "owner-host",
    ownerHostIsReady: () => true, isTeamAccessEnabled: () => Boolean(sandbox.state.teamAccess?.hostname),
    normalizeSpsWorkspaceSources: value => value ?? [],
    encrypt: value => value, decrypt: value => value,
    spsHostProjectShareName, spsHostProjectSharePath, createSpsHostProjectShareCredential,
    SPS_HOST_SHARE_CREDENTIAL_ALGORITHM: "fixture-algorithm",
    sealSpsHostProjectShareCredential: () => "fixture-sealed-envelope",
    persistState: async ({ beforeCommit = () => {} } = {}) => { beforeCommit(); events.push("save"); },
    loadCoreHostWorkspaceSources: async ({ assertCurrent = () => {} } = {}) => { assertCurrent(); return snapshot; },
    ownerHostApi: async (url, options = {}) => {
      options.assertCurrent?.();
      if (!options.method) return { nodes: snapshot.nodes, share: snapshot.share };
      events.push(`core:${options.method}`);
      if (options.method === "PUT" && url.endsWith("/sps-host-share")) snapshot.share = options.body;
      if (options.method === "PATCH" && url.endsWith(`/sps-workspace-sources/${sourceId}`)) Object.assign(snapshot.sources[0], options.body);
      options.assertCurrent?.();
      return {};
    },
    updateSpsHostProjectShareWindowsAccess: async request => {
      const record = JSON.parse(sandbox.state.encryptedHostProjectShareSecrets).projects[sourceId];
      assert.ok(record?.grants?.[node.id], "credential is saved before Windows grant");
      events.push(`windows:${request.action}`);
    },
    ...overrides,
  };
  vm.runInNewContext([
    section("function captureWorkspaceReadScope(", "async function refreshSpsIdentityTeamContext("),
    section("function currentHostProjectShareSecrets(", "async function loadCoreHostWorkspaceSources("),
    section("function assertHostWorkspaceSourceManager(", "async function showHostWorkspaceSourceManager("),
    section("function assertHostProjectSourceManager(", "async function listHostProjectSourcesForWorkspace("),
    section("async function getHostProjectShareStatus(", "async function showHostProjectSourceManager("),
    section('  ipcMain.handle("desktop:save-default-workspace"', '  ipcMain.handle("desktop:manage-host-project-source"'),
  ].join("\n"), sandbox, { filename: "actual-main-share-grant.mjs" });
  return { sandbox, events, snapshot, handlers };
}
const methods = [
  ["Workspace", "grantHostWorkspaceSourceToNode", "revokeHostWorkspaceSourceFromNode"],
  ["project", "grantHostProjectSourceToNode", "revokeHostProjectSourceFromNode"],
];
for (const [lane, grant, revoke] of methods) {
  test(`${lane} grant saves recoverable credentials before Windows and keeps normal completion`, async () => {
    const { sandbox, events } = harness();
    const result = await sandbox[grant](sourceId, node.id);
    assert.equal(result.node.id, node.id);
    assert.equal(events[0], "save");
    assert.equal(events[1], "windows:grant");
    assert.equal(events.at(-1), "core:PUT");
    assert.ok(JSON.parse(sandbox.state.encryptedHostProjectShareSecrets).projects[sourceId].grants[node.id]);
  });

  test(`${lane} grant stops after a stale status response without saving or changing Windows`, async () => {
    const started = deferred(), response = deferred();
    const { sandbox, events } = harness();
    if (lane === "Workspace") sandbox.loadCoreHostWorkspaceSources = async () => { started.resolve(); await response.promise; return { companyId: "company-a", sources: [{ id: sourceId }], nodes: [node] }; };
    else sandbox.ownerHostApi = async () => { started.resolve(); await response.promise; return { nodes: [node], share: null }; };
    const work = sandbox[grant](sourceId, node.id);
    const rejected = assert.rejects(work, /changed|no longer|pending/);
    await started.promise;
    sandbox.state.profile = { connectionKind: "owner-host", companyId: "company-b" };
    sandbox.state.encryptedHostProjectShareSecrets = "replacement-protected-state";
    response.resolve();
    await rejected;
    assert.equal(sandbox.state.encryptedHostProjectShareSecrets, "replacement-protected-state");
    assert.equal(events.length, 0);
  });

  test(`${lane} grant preserves B after an old in-flight Windows change and reports partial state`, async () => {
    const started = deferred(), finish = deferred();
    const { sandbox, events } = harness({ updateSpsHostProjectShareWindowsAccess: async () => { started.resolve(); await finish.promise; } });
    const work = sandbox[grant](sourceId, node.id);
    const rejected = assert.rejects(work, error => error instanceof SpsHostShareReconciliationRequiredError
      && error.localAccessMayHaveChanged && !error.coreMayHaveChanged);
    await started.promise;
    assert.ok(JSON.parse(sandbox.state.encryptedHostProjectShareSecrets).projects[sourceId].grants[node.id]);
    sandbox.state.profile = { connectionKind: "owner-host", companyId: "company-b" };
    sandbox.state.encryptedHostProjectShareSecrets = "replacement-protected-state";
    finish.resolve();
    await rejected;
    assert.equal(sandbox.state.encryptedHostProjectShareSecrets, "replacement-protected-state");
    assert.deepEqual(events, ["save"]);
  });

  test(`${lane} failed Core retry never revokes or discards an existing credential`, async () => {
    const { sandbox, events } = harness();
    await sandbox[grant](sourceId, node.id);
    const credential = JSON.parse(sandbox.state.encryptedHostProjectShareSecrets).projects[sourceId].grants[node.id];
    const originalApi = sandbox.ownerHostApi;
    sandbox.ownerHostApi = async (url, options = {}) => {
      if (options.method) throw new Error("private lost response");
      return originalApi(url, options);
    };
    await assert.rejects(sandbox[grant](sourceId, node.id), error => error instanceof SpsHostShareReconciliationRequiredError
      && error.localAccessMayHaveChanged && error.coreMayHaveChanged && !error.message.includes("private"));
    const retained = JSON.parse(sandbox.state.encryptedHostProjectShareSecrets).projects[sourceId].grants[node.id];
    assert.deepEqual(retained, credential);
    assert.equal(events.includes("windows:revoke"), false);
    assert.equal(events.includes("windows:remove"), false);
  });

  test(`${lane} revoke keeps its recovery credential when Windows removal fails`, async () => {
    const { sandbox } = harness();
    await sandbox[grant](sourceId, node.id);
    const before = sandbox.state.encryptedHostProjectShareSecrets;
    sandbox.updateSpsHostProjectShareWindowsAccess = async () => { throw new Error("private Windows failure"); };
    await assert.rejects(sandbox[revoke](sourceId, node.id), error => error instanceof SpsHostShareReconciliationRequiredError
      && error.localAccessMayHaveChanged && error.coreMayHaveChanged === (lane === "project"));
    assert.equal(sandbox.state.encryptedHostProjectShareSecrets, before);
  });

  test(`${lane} successful revoke removes only its confirmed grant`, async () => {
    const { sandbox, events } = harness();
    await sandbox[grant](sourceId, node.id);
    events.length = 0;
    const result = await sandbox[revoke](sourceId, node.id);
    assert.equal(result.revoked, true);
    const record = JSON.parse(sandbox.state.encryptedHostProjectShareSecrets).projects[sourceId];
    assert.equal(Boolean(record?.grants?.[node.id]), false);
    assert.equal(events.at(-1), "save");
    const windowsIndex = events.indexOf("windows:revoke");
    const coreIndex = events.indexOf("core:DELETE");
    assert.ok(windowsIndex >= 0 && coreIndex >= 0);
    assert.equal(windowsIndex < coreIndex, lane === "Workspace");
  });

  test(`${lane} revoke rejects a protected record for another folder before effects`, async () => {
    const { sandbox, events } = harness();
    await sandbox[grant](sourceId, node.id);
    const secrets = JSON.parse(sandbox.state.encryptedHostProjectShareSecrets);
    secrets.projects[sourceId].sourcePath = "C:\\different-owner-folder";
    sandbox.state.encryptedHostProjectShareSecrets = JSON.stringify(secrets);
    const before = sandbox.state.encryptedHostProjectShareSecrets;
    events.length = 0;
    await assert.rejects(sandbox[revoke](sourceId, node.id), error => error instanceof SpsHostShareReconciliationRequiredError
      && !error.localAccessMayHaveChanged && !error.coreMayHaveChanged);
    assert.equal(sandbox.state.encryptedHostProjectShareSecrets, before);
    assert.deepEqual(events, []);
  });
}

test("queued grants merge the latest protected state instead of losing the first Node", async () => {
  const started = deferred(), finish = deferred();
  let windowsCalls = 0;
  const { sandbox } = harness({ updateSpsHostProjectShareWindowsAccess: async () => { if (++windowsCalls === 1) { started.resolve(); await finish.promise; } } });
  const first = sandbox.grantHostWorkspaceSourceToNode(sourceId, node.id);
  void first.catch(() => {});
  await started.promise;
  const second = sandbox.grantHostWorkspaceSourceToNode(sourceId, "node-b");
  void second.catch(() => {});
  finish.resolve();
  await Promise.all([first, second]);
  const grants = JSON.parse(sandbox.state.encryptedHostProjectShareSecrets).projects[sourceId].grants;
  assert.deepEqual(Object.keys(grants).sort(), ["node-a", "node-b"]);
});

test("legacy shared Windows usernames are rejected before touching a sibling project", async () => {
  const { sandbox, events } = harness();
  const shareName = spsHostProjectShareName(sourceId);
  sandbox.state.encryptedHostProjectShareSecrets = JSON.stringify({ version: 1, projects: {
    [sourceId]: { sourcePath, shareName, sharePath: spsHostProjectSharePath("host-a.ts.net", shareName), grants: { [node.id]: { username: "spsws_shared", password: "fixture-password" } } },
    sibling: { grants: { [node.id]: { username: "SPSWS_SHARED", password: "other-fixture-password" } } },
  } });
  const before = sandbox.state.encryptedHostProjectShareSecrets;
  await assert.rejects(sandbox.grantHostProjectSourceToNode(sourceId, node.id), error => error instanceof SpsHostShareReconciliationRequiredError);
  assert.equal(sandbox.state.encryptedHostProjectShareSecrets, before);
  assert.equal(events.length, 0);
});

for (const kind of ["default", "project"]) {
  test(`legacy ${kind} folder IPC preserves normal saving`, async () => {
    const { sandbox, handlers, events } = harness();
    await handlers.get(`desktop:save-${kind}-workspace`)({}, { projectId: sourceId, workspacePath: "C:\\selected-folder" });
    assert.equal(kind === "project" ? sandbox.state.profile.projectWorkspaces[sourceId] : sandbox.state.profile.defaultWorkspacePath, "C:\\selected-folder");
    assert.deepEqual(events, ["save"]);
  });

  test(`legacy ${kind} folder validation cannot overwrite replacement account settings`, async () => {
    const started = deferred(), validated = deferred();
    const { sandbox, handlers, events } = harness({ requireSpsWorkspaceDirectory: async () => { started.resolve(); return await validated.promise; } });
    const work = handlers.get(`desktop:save-${kind}-workspace`)({}, { projectId: sourceId, workspacePath: "C:\\old-account-selection" });
    const rejected = assert.rejects(work, /changed|no longer/);
    await started.promise;
    const replacement = { connectionKind: "owner-host", companyId: "company-b", defaultWorkspacePath: "C:\\B", projectWorkspaces: { "project-b": "C:\\B" } };
    sandbox.state.profile = replacement;
    validated.resolve("C:\\old-account-selection");
    await rejected;
    assert.equal(sandbox.state.profile, replacement);
    assert.equal(replacement.defaultWorkspacePath, "C:\\B");
    assert.deepEqual(replacement.projectWorkspaces, { "project-b": "C:\\B" });
    assert.deepEqual(events, []);
  });
}

test("legacy project mapping waits for a grant and respects the now-active credential", async () => {
  const started = deferred(), finish = deferred();
  const { sandbox, handlers } = harness({ updateSpsHostProjectShareWindowsAccess: async () => { started.resolve(); await finish.promise; } });
  const grant = sandbox.grantHostProjectSourceToNode(sourceId, node.id);
  void grant.catch(() => {});
  await started.promise;
  const save = handlers.get("desktop:save-project-workspace")({}, { projectId: sourceId, workspacePath: "C:\\replacement-folder" });
  const rejected = assert.rejects(save, /Revoke every Member/);
  finish.resolve();
  await grant;
  await rejected;
  assert.equal(sandbox.state.profile.projectWorkspaces[sourceId], sourcePath);
  assert.ok(JSON.parse(sandbox.state.encryptedHostProjectShareSecrets).projects[sourceId].grants[node.id]);
});

test("legacy folder picker cannot return a prior account's selection after switching", async () => {
  const started = deferred(), picked = deferred();
  const { sandbox, handlers } = harness({ dialog: { showOpenDialog: async () => { started.resolve(); return await picked.promise; } } });
  const work = handlers.get("desktop:choose-project-workspace")({});
  const rejected = assert.rejects(work, /changed|no longer/);
  await started.promise;
  sandbox.state.profile = { connectionKind: "owner-host", companyId: "company-b" };
  picked.resolve({ canceled: false, filePaths: ["C:\\old-account-selection"] });
  await rejected;
});

test("Workspace grant never replaces a Core Source route belonging to another Host", async () => {
  const { sandbox, events, snapshot } = harness();
  snapshot.sources[0].sharePath = "\\\\another-host\\owned-source";
  await assert.rejects(sandbox.grantHostWorkspaceSourceToNode(sourceId, node.id), /another|different|reconcile/i);
  assert.equal(sandbox.state.encryptedHostProjectShareSecrets, null);
  assert.deepEqual(events, []);
});
