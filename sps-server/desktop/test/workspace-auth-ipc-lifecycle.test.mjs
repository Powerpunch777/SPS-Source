import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");

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

function createAuthHarness(overrides = {}) {
  const handlers = new Map();
  const calls = { opened: 0, saved: 0 };
  const sandbox = {
    state: {
      profile: { connectionKind: "remote", authMode: "sps-identity", hubUrl: "https://host-a.test", companyId: "" },
      teamAccess: null,
      companies: [],
    },
    ownerHostInstanceGeneration: 0,
    identityTeamContextRequestGeneration: 0,
    desktopAuthPollRequestGeneration: 0,
    ownerHostManager: null,
    ownerHostStatus: { url: null, startedAt: null },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    structuredClone,
    currentDesktopAccountSubject: () => "account-a",
    currentDesktopSessionEpoch: () => 1,
    isOwnerHostProfile: profile => (profile ?? sandbox.state.profile)?.connectionKind === "owner-host",
    isSpsIdentityRemoteProfile: () => sandbox.state.profile?.authMode === "sps-identity",
    ownerHostIsReady: () => false,
    requireSpsCoreRequestAccess: async () => ({ sessionCookie: "fixture-cookie" }),
    listSpsCompanies: async () => [{ id: "company-a", name: "A" }],
    normalizeCompanyList: value => value.map(({ id, name }) => ({ id, name })),
    refreshProjects: async () => [],
    persistState: async ({ beforeCommit }) => { beforeCommit(); calls.saved += 1; },
    maybeOpenWorkspaceForCurrentAccount: async () => { calls.opened += 1; },
    publicStatus: () => ({ companyId: sandbox.state.profile?.companyId ?? null }),
    ...overrides,
  };
  vm.runInNewContext([
    section("function captureWorkspaceReadScope(", "async function acceptSpsIdentityInvite("),
    section("function staleWorkspaceReadError(", "async function refreshProjects("),
    section('  ipcMain.handle("desktop:start-auth",', '  ipcMain.handle("desktop:scan-capabilities",'),
  ].join("\n"), sandbox, { filename: "actual-workspace-auth-ipc.mjs" });
  return { sandbox, handlers, calls };
}

test("actual connect IPC adapter discards Electron event and renderer arguments", async () => {
  let handler;
  let argumentsSeen;
  vm.runInNewContext(section('  ipcMain.handle("desktop:connect-node",', '  ipcMain.handle("desktop:disconnect-node",'), {
    ipcMain: { handle: (_name, callback) => { handler = callback; } },
    connectNode: async (...args) => { argumentsSeen = args; return "connected"; },
  });
  assert.equal(await handler({ sender: { id: 123 } }, { generation: "untrusted-renderer" }), "connected");
  assert.equal(argumentsSeen.length, 0);
});

for (const channel of ["desktop:start-auth", "desktop:poll-auth"]) {
  test(`${channel} actual handler preserves its own single-Workspace auto-selection`, async () => {
    const { sandbox, handlers, calls } = createAuthHarness();
    const result = await handlers.get(channel)({ sender: { id: 123 } });
    assert.equal(sandbox.state.profile.companyId, "company-a");
    assert.equal(result.companyId, "company-a");
    assert.equal(result.auth.status, "approved");
    assert.equal(result.auth.companyAccess, "selected");
    assert.equal(calls.saved, 1);
    assert.equal(calls.opened, 1);
  });

  test(`${channel} actual handler withholds replacement Workspace state after a late lookup`, async () => {
    const response = deferred();
    const started = deferred();
    const { sandbox, handlers, calls } = createAuthHarness({
      listSpsCompanies: async () => { started.resolve(); return response.promise; },
    });
    const work = handlers.get(channel)({ sender: { id: 123 } });
    const rejection = assert.rejects(work, /superseded|changed during/);
    await started.promise;
    sandbox.state.profile = { connectionKind: "remote", authMode: "sps-identity", hubUrl: "https://host-b.test", companyId: "company-b" };
    sandbox.state.companies = [{ id: "company-b", name: "B" }];
    response.resolve([{ id: "company-a", name: "A" }]);
    await rejection;
    assert.equal(sandbox.state.profile.companyId, "company-b");
    assert.equal(sandbox.state.companies[0].id, "company-b");
    assert.equal(calls.saved, 0);
    assert.equal(calls.opened, 0);
  });
}
