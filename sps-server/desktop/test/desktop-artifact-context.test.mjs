import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { withSpsNodeCommandArtifactMaintenance } from "../../desktop-node/src/command-runner.mjs";
import { createSpsNodeClaimJournal } from "../src/node-claim-journal.mjs";

const source = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const start = source.indexOf("function captureDesktopPluginArtifactContext(");
const end = source.indexOf("\nfunction assertRegistryWindowEvent(", start);
assert.ok(start > 0 && end > start);
const implementation = source.slice(start, end);

function fixture() {
  let generation = 1n, restoreGeneration = 0n, scopeCurrent = true, owner = true, input;
  const host = {}, memory = {}, previewManager = {};
  const account = { subject: "host", deviceId: "fixture-device", identityUrl: "https://identity.invalid", verifiedAt: "fixture" };
  const scope = {
    isQuitting: false, desktopStateUnavailable: false,
    app: { getPath: () => "/fixture/profile" }, ownerVaultRoot: () => "/fixture/vault",
    defaultMemoryVaultLayout: vault => ({ configPath: `${vault}/memory/config.json` }),
    state: { profile: { hubUrl: "http://127.0.0.1:31310" } },
    ownerHostStatus: { state: "running", owned: true, url: "http://127.0.0.1:31310" },
    ownerHostManager: host, defaultMemoryManager: memory,
    pluginPreviewRuntime: { manager: previewManager, fixturePath: "/fixture/preview/fixture.json", accessTokenPath: "/fixture/preview/token" },
    currentDesktopAccount: () => account,
    configuredDesktopIdentityUrl: () => "https://identity.invalid",
    assertRegistryOwner() { if (!owner) throw new Error("Not the current Host owner"); },
    captureWorkspaceReadScope: () => ({ assertCurrent() { if (!scopeCurrent) throw new Error("Workspace/account session changed"); } }),
    requireSpsOwnerHostOrigin: value => value,
    ownerVaultOperations: { connectionGeneration: () => generation, isRestoring: () => false, isChangingConnection: () => false },
    ownerHostRestoreRunner: { generation: () => restoreGeneration, isActive: () => false, hasUnconfirmedTermination: () => false },
    readSpsDesktopPluginArtifactInputs: options => { options.assertCurrent(); input = options; return "private-inputs"; },
    currentHostProjectShareSecrets: () => ({ projects: {} }),
    captureSpsDesktopSourceArtifactReferences: options => ({ capturedState: options.readState(), readShareState: options.readShareState }),
    ensureDesktopIdentityAccessToken: async () => "fixture-token",
    withSpsNodeCommandArtifactMaintenance,
    nodeClaimJournal: createSpsNodeClaimJournal({ readEncrypted: () => null, writeEncrypted: async () => {},
      encrypt: value => value, decrypt: value => value }),
    desktopPluginArtifactActivity: {},
    createSpsPluginArtifactObservation: ({ capture }) => ({ async withSnapshot(action) { const context = capture(); context.assertCurrent(); return action(context); } }),
  };
  runInNewContext(`${implementation}\nglobalThis.capture = captureDesktopPluginArtifactContext; globalThis.observe = withDesktopPluginArtifactReferences;`, scope);
  return { scope, account, host, memory, previewManager, capture: scope.capture, observe: scope.observe,
    get input() { return input; }, invalidateSession() { scopeCurrent = false; }, revokeOwner() { owner = false; },
    changeGeneration() { generation++; }, changeRestoreGeneration() { restoreGeneration++; } };
}

test("actual Main context binds the exact Host, optional Preview/Memory and private reader inputs", () => {
  const f = fixture();
  const context = f.capture();
  assert.equal(context.includeSourceInventory, true);
  assert.equal(context.requireSourceReconciliation, true);
  assert.deepEqual(Array.from(context.participants, p => p.id), ["host", "preview"]);
  assert.equal(context.participants[0].manager, f.host);
  assert.equal(context.participants[1].manager, f.previewManager);
  assert.equal(context.readInputs(), "private-inputs");
  assert.equal(f.input.vaultRoot, "/fixture/vault");
  assert.deepEqual(Array.from(f.input.runtimeOwners, p => p.kind), ["core", "core", "memory"]);
  assert.equal(f.input.runtimeOwners[2].manager, f.memory);
  assert.equal(f.input.preview.fixturePath, "/fixture/preview/fixture.json");
  assert.equal(f.input.configuredMemoryPath, "/fixture/vault/memory/config.json");
  const sources = f.input.readSourceReferences();
  assert.equal(sources.capturedState.profile, f.scope.state.profile);
  assert.equal(sources.readShareState, f.scope.currentHostProjectShareSecrets);
});

test("Main discovery omits absent optional participants, never the required Host", () => {
  const f = fixture(); f.scope.pluginPreviewRuntime = null; f.scope.defaultMemoryManager = null;
  const context = f.capture(); context.readInputs();
  assert.deepEqual(Array.from(context.participants, p => p.id), ["host"]);
  assert.equal(f.input.runtimeOwners.length, 1);
  assert.equal(f.input.preview, null);
  assert.equal(f.input.configuredMemoryPath, null);
  f.scope.ownerHostManager = null;
  assert.throws(() => f.capture());
});

const changes = {
  quit: f => { f.scope.isQuitting = true; },
  unreadableState: f => { f.scope.desktopStateUnavailable = true; },
  restore: f => { f.scope.ownerVaultOperations.isRestoring = () => true; },
  retainedRestore: f => { f.scope.ownerHostRestoreRunner.isActive = () => true; },
  uncertainRestore: f => { f.scope.ownerHostRestoreRunner.hasUnconfirmedTermination = () => true; },
  restoreGeneration: f => f.changeRestoreGeneration(),
  connectionChange: f => { f.scope.ownerVaultOperations.isChangingConnection = () => true; },
  generation: f => f.changeGeneration(),
  accountSession: f => f.invalidateSession(),
  owner: f => f.revokeOwner(),
  unverified: f => { f.account.verifiedAt = null; },
  device: f => { f.account.deviceId = "replacement"; },
  issuer: f => { f.account.identityUrl = "https://other.invalid"; },
  profileDirectory: f => { f.scope.app.getPath = () => "/other/profile"; },
  vaultDirectory: f => { f.scope.ownerVaultRoot = () => "/other/vault"; },
  host: f => { f.scope.ownerHostManager = {}; },
  memory: f => { f.scope.defaultMemoryManager = {}; },
  preview: f => { f.scope.pluginPreviewRuntime = { ...f.scope.pluginPreviewRuntime }; },
  previewManager: f => { f.scope.pluginPreviewRuntime.manager = {}; },
  previewFixture: f => { f.scope.pluginPreviewRuntime.fixturePath = "/other/fixture"; },
  previewToken: f => { f.scope.pluginPreviewRuntime.accessTokenPath = "/other/token"; },
  previewConfig: f => { f.scope.pluginPreviewRuntime.configPath = "/other/config"; },
  previewVault: f => { f.scope.pluginPreviewRuntime.previewVault = "/other/preview"; },
  previewBuild: f => { f.scope.pluginPreviewRuntime.buildId = "replacement-build"; },
  previewProject: f => { f.scope.pluginPreviewRuntime.projectId = "replacement-project"; },
  hostState: f => { f.scope.ownerHostStatus.state = "stopping"; },
  unownedHost: f => { f.scope.ownerHostStatus.owned = false; },
  differentHost: f => { f.scope.ownerHostStatus.url = "http://127.0.0.1:31311"; },
};
for (const [name, change] of Object.entries(changes)) {
  test(`Main refuses a captured artifact scope after ${name} changes`, () => {
    const f = fixture(), context = f.capture();
    change(f);
    assert.throws(context.assertCurrent);
    assert.throws(context.readInputs);
  });
}

test("Main denies missing device identity before reading any artifact inputs", () => {
  const f = fixture(); delete f.account.deviceId;
  assert.throws(f.capture);
  assert.equal(f.input, undefined);
});

test("Main joins token validation and rejects old context before entering the Core scope", async () => {
  const f = fixture(); let release;
  f.scope.ensureDesktopIdentityAccessToken = () => new Promise(resolve => { release = resolve; });
  let entered = false;
  const operation = f.observe(() => { entered = true; });
  f.invalidateSession(); release("fixture-token");
  await assert.rejects(operation);
  assert.equal(entered, false);
});

test("Main does not enter the private observation without a current Identity token", async () => {
  const f = fixture(); f.scope.ensureDesktopIdentityAccessToken = async () => null;
  await assert.rejects(f.observe(() => assert.fail("No token authority")), /Sign in again/);
});

test("Main known-input observation explicitly cannot qualify cleanup readiness", async () => {
  const f = fixture();
  await f.observe(scope => {
    assert.equal(scope.coverage, "desktop-known-inputs-and-owned-cores");
    assert.equal(scope.cleanupReady, false);
    assert.equal(Object.isFrozen(scope), true);
  });
});

test("Main Source mutation queue uses the same Desktop artifact admission", () => {
  assert.match(source, /const hostShareMutationCoordinator = createSpsHostShareMutationCoordinator\(\{ withArtifactActivity: desktopPluginArtifactActivity\.withActivity \}\);/);
});

test("Main joins Runner and all-connection journal idle scopes before invoking the caller", async () => {
  const f = fixture(), events = [];
  f.scope.withSpsNodeCommandArtifactMaintenance = async action => {
    events.push("runner-enter");
    try { return await action({ assertCurrent() { events.push("runner-check"); } }); }
    finally { events.push("runner-exit"); }
  };
  f.scope.nodeClaimJournal = { async withArtifactIdle(action) {
    events.push("journal-enter");
    try { return await action({ async assertCurrent() { events.push("journal-check"); } }); }
    finally { events.push("journal-exit"); }
  } };
  await f.observe(async scope => { events.push("callback"); await scope.assertCurrent(); });
  assert.ok(events.indexOf("runner-enter") < events.indexOf("journal-enter"));
  assert.ok(events.indexOf("journal-check") < events.indexOf("callback"));
  assert.ok(events.indexOf("journal-exit") > events.indexOf("callback"));
  assert.ok(events.indexOf("runner-exit") > events.indexOf("journal-exit"));
});

test("Main refuses journal uncertainty without entering the caller and releases the Runner scope", async () => {
  const f = fixture();
  f.scope.nodeClaimJournal = { async withArtifactIdle() { throw new Error("journal uncertain"); } };
  await assert.rejects(f.observe(() => assert.fail("Journal is uncertain")), /journal uncertain/);
  await withSpsNodeCommandArtifactMaintenance(scope => scope.assertCurrent());
});

test("Main combined observation guard expires after the real Runner/journal scopes close", async () => {
  const f = fixture(); let escaped;
  await f.observe(async scope => { escaped = scope; await scope.assertCurrent(); });
  await assert.rejects(escaped.assertCurrent(), error => error.code === "artifact-activity");
});

test("Main gives Native polls the same artifact activity admission", () => {
  const nativeStart = source.indexOf("function ensureNativeNodeController()");
  const nativeEnd = source.indexOf("function ensureNativeIdentityController()", nativeStart);
  assert.match(source.slice(nativeStart, nativeEnd), /withArtifactActivity: desktopPluginArtifactActivity\.withActivity/);
});
