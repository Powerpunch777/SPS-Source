import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  createSpsHostShareMutationCoordinator,
  SpsHostShareReconciliationRequiredError,
} from "../src/host-share-mutation.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function sourceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing source marker: ${start}`);
  assert.notEqual(to, -1, `Missing source marker: ${end}`);
  return source.slice(from, to);
}

async function createHarness(overrides = {}) {
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");
  let sessionEpoch = 1;
  const sandbox = {
    state: {
      profile: {
        connectionKind: "owner-host",
        companyId: "company-a",
        projectWorkspaces: { "project-a": "C:\\A" },
        workspaceSources: [{ id: "source-a", name: "Source A", sourcePath: "C:\\A" }],
      },
      teamAccess: null,
      projects: [],
      ownerHostOwnerSubject: "account-a",
      encryptedHostProjectShareSecrets: null,
    },
    structuredClone,
    JSON,
    Error,
    path,
    ownerHostInstanceGeneration: 1,
    ownerHostManager: {},
    ownerHostStatus: { state: "running", url: "http://127.0.0.1:4400", startedAt: "host-a" },
    currentDesktopAccountSubject: () => "account-a",
    currentDesktopSessionEpoch: () => sessionEpoch,
    ownerHostIsReady: () => true,
    isOwnerHostProfile: profile => (profile ?? sandbox.state.profile)?.connectionKind === "owner-host",
    currentAccountOwnsOwnerHost: () => true,
    isTeamAccessEnabled: () => Boolean(sandbox.state.teamAccess?.enabled),
    ownerHostCompaniesRequestGeneration: 0,
    ownerHostCompaniesResolvedGeneration: 0,
    ownerHostCompanies: [],
    workspaceProjectsRequestGeneration: 0,
    hostShareMutationCoordinator: createSpsHostShareMutationCoordinator(),
    SpsHostShareReconciliationRequiredError,
    encrypt: value => value,
    decrypt: value => value,
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    workspaceWindow: null,
    mainWindow: null,
    app: { getPath: () => "C:\\Temp" },
    persistState: async ({ beforeCommit = () => {} } = {}) => { beforeCommit(); sandbox.persistCalls += 1; },
    persistCalls: 0,
    ownerHostApi: async (pathname, options = {}) => {
      const { assertCurrent = () => {} } = options;
      assertCurrent();
      const value = await sandbox.ownerHostApiImpl(pathname, options);
      assertCurrent();
      return value;
    },
    ownerHostApiImpl: async pathname => pathname.includes("/projects")
      ? [{ id: "project-a", name: "Project A" }]
      : { sources: [], nodes: [] },
    refreshProjects: async () => [],
    requireSpsWorkspaceDirectory: async value => value,
    updateSpsHostProjectShareWindowsAccess: async () => {},
    normalizeSpsWorkspaceSources: sources => Array.isArray(sources) ? sources : [],
    renameSpsWorkspaceSource: (sources, id, name) => sources.map(source => source.id === id ? { ...source, name } : source),
    removeSpsWorkspaceSource: (sources, id) => sources.filter(source => source.id !== id),
    addSpsWorkspaceSource: (sources, source) => [...sources, source],
    capturedHandlers: new Map(),
    setSessionEpoch: value => { sessionEpoch = value; },
    globalThis: null,
    ...overrides,
  };
  sandbox.globalThis = sandbox;
  const code = [
    sourceBetween(main, "function captureWorkspaceReadScope(", "async function acceptSpsIdentityInvite("),
    sourceBetween(main, "function currentTeamCredentials(", "function assertHostProjectSourceManager("),
    sourceBetween(main, "function normalizeProjectList(", "function stopNodeScheduling("),
    sourceBetween(main, "function normalizedProjectId(", "async function getHostProjectShareStatus("),
    "globalThis.actualChooseProjectSource = chooseHostProjectSourceForWorkspace; globalThis.actualClearProjectSource = clearHostProjectSourceForWorkspace; globalThis.actualListProjectSources = listHostProjectSourcesForWorkspace; globalThis.actualChooseWorkspaceSource = chooseHostWorkspaceSource; globalThis.actualShowWorkspaceSourceManager = showHostWorkspaceSourceManager; globalThis.actualRenameWorkspaceSource = renameHostWorkspaceSource; globalThis.actualRemoveWorkspaceSource = removeHostWorkspaceSource; globalThis.actualSynchronizeWorkspaceSources = synchronizeHostWorkspaceSources;",
  ].join("\n");
  vm.runInNewContext(code, sandbox, { filename: "main-host-source-mutation-extract.mjs" });
  return sandbox;
}

test("project folder selection keeps the original owner scope while the folder picker is open", async () => {
  const picker = deferred();
  const harness = await createHarness({
    dialog: { showOpenDialog: () => picker.promise },
  });
  const initialPersistCalls = harness.persistCalls;
  const operation = harness.actualChooseProjectSource("project-a");
  await new Promise(resolve => setImmediate(resolve));
  harness.state.profile = {
    connectionKind: "owner-host", companyId: "company-b", projectWorkspaces: { "project-b": "C:\\B" },
  };
  picker.resolve({ canceled: false, filePaths: ["C:\\A\\Selected"] });

  await assert.rejects(operation, /connection changed|authority changed/);
  assert.deepEqual(harness.state.profile.projectWorkspaces, { "project-b": "C:\\B" });
  assert.equal(harness.persistCalls, initialPersistCalls + 1); // only the initial project refresh
});

test("local Owner Host project metadata remains usable without private team access", async () => {
  const harness = await createHarness({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["C:\\A\\Project"] }) },
  });

  const selected = await harness.actualChooseProjectSource("project-a");
  assert.equal(harness.state.profile.projectWorkspaces["project-a"], "C:\\A\\Project");
  assert.equal(selected.projects.find(project => project.id === "project-a").sourcePath, "C:\\A\\Project");
  assert.equal(selected.privateTeamAccessEnabled, false);

  const cleared = await harness.actualClearProjectSource("project-a");
  assert.equal(Object.hasOwn(harness.state.profile.projectWorkspaces, "project-a"), false);
  assert.equal(cleared.projects.find(project => project.id === "project-a").sourcePath, "");
});

test("Workspace Source folder creation persists Core identity before returning the synchronized list", async () => {
  const calls = [];
  const harness = await createHarness({
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["C:\\A\\Source B"] }) },
    ownerHostApiImpl: async (pathname, options = {}) => {
      calls.push(options.method ?? "GET");
      if (options.method === "POST") return { id: "source-b", displayName: "Source B" };
      return { sources: [
        { id: "source-a", displayName: "Source A", routeStatus: "ready", nodeGrants: [] },
        { id: "source-b", displayName: "Source B", routeStatus: "ready", nodeGrants: [] },
      ], nodes: [] };
    },
  });

  const result = await harness.actualChooseWorkspaceSource();
  assert.deepEqual(calls, ["POST", "GET"]);
  assert.equal(harness.state.profile.workspaceSources.find(source => source.id === "source-b").sourcePath, "C:\\A\\Source B");
  assert.equal(result.sources.find(source => source.id === "source-b").sourcePath, "C:\\A\\Source B");
});

test("Workspace Source manager does not apply a dialog choice after its original profile changes", async () => {
  const choice = deferred();
  const apiCalls = [];
  const harness = await createHarness({
    state: {
      profile: {
        connectionKind: "owner-host", companyId: "company-a",
        workspaceSources: [{ id: "source-a", name: "Source A", sourcePath: "C:\\A" }],
      },
      teamAccess: { enabled: true, hostname: "team-a.test", companyId: "company-a" },
      projects: [], ownerHostOwnerSubject: "account-a", encryptedHostProjectShareSecrets: null,
    },
    ownerHostApiImpl: async (_pathname, options = {}) => {
      apiCalls.push(options.method ?? "GET");
      return {
        sources: [{ id: "source-a", displayName: "Source A", routeStatus: "ready", nodeGrants: [] }],
        nodes: [{ id: "member-a", status: "active", keyVerifiedAt: "verified", transportPublicKey: "public-key", displayName: "Member A" }],
      };
    },
    dialog: { showMessageBox: () => choice.promise },
  });
  const operation = harness.actualShowWorkspaceSourceManager("source-a");
  await new Promise(resolve => setImmediate(resolve));
  harness.state.profile = { connectionKind: "owner-host", companyId: "company-b", workspaceSources: [] };
  choice.resolve({ response: 0 });

  await assert.rejects(operation, /connection changed|authority changed/);
  assert.deepEqual(apiCalls, ["GET"]);
});

test("a failed Workspace Source rename after Core dispatch reports possible Core change", async () => {
  const harness = await createHarness({
    ownerHostApiImpl: async pathname => {
      if (pathname.includes("/sps-workspace-sources/") && pathname.endsWith("source-a")) {
        throw new Error("opaque transport failure");
      }
      return { sources: [], nodes: [] };
    },
  });

  await assert.rejects(harness.actualRenameWorkspaceSource("source-a", "Renamed"), error => {
    assert.ok(error instanceof SpsHostShareReconciliationRequiredError);
    assert.equal(error.coreMayHaveChanged, true);
    assert.equal(error.localAccessMayHaveChanged, false);
    return true;
  });
  assert.equal(harness.state.profile.workspaceSources[0].name, "Source A");
});

test("Workspace Source removal reports a failed local ACL step without claiming Core changed", async () => {
  let coreCalls = 0;
  const harness = await createHarness({
    state: {
      profile: {
        connectionKind: "owner-host", companyId: "company-a",
        workspaceSources: [{ id: "source-a", name: "Source A", sourcePath: "C:\\A" }],
      },
      teamAccess: null, projects: [], ownerHostOwnerSubject: "account-a",
      encryptedHostProjectShareSecrets: JSON.stringify({ version: 1, projects: {
        "source-a": { sourcePath: "C:\\A", shareName: "share-a", sharePath: "\\\\team-a.test\\share-a", grants: {} },
      } }),
    },
    updateSpsHostProjectShareWindowsAccess: async () => { throw new Error("opaque local helper failure"); },
    ownerHostApiImpl: async () => { coreCalls += 1; return { sources: [], nodes: [] }; },
  });

  await assert.rejects(harness.actualRemoveWorkspaceSource("source-a"), error => {
    assert.ok(error instanceof SpsHostShareReconciliationRequiredError);
    assert.equal(error.localAccessMayHaveChanged, true);
    assert.equal(error.coreMayHaveChanged, false);
    return true;
  });
  assert.equal(coreCalls, 0);
  assert.equal(harness.state.profile.workspaceSources[0].id, "source-a");
});

test("Workspace Source removal with an empty grant set clears its owned mapping and secret", async () => {
  const aclActions = [];
  const apiCalls = [];
  const harness = await createHarness({
    state: {
      profile: {
        connectionKind: "owner-host", companyId: "company-a",
        workspaceSources: [{ id: "source-a", name: "Source A", sourcePath: "C:\\A" }],
      },
      teamAccess: null, projects: [], ownerHostOwnerSubject: "account-a",
      encryptedHostProjectShareSecrets: JSON.stringify({ version: 1, projects: {
        "source-a": { sourcePath: "C:\\A", shareName: "share-a", sharePath: "\\\\team-a.test\\share-a", grants: {} },
      } }),
    },
    updateSpsHostProjectShareWindowsAccess: async request => { aclActions.push(request.action); },
    ownerHostApiImpl: async (_pathname, options = {}) => {
      apiCalls.push(options.method ?? "GET");
      return options.method === "DELETE" ? {} : { sources: [], nodes: [] };
    },
  });

  const result = await harness.actualRemoveWorkspaceSource("source-a");
  assert.deepEqual(aclActions, ["remove"]);
  assert.deepEqual(apiCalls, ["DELETE", "GET"]);
  assert.deepEqual(harness.state.profile.workspaceSources, []);
  assert.deepEqual(JSON.parse(harness.state.encryptedHostProjectShareSecrets).projects, {});
  assert.equal(Array.isArray(result.sources), true);
  assert.equal(result.sources.length, 0);
});

test("late project listing cannot return the replacement Owner Host project list", async () => {
  const response = deferred();
  const harness = await createHarness({ ownerHostApiImpl: async () => response.promise });
  const operation = harness.actualListProjectSources();
  await new Promise(resolve => setImmediate(resolve));
  harness.state.profile = {
    connectionKind: "owner-host", companyId: "company-b", projectWorkspaces: { "project-b": "C:\\B" },
  };
  harness.state.projects = [{ id: "project-b", name: "Project B" }];
  response.resolve([{ id: "project-a", name: "Project A" }]);

  await assert.rejects(operation, /superseded|connection changed/);
  assert.equal(harness.state.projects[0].id, "project-b");
});
