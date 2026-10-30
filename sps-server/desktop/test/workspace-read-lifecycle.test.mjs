import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

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

async function createReadHarness(overrides = {}, { includeProjectFunctions = true, includeAuthHandlers = false } = {}) {
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");
  let sessionEpoch = 1;
  const managerA = {};
  const pendingCompanyLists = [];
  const pendingProjectLists = [];
  const sandbox = {
    state: {
      profile: { hubUrl: "https://hub-a.test", companyId: "company-a", connectionKind: "remote", authMode: "sps-identity" },
      teamAccess: null,
      companies: [{ id: "company-a", name: "A cached" }],
      projects: [{ id: "project-a-old", name: "A old" }],
      ownerHostOwnerSubject: "account-a",
    },
    ownerHostManager: managerA,
    ownerHostStatus: { state: "running", url: "http://127.0.0.1:4400", startedAt: "host-start-1" },
    ownerHostInstanceGeneration: 1,
    ownerHostCompanies: [],
    ownerHostCompaniesRequestGeneration: 0,
    ownerHostCompaniesResolvedGeneration: 0,
    identityTeamContextRequestGeneration: 0,
    workspaceProjectsRequestGeneration: 0,
    currentDesktopAccountSubject: () => "account-a",
    currentDesktopSessionEpoch: () => sessionEpoch,
    setSessionEpoch: value => { sessionEpoch = value; },
    isOwnerHostProfile: profile => (profile ?? sandbox.state.profile)?.connectionKind === "owner-host",
    isSpsIdentityRemoteProfile: profile => (profile ?? sandbox.state.profile)?.connectionKind === "remote"
      && (profile ?? sandbox.state.profile)?.authMode === "sps-identity",
    ownerHostIsReady: () => sandbox.ownerHostStatus.state === "running" || sandbox.ownerHostStatus.state === "running-existing",
    structuredClone,
    JSON,
    Error,
    requireSpsCoreRequestAccess: async (_hubUrl, profile) => ({ accessToken: `token-${profile.companyId}` }),
    resolveSpsCoreRequestAccess: async (_hubUrl, profile) => ({ accessToken: `token-${profile.companyId}` }),
    listSpsCompanies: async () => {
      const next = pendingCompanyLists.shift();
      return next ? await next.promise : [{ id: "company-a", name: "A" }];
    },
    listSpsProjects: async ({ companyId }) => {
      const next = pendingProjectLists.shift();
      return next ? await next.promise : [{ id: `project-${companyId}`, name: companyId }];
    },
    ownerHostApi: async (pathname, { assertCurrent = () => {} } = {}) => {
      assertCurrent();
      const response = sandbox.ownerHostApiImpl(pathname);
      const value = await response;
      assertCurrent();
      return value;
    },
    ownerHostApiImpl: async pathname => pathname === "/companies"
      ? [{ id: "company-a", name: "A" }]
      : [{ id: "project-company-a", name: "A project" }],
    refreshProjects: async () => [],
    capturedHandlers: new Map(),
    ipcMain: { handle(name, handler) { sandbox.capturedHandlers.set(name, handler); } },
    publicStatus: () => ({ companyIds: sandbox.state.companies.map(company => company.id), companyId: sandbox.state.profile?.companyId ?? null }),
    maybeOpenWorkspaceForCurrentAccount: async () => { sandbox.openWorkspaceCalls += 1; },
    openWorkspaceCalls: 0,
    persistState: async ({ beforeCommit = () => {} } = {}) => { beforeCommit(); },
    ...overrides,
  };
  sandbox.setCompanyList = promise => { pendingCompanyLists.push(promise); };
  sandbox.setProjectList = promise => { pendingProjectLists.push(promise); };
  sandbox.globalThis = sandbox;
  const code = [
    sourceBetween(main, "function captureWorkspaceReadScope(", "async function acceptSpsIdentityInvite("),
    sourceBetween(main, "function normalizeCompanyList(", "function initialOwnerHostCompanyName("),
    ...(includeProjectFunctions ? [sourceBetween(main, "function normalizeProjectList(", "function stopNodeScheduling(")] : []),
    ...(includeAuthHandlers ? [sourceBetween(main, 'ipcMain.handle("desktop:start-auth"', 'ipcMain.handle("desktop:scan-capabilities"')] : []),
    "globalThis.actualRefreshTeamContext = refreshSpsIdentityTeamContext; globalThis.actualRefreshOwnerCompanies = refreshOwnerHostCompanies; globalThis.actualRefreshProjects = refreshProjects; globalThis.captureWorkspaceReadScope = captureWorkspaceReadScope;",
  ].join("\n");
  vm.runInNewContext(code, sandbox, { filename: "main-workspace-read-extract.mjs" });
  return sandbox;
}

test("late team-context response cannot overwrite the new profile's company selector", async () => {
  const response = deferred();
  let persistenceCalls = 0;
  const harness = await createReadHarness({
    listSpsCompanies: async () => response.promise,
    persistState: async ({ beforeCommit }) => { persistenceCalls += 1; beforeCommit(); },
  }, { includeProjectFunctions: false });
  const running = harness.actualRefreshTeamContext();
  const observed = running.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  harness.state.profile = { hubUrl: "https://hub-b.test", companyId: "company-b", connectionKind: "remote", authMode: "sps-identity" };
  harness.state.companies = [{ id: "company-b", name: "B" }];
  response.resolve([{ id: "company-a-result", name: "A result" }]);

  assert.equal((await observed).value, null);
  assert.equal(harness.state.profile.companyId, "company-b");
  assert.deepEqual(harness.state.companies.map(company => company.id), ["company-b"]);
  assert.equal(persistenceCalls, 0);
});

test("shared read scope accepts only its own company auto-selection mutation", async () => {
  const harness = await createReadHarness({
    state: {
      profile: { hubUrl: "https://hub-a.test", companyId: "", connectionKind: "remote", authMode: "sps-identity" },
      teamAccess: null,
      companies: [],
      projects: [],
      ownerHostOwnerSubject: "account-a",
    },
    listSpsCompanies: async () => [{ id: "company-a-only", name: "Only company" }],
  }, { includeProjectFunctions: false });
  const scope = harness.captureWorkspaceReadScope();

  const result = await harness.actualRefreshTeamContext(scope);

  assert.deepEqual(result.map(company => company.id), ["company-a-only"]);
  assert.equal(harness.state.profile.companyId, "company-a-only");
  assert.equal(scope.isCurrent(), true);
});

test("actual start-auth and identity poll-auth handlers retain their own single-company selector binding", async () => {
  for (const [handlerName, mainMarker] of [
    ["desktop:start-auth", 'ipcMain.handle("desktop:start-auth"'],
    ["desktop:poll-auth", 'ipcMain.handle("desktop:poll-auth"'],
  ]) {
    const harness = await createReadHarness({
      state: {
        profile: { hubUrl: "https://hub-a.test", companyId: "", connectionKind: "remote", authMode: "sps-identity" },
        teamAccess: null,
        companies: [],
        projects: [],
        ownerHostOwnerSubject: "account-a",
      },
      listSpsCompanies: async () => [{ id: "company-a-only", name: "Only company" }],
    }, { includeProjectFunctions: false, includeAuthHandlers: true });
    const handler = harness.capturedHandlers.get(handlerName);
    assert.equal(typeof handler, "function", `${handlerName} must come from Main's actual IPC registration`);
    const result = await handler({ sender: { id: "setup-window" } });
    assert.equal(result.auth.status, "approved");
    assert.equal(result.auth.companyAccess, "selected");
    assert.equal(harness.state.profile.companyId, "company-a-only");
    assert.equal(harness.openWorkspaceCalls, 1);
  }
});

test("team-context response from the previous same-account session epoch is ignored", async () => {
  const response = deferred();
  let persistenceCalls = 0;
  const harness = await createReadHarness({
    listSpsCompanies: async () => response.promise,
    persistState: async ({ beforeCommit }) => { persistenceCalls += 1; beforeCommit(); },
  }, { includeProjectFunctions: false });
  const running = harness.actualRefreshTeamContext();
  const observed = running.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  harness.setSessionEpoch(2);
  response.resolve([{ id: "company-a-result", name: "A result" }]);

  assert.equal((await observed).value, null);
  assert.equal(harness.currentDesktopAccountSubject(), "account-a");
  assert.equal(harness.state.profile.companyId, "company-a");
  assert.deepEqual(harness.state.companies.map(company => company.id), ["company-a"]);
  assert.equal(persistenceCalls, 0);
});

test("older team-context save cannot commit after a newer same-profile company refresh wins", async () => {
  const firstResponse = deferred();
  const secondResponse = deferred();
  const firstSave = deferred();
  let fetchCount = 0;
  let persistCount = 0;
  const commits = [];
  const harness = await createReadHarness({
    listSpsCompanies: async () => (++fetchCount === 1 ? firstResponse.promise : secondResponse.promise),
    persistState: async ({ beforeCommit }) => {
      persistCount += 1;
      if (persistCount === 1) {
        await firstSave.promise;
        beforeCommit();
      } else {
        beforeCommit();
        commits.push(harness.state.companies.map(company => company.id));
      }
    },
  }, { includeProjectFunctions: false });
  const first = harness.actualRefreshTeamContext().then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  firstResponse.resolve([{ id: "company-a-old", name: "Old result" }]);
  await new Promise(resolve => setImmediate(resolve));
  const second = harness.actualRefreshTeamContext();
  await new Promise(resolve => setImmediate(resolve));
  secondResponse.resolve([{ id: "company-a-new", name: "New result" }]);
  assert.deepEqual((await second).map(company => company.id), ["company-a-new"]);
  firstSave.resolve();

  assert.equal((await first).value, null);
  assert.deepEqual(commits, [["company-a-new"]]);
  assert.deepEqual(harness.state.companies.map(company => company.id), ["company-a-new"]);
});

test("late project response cannot overwrite a replacement profile's projects", async () => {
  const response = deferred();
  let persistenceCalls = 0;
  const harness = await createReadHarness({
    listSpsProjects: async () => response.promise,
    persistState: async ({ beforeCommit }) => { persistenceCalls += 1; beforeCommit(); },
  });
  const running = harness.actualRefreshProjects();
  const observed = running.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  harness.state.profile = { hubUrl: "https://hub-b.test", companyId: "company-b", connectionKind: "remote", authMode: "sps-identity" };
  harness.state.projects = [{ id: "project-b", name: "B" }];
  response.resolve([{ id: "project-a-late", name: "A late" }]);

  const result = await observed;
  assert.equal(result.value, undefined);
  assert.match(result.error?.message ?? "", /superseded/);
  assert.doesNotMatch(JSON.stringify(result), /project-b/);
  assert.deepEqual(harness.state.projects.map(project => project.id), ["project-b"]);
  assert.equal(persistenceCalls, 0);
});

test("same-profile project refreshes are latest-request-wins", async () => {
  const firstResponse = deferred();
  const secondResponse = deferred();
  let fetchCount = 0;
  const commits = [];
  const harness = await createReadHarness({
    listSpsProjects: async () => (++fetchCount === 1 ? firstResponse.promise : secondResponse.promise),
    persistState: async ({ beforeCommit }) => { beforeCommit(); commits.push(harness.state.projects.map(project => project.id)); },
  });
  const first = harness.actualRefreshProjects();
  const firstObserved = first.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  const second = harness.actualRefreshProjects();
  await new Promise(resolve => setImmediate(resolve));
  secondResponse.resolve([{ id: "project-new", name: "New" }]);
  await second;
  firstResponse.resolve([{ id: "project-old", name: "Old" }]);

  const firstResult = await firstObserved;
  assert.equal(firstResult.value, undefined);
  assert.match(firstResult.error?.message ?? "", /superseded/);
  assert.doesNotMatch(JSON.stringify(firstResult), /project-new/);
  assert.deepEqual(harness.state.projects.map(project => project.id), ["project-new"]);
  assert.deepEqual(commits, [["project-new"]]);
});

test("Owner Host project fallback survives its initial ready-state transition", async () => {
  const harness = await createReadHarness({
    state: {
      profile: { connectionKind: "owner-host", hubUrl: "http://127.0.0.1:4400", companyId: "", projectWorkspaces: {} },
      teamAccess: null,
      companies: [],
      projects: [],
      ownerHostOwnerSubject: "account-a",
    },
    ownerHostStatus: { state: "starting", url: "http://127.0.0.1:4400", startedAt: null },
    ownerHostCompanies: [],
    ownerHostApiImpl: async pathname => {
      if (pathname === "/companies") {
        harness.ownerHostStatus.state = "running";
        return [{ id: "company-owner", name: "Owner Workspace" }];
      }
      return [{ id: "project-owner", name: "Owner project" }];
    },
  });

  const projects = await harness.actualRefreshProjects();

  assert.deepEqual(projects.map(project => project.id), ["project-owner"]);
  assert.equal(harness.state.profile.companyId, "company-owner");
  assert.deepEqual(harness.ownerHostCompanies.map(company => company.id), ["company-owner"]);
});

test("Owner Host companies and projects from an old instance are discarded after restart", async () => {
  const companyResponse = deferred();
  const harness = await createReadHarness({
    state: {
      profile: { connectionKind: "owner-host", hubUrl: "http://127.0.0.1:4400", companyId: "company-owner", projectWorkspaces: {} },
      teamAccess: null,
      companies: [],
      projects: [{ id: "project-new-host", name: "New Host" }],
      ownerHostOwnerSubject: "account-a",
    },
    ownerHostCompanies: [{ id: "company-owner", name: "Owner" }],
    ownerHostApiImpl: async pathname => pathname === "/companies" ? companyResponse.promise : companyResponse.promise,
  });
  const refreshingCompanies = harness.actualRefreshOwnerCompanies();
  const observedCompanies = refreshingCompanies.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  harness.ownerHostInstanceGeneration += 1;
  harness.ownerHostManager = {};
  harness.ownerHostStatus = { ...harness.ownerHostStatus, startedAt: "host-start-2" };
  harness.ownerHostCompanies = [{ id: "company-new-host", name: "New Host" }];
  companyResponse.resolve([{ id: "company-old-host", name: "Old Host" }]);

  const companiesResult = await observedCompanies;
  assert.equal(Array.isArray(companiesResult.value), true);
  assert.equal(companiesResult.value.length, 0);
  assert.doesNotMatch(JSON.stringify(companiesResult), /company-new-host/);
  assert.deepEqual(harness.ownerHostCompanies.map(company => company.id), ["company-new-host"]);
});

test("Owner Host project response is discarded when its captured manager instance restarts", async () => {
  const projectResponse = deferred();
  let persistenceCalls = 0;
  const harness = await createReadHarness({
    state: {
      profile: { connectionKind: "owner-host", hubUrl: "http://127.0.0.1:4400", companyId: "company-owner", projectWorkspaces: {} },
      teamAccess: null,
      companies: [],
      projects: [{ id: "project-new-host", name: "New Host" }],
      ownerHostOwnerSubject: "account-a",
    },
    ownerHostApiImpl: async () => projectResponse.promise,
    persistState: async ({ beforeCommit }) => { persistenceCalls += 1; beforeCommit(); },
  });
  const running = harness.actualRefreshProjects();
  const observed = running.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  harness.ownerHostInstanceGeneration += 1;
  harness.ownerHostManager = {};
  harness.ownerHostStatus = { ...harness.ownerHostStatus, startedAt: "host-start-2" };
  projectResponse.resolve([{ id: "project-old-host", name: "Old Host" }]);

  const result = await observed;
  assert.equal(result.value, undefined);
  assert.match(result.error?.message ?? "", /superseded/);
  assert.doesNotMatch(JSON.stringify(result), /project-new-host/);
  assert.deepEqual(harness.state.projects.map(project => project.id), ["project-new-host"]);
  assert.equal(persistenceCalls, 0);
});

test("Owner Host project response is discarded after a company selector change", async () => {
  const projectResponse = deferred();
  let persistenceCalls = 0;
  const harness = await createReadHarness({
    state: {
      profile: { connectionKind: "owner-host", hubUrl: "http://127.0.0.1:4400", companyId: "company-old", projectWorkspaces: {} },
      teamAccess: null,
      companies: [],
      projects: [{ id: "project-new-company", name: "New company" }],
      ownerHostOwnerSubject: "account-a",
    },
    ownerHostApiImpl: async () => projectResponse.promise,
    persistState: async ({ beforeCommit }) => { persistenceCalls += 1; beforeCommit(); },
  });
  const running = harness.actualRefreshProjects();
  const observed = running.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  harness.state.profile.companyId = "company-new";
  projectResponse.resolve([{ id: "project-old-company", name: "Old company" }]);

  const result = await observed;
  assert.equal(result.value, undefined);
  assert.match(result.error?.message ?? "", /superseded/);
  assert.doesNotMatch(JSON.stringify(result), /project-new-company/);
  assert.equal(harness.state.profile.companyId, "company-new");
  assert.equal(persistenceCalls, 0);
});

test("Owner Host API read requests recheck captured scope around readiness, session, and response awaits", async () => {
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");
  const source = sourceBetween(main, "async function ownerHostApi(", "async function listCurrentOwnerIdentityCompanies(");
  assert.match(source, /async function ownerHostApi\([\s\S]*?assertCurrent = \(\) => \{\}/);
  assert.match(source, /assertCurrent\(\);\s*await requireReadyOwnerHost\(\);\s*assertCurrent\(\);/);
  assert.match(source, /await establishSpsIdentityCoreSession\(ownerHostOrigin\);\s*assertCurrent\(\);/);
  assert.match(source, /response = await fetch\([\s\S]*?assertCurrent\(\);\s*const text = await response\.text\(\);\s*assertCurrent\(\);/);
  assert.match(main, /ownerHostApi\("\/companies", \{ assertCurrent \}\)/);
  assert.match(main, /ownerHostApi\(`\/companies\/\$\{encodeURIComponent\(companyId\)\}\/projects`, \{ assertCurrent \}\)/);
});

test("Main IPC wraps connectNode so Electron's event is not interpreted as its lifetime ticket", async () => {
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");
  assert.match(main, /ipcMain\.handle\("desktop:connect-node", async \(\) => await connectNode\(\)\)/);
  assert.doesNotMatch(main, /ipcMain\.handle\("desktop:connect-node", connectNode\)/);
  assert.match(main, /ipcMain\.handle\("desktop:disconnect-node", async \(\) => \{[\s\S]*?await disconnectCurrentNode\(\)/);
});
