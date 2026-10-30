import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createSpsOwnerVaultOperationGate } from "../src/owner-vault-operation-gate.mjs";
import { normalizeSpsOwnerRestoreAttempts } from "../src/owner-restore-attempts.mjs";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
function section(start, end) {
  const from = main.indexOf(start);
  const to = main.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return main.slice(from, to);
}
const activation = section("async function activateOwnerHostProfile(", "async function startOwnerHost(");
const start = section("async function startOwnerHost(", "async function startOwnerHostWithContext(");
const restore = section("async function restoreOwnerServerFromTransfer()", "async function showPluginRuntimeStatus()");
const bootstrap = section("async function bootstrapOwnerHost()", "async function ownerHostApi(");
const saveProfile = section("async function saveRemoteProfile(", "async function saveRemoteProfileWithContext(");
const accountActions = section("async function startDesktopAccountSignIn()", "function currentTeamCredentials()");

function fixture(phase) {
  let account = { subject: "owner-a", name: "Fixture Owner" };
  const state = { ownerHostOwnerSubject: null, profile: null, ownerRestoreAttempts: [] };
  const root = path.resolve("C:/fixture/vault");
  const calls = [];
  const savedOwners = [];
  const savedAttempts = [];
  let stagedReceipt = null;
  let vaultReceipt = null;
  let restoreInvocation = null;
  let materializeCalls = 0;
  const packagedRuntimeRoot = path.resolve("C:/fixture/user-data/owner-host-runtime/0.4.137");
  const scope = {
    path, process: { execPath: path.resolve("C:/fixture/electron.exe") }, __dirname: path.resolve("C:/fixture/desktop/src"), os: { hostname: () => "fixture" },
    app: { isPackaged: phase === "packaged-runtime", getPath: () => path.resolve("C:/fixture/user-data") },
    desktopStateUnavailable: false, isQuitting: false, state, ownerVaultOperations: createSpsOwnerVaultOperationGate(), ownerRestoreBindingRecovery: null,
    ownerHostRestoreRunner: { hasUnconfirmedTermination: () => false, generation: () => 0n },
    desktopAccountController: { getStatus: () => ({ pending: false }) },
    ensureDesktopIdentityAccessToken: async () => "fixture-token",
    currentDesktopAccount: () => account,
    currentDesktopAccountSubject: () => account?.subject ?? null,
    ownerVaultRoot: () => root,
    ownerHostIsReady: () => false,
    hasPendingLegacyDesktopOwnerAdoption: () => false,
    isOwnerHostProfile: () => state.profile?.connectionKind === "owner-host",
    ownerHostStatus: { url: "http://127.0.0.1:31310" },
    ownerHostCompanies: [],
    requireSpsOwnerHostOrigin: value => value,
    normalizeSpsOwnerRestoreAttempts,
    persistState: async (options) => {
      options?.beforeCommit?.();
      if (phase === "attempt-save-failure") throw new Error("Restore attempt save failed");
      savedOwners.push(state.ownerHostOwnerSubject);
      savedAttempts.push(structuredClone(state.ownerRestoreAttempts));
      calls.push("state-saved");
    },
    readSpsOwnerVaultRestoreReceipt: async () => vaultReceipt,
    writeSpsOwnerVaultRestoreReceipt: async ({ ownerSubject, restoreId, beforeCommit }) => {
      beforeCommit();
      stagedReceipt = { ownerSubject, restoreId };
      calls.push("ownership-receipt-written");
    },
    publicStatus: () => ({ ready: true }),
    sendDesktopAccountStatus: () => calls.push("status-sent"),
    ensureInitialOwnerHostCompany: async () => [],
    maybeOpenWorkspaceForCurrentAccount: async () => {},
    disabledSpsExtensionStatus: () => ({ state: "disabled" }),
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["fixture-transfer"] }), showMessageBox: async () => {} },
    mainWindow: null,
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
    assertSpsOwnerVaultRestoreTarget: async () => ({ root, fresh: true, reason: "bootstrap-only" }),
    nativeIdentityStore: () => ({}),
    resolveSpsOwnerRestoreAttemptDirectory: async ({ id }) => path.join(root, `retained-${id}`),
    shell: { showItemInFolder: directory => calls.push(["revealed", directory]) },
    assertSpsNativeHostCredentialsAbsentForRestore: async () => { calls.push("presence-checked"); },
    inspectSpsOwnerVaultTransfer: async () => ({ bundleRoot: "fixture-transfer" }),
    ensureSpsOwnerHostConfig: async () => {
      calls.push("staging-config");
      return { layout: { configPath: "fixture-config" } };
    },
    importSpsOwnerVaultTransfer: async () => ({ backupFile: "fixture-backup" }),
    materializeCurrentSpsOwnerHostRuntime: async () => { materializeCalls += 1; return packagedRuntimeRoot; },
    resolveSpsOwnerHostRuntime: async () => ({
      command: phase === "packaged-runtime" ? path.join(packagedRuntimeRoot, "node.exe") : "node",
      cwd: phase === "packaged-runtime" ? packagedRuntimeRoot : "fixture-source-core",
      environment: phase === "packaged-runtime"
        ? { SPS_RESTORE_RUNTIME: "packaged-canary" }
        : { SPS_RESTORE_RUNTIME: "source-canary" },
    }),
    runOwnerHostRestoreProcess: async invocation => {
      restoreInvocation = structuredClone(invocation);
      if (phase === "database-stop") throw new Error("Fixture database shutdown unconfirmed");
      calls.push("database-restored");
      if (phase === "quitting-during-restore") scope.isQuitting = true;
      if (phase === "cancelled-after-failed-quit") scope.ownerHostRestoreRunner.generation = () => 1n;
    },
    updateSpsOwnerHostConfig: async () => {},
    refreshOwnerHostCompanies: async () => [],
    fs: {
      rm: async target => {
        calls.push(["remove", target]);
        if (phase === "remove" && target === root) account = { subject: "owner-b", name: "Different Fixture" };
      },
      rename: async () => {
        vaultReceipt = stagedReceipt;
        calls.push("promoted");
        if (phase === "rename") account = { subject: "owner-b", name: "Different Fixture" };
      },
    },
    startOwnerHostWithContext: async ({ activate, expectedSubject, expectedRestoreGeneration }) => {
      calls.push(["start", expectedSubject]);
      if (phase === "start") account = { subject: "owner-b", name: "Different Fixture" };
      if (phase === "profile-save") {
        await assert.rejects(scope.saveRemoteProfile({ hubUrl: "https://other.example" }), /restore to finish/);
        await assert.rejects(scope.startDesktopAccountSignIn(), /restore to finish/);
        await assert.rejects(scope.signOutDesktopAccount(), /restore to finish/);
      }
      scope.ownerHostIsReady = () => true;
      if (!activate) return scope.ownerHostStatus;
      if (phase === "quit-during-host-start") scope.ownerHostRestoreRunner.generation = () => 1n;
      await scope.activateOwnerHostProfile(expectedSubject, expectedRestoreGeneration);
    },
  };
  runInNewContext(`${activation}\n${start}\n${restore}\n${bootstrap}\n${saveProfile}\n${accountActions}\nthis.activateOwnerHostProfile = activateOwnerHostProfile; this.startOwnerHost = startOwnerHost; this.bootstrapOwnerHost = bootstrapOwnerHost; this.restore = restoreOwnerServerFromTransfer; this.reveal = revealOwnerRestoreAttempt; this.saveRemoteProfile = saveRemoteProfile; this.startDesktopAccountSignIn = startDesktopAccountSignIn; this.signOutDesktopAccount = signOutDesktopAccount;`, scope);
  return { scope, calls, state, root, savedOwners, savedAttempts, receipt: () => vaultReceipt, restoreInvocation: () => restoreInvocation, materializeCalls: () => materializeCalls, setAccount: value => { account = value; } };
}

test("the actual Main restore flow checks Native absence and activates only its captured account", async () => {
  const ctx = fixture();
  await ctx.scope.restore();
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-a");
  assert.ok(ctx.calls.filter(value => value === "presence-checked").length >= 3);
  assert.ok(ctx.calls.some(value => Array.isArray(value) && value[0] === "start" && value[1] === "owner-a"));
  assert.equal(ctx.scope.ownerVaultOperations.isRestoring(), false);
  assert.ok(ctx.calls.indexOf("database-restored") < ctx.calls.indexOf("ownership-receipt-written"));
  assert.ok(ctx.calls.indexOf("ownership-receipt-written") < ctx.calls.indexOf("promoted"));
  assert.equal(ctx.receipt().ownerSubject, "owner-a");
  assert.ok(ctx.calls.indexOf("state-saved") < ctx.calls.indexOf("staging-config"));
  assert.equal(ctx.savedAttempts[0][0].ownerSubject, "owner-a");
  assert.equal(ctx.state.ownerRestoreAttempts.length, 0);
});

test("source restore launches Electron in Node mode instead of passing the relative Core command to Windows supervision", async () => {
  const ctx = fixture();
  await ctx.scope.restore();
  assert.equal(ctx.restoreInvocation().command, ctx.scope.process.execPath);
  assert.equal(path.isAbsolute(ctx.restoreInvocation().command), true);
  assert.equal(ctx.materializeCalls(), 0);
  assert.deepEqual(ctx.restoreInvocation().environment, {
    SPS_RESTORE_RUNTIME: "source-canary",
    ELECTRON_RUN_AS_NODE: "1",
  });
});

test("packaged restore preserves its materialized runtime command and environment", async () => {
  const ctx = fixture("packaged-runtime");
  await ctx.scope.restore();
  assert.equal(ctx.materializeCalls(), 1);
  assert.equal(ctx.restoreInvocation().command, path.join("C:/fixture/user-data/owner-host-runtime/0.4.137", "node.exe"));
  assert.equal(ctx.restoreInvocation().cwd, path.resolve("C:/fixture/user-data/owner-host-runtime/0.4.137"));
  assert.deepEqual(ctx.restoreInvocation().environment, { SPS_RESTORE_RUNTIME: "packaged-canary" });
});

test("account changes during bootstrap removal, promotion or Host start never activate a different Owner", async () => {
  for (const phase of ["remove", "rename", "start"]) {
    const ctx = fixture(phase);
    await assert.rejects(ctx.scope.restore(), phase === "remove" ? /account changed/ : /data was retained/);
    assert.notEqual(ctx.state.ownerHostOwnerSubject, "owner-b");
    assert.equal(ctx.state.ownerHostOwnerSubject, phase === "start" ? "owner-a" : null);
    assert.equal(ctx.state.profile, null);
    assert.equal(ctx.scope.ownerVaultOperations.isRestoring(), false);
    assert.equal(ctx.calls.filter(value => Array.isArray(value) && value[0] === "remove" && value[1] === ctx.root).length, 1,
      "An error after promotion must not delete the restored target as if it were staging.");
  }
});

test("Main refuses profile saves and account switches through deferred restored-Host activation", async () => {
  const ctx = fixture("profile-save");
  await ctx.scope.restore();
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-a");
  assert.equal(ctx.state.profile.connectionKind, "owner-host");
});

test("Main preserves restore staging and refuses promotion when database shutdown fails", async () => {
  const ctx = fixture("database-stop");
  await assert.rejects(ctx.scope.restore(), error => {
    assert.match(error.message, /staged was retained for recovery/);
    assert.match(error.cause.message, /database shutdown unconfirmed/);
    return true;
  });
  assert.equal(ctx.calls.includes("promoted"), false);
  assert.equal(ctx.calls.some(value => Array.isArray(value) && (value[0] === "remove" || value[0] === "start")), false);
  assert.equal(ctx.state.ownerHostOwnerSubject, null);
  assert.notEqual(ctx.state.profile?.connectionKind, "owner-host");
  assert.equal(ctx.calls.includes("ownership-receipt-written"), false);
  assert.equal(ctx.state.ownerRestoreAttempts.length, 1);
  assert.equal(ctx.savedAttempts[0][0].id, ctx.state.ownerRestoreAttempts[0].id);
});

test("Native credentials block restore while unchanged Member routing retains the existing fresh-Host behavior", async () => {
  const stale = fixture();
  stale.scope.assertSpsNativeHostCredentialsAbsentForRestore = async () => { throw new Error("Native credentials exist"); };
  await assert.rejects(stale.scope.restore(), /Native credentials exist/);
  assert.equal(stale.calls.includes("database-restored"), false);
  const member = fixture();
  member.state.profile = { connectionKind: "remote" };
  await member.scope.restore();
  assert.equal(member.state.ownerHostOwnerSubject, "owner-a");
  assert.equal(member.state.profile.connectionKind, "owner-host");
});

test("pending account switches and expired sign-in block restore before touching Vault data", async () => {
  const pending = fixture();
  pending.scope.desktopAccountController.getStatus = () => ({ pending: true });
  await assert.rejects(pending.scope.restore(), /Finish the current SPS sign-in/);
  assert.deepEqual(pending.calls, []);
  const expired = fixture();
  expired.scope.ensureDesktopIdentityAccessToken = async () => null;
  await assert.rejects(expired.scope.restore(), /current SPS sign-in is required/);
  assert.deepEqual(expired.calls, []);
});

test("application shutdown blocks a new restore before it touches Vault data", async () => {
  const ctx = fixture();
  ctx.scope.isQuitting = true;
  await assert.rejects(ctx.scope.restore(), /closing/);
  assert.deepEqual(ctx.calls, []);
});

test("application shutdown during database restore prevents staging promotion and Host start", async () => {
  const ctx = fixture("quitting-during-restore");
  await assert.rejects(ctx.scope.restore(), /closing/);
  assert.equal(ctx.calls.includes("database-restored"), true);
  assert.equal(ctx.calls.includes("promoted"), false);
  assert.equal(ctx.calls.some(value => Array.isArray(value) && value[0] === "start"), false);
  assert.equal(ctx.state.ownerHostOwnerSubject, null);
});

test("an earlier unconfirmed restore termination blocks Vault writes and Host activation", async () => {
  const ctx = fixture();
  ctx.scope.ownerHostRestoreRunner.hasUnconfirmedTermination = () => true;
  await assert.rejects(ctx.scope.restore(), /termination is unconfirmed/);
  assert.deepEqual(ctx.calls, []);
  assert.equal(ctx.state.ownerHostOwnerSubject, null);
  await assert.rejects(ctx.scope.startOwnerHost({ activate: true }), /termination is unconfirmed/);
  await assert.rejects(ctx.scope.activateOwnerHostProfile("owner-a"), /termination is unconfirmed/);
  assert.deepEqual(ctx.calls, []);
});

test("a failed quit cannot revive the old restore continuation after the closing flag resets", async () => {
  const ctx = fixture("cancelled-after-failed-quit");
  assert.equal(ctx.scope.isQuitting, false);
  await assert.rejects(ctx.scope.restore(), /closing/);
  assert.equal(ctx.calls.includes("promoted"), false);
  assert.equal(ctx.state.ownerHostOwnerSubject, null);
});

test("quit invalidation during restored Host startup cannot claim the Owner profile", async () => {
  const ctx = fixture("quit-during-host-start");
  await assert.rejects(ctx.scope.restore(), /restored SPS data was retained/);
  assert.equal(ctx.calls.includes("promoted"), true);
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-a");
  assert.notEqual(ctx.state.profile?.connectionKind, "owner-host");
  assert.ok(ctx.savedOwners.includes("owner-a"));
});

test("a promoted restore retains its original account across an interrupted Desktop activation", async () => {
  const ctx = fixture("rename");
  await assert.rejects(ctx.scope.restore(), /restored SPS data was retained/);
  assert.equal(ctx.state.ownerHostOwnerSubject, null);
  assert.equal(ctx.receipt().ownerSubject, "owner-a");
  const starts = ctx.calls.filter(value => Array.isArray(value) && value[0] === "start").length;
  await assert.rejects(ctx.scope.startOwnerHost({ activate: true }), /original restoring account/);
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-a");
  assert.ok(ctx.savedOwners.includes("owner-a"));
  assert.equal(ctx.calls.filter(value => Array.isArray(value) && value[0] === "start").length, starts);
  ctx.setAccount({ subject: "owner-a", name: "Original Owner" });
  await ctx.scope.startOwnerHost({ activate: true });
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-a");
  assert.equal(ctx.state.profile.connectionKind, "owner-host");
});

test("a conflicting saved Owner cannot replace a restored Vault binding", async () => {
  const ctx = fixture("rename");
  await assert.rejects(ctx.scope.restore());
  ctx.state.ownerHostOwnerSubject = "owner-b";
  ctx.setAccount({ subject: "owner-b", name: "Other Owner" });
  const beforeRecoverySaves = ctx.savedOwners.length;
  await assert.rejects(ctx.scope.startOwnerHost({ activate: true }), /ownership conflicts/);
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-b");
  assert.equal(ctx.savedOwners.length, beforeRecoverySaves);
});

test("a failed attempt-record save aborts before staging data is created", async () => {
  const ctx = fixture("attempt-save-failure");
  await assert.rejects(ctx.scope.restore(), /Restore attempt save failed/);
  assert.equal(ctx.calls.includes("staging-config"), false);
  assert.equal(ctx.calls.includes("database-restored"), false);
  assert.equal(ctx.state.ownerRestoreAttempts.length, 0);
});

test("preserved restore reveal requires the original account and an exact recorded ID", async () => {
  const ctx = fixture("database-stop");
  await assert.rejects(ctx.scope.restore());
  const id = ctx.state.ownerRestoreAttempts[0].id;
  ctx.setAccount({ subject: "owner-b", name: "Other account" });
  await assert.rejects(ctx.scope.reveal(id), /account or restore record changed/);
  ctx.setAccount({ subject: "owner-a", name: "Original account" });
  await assert.rejects(ctx.scope.reveal("../other-vault"), /account or restore record changed/);
  assert.equal(ctx.calls.some(value => Array.isArray(value) && value[0] === "revealed"), false);
  await ctx.scope.reveal(id);
  assert.equal(ctx.calls.filter(value => Array.isArray(value) && value[0] === "revealed").length, 1);
  assert.equal(ctx.state.ownerRestoreAttempts.length, 1, "Revealing must not retire or delete restore data.");
});

test("account changes and same-account connection ABA invalidate an awaited restore reveal", async () => {
  for (const change of ["different-account", "same-account-aba"]) {
    const ctx = fixture("database-stop");
    await assert.rejects(ctx.scope.restore());
    const id = ctx.state.ownerRestoreAttempts[0].id;
    ctx.scope.resolveSpsOwnerRestoreAttemptDirectory = async () => {
      if (change === "different-account") ctx.setAccount({ subject: "owner-b", name: "Other account" });
      else await ctx.scope.ownerVaultOperations.changeConnection(async () => {});
      return ctx.root;
    };
    await assert.rejects(ctx.scope.reveal(id), /account or restore record changed/);
    assert.equal(ctx.calls.some(value => Array.isArray(value) && value[0] === "revealed"), false);
  }
});

test("concurrent Host starts join durable recovery and cannot use an uncommitted Owner binding", async () => {
  const ctx = fixture("rename");
  await assert.rejects(ctx.scope.restore());
  ctx.setAccount({ subject: "owner-a", name: "Original Owner" });
  let rejectSave;
  let entered;
  const saving = new Promise(resolve => { entered = resolve; });
  ctx.scope.persistState = async () => {
    entered();
    return new Promise((resolve, reject) => { rejectSave = reject; });
  };
  const first = ctx.scope.startOwnerHost({ activate: true });
  await saving;
  const second = ctx.scope.startOwnerHost({ activate: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.calls.some(value => Array.isArray(value) && value[0] === "start"), false);
  const outcomes = Promise.allSettled([first, second]);
  rejectSave(new Error("Fixture ownership save failed"));
  for (const outcome of await outcomes) {
    assert.equal(outcome.status, "rejected");
    assert.match(outcome.reason.message, /ownership save failed/);
  }
  assert.equal(ctx.state.ownerHostOwnerSubject, null);
  assert.equal(ctx.receipt().ownerSubject, "owner-a");
  ctx.scope.persistState = async options => options?.beforeCommit?.();
  await ctx.scope.startOwnerHost({ activate: true });
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-a");
});

test("Desktop startup recovers the promoted Vault owner without assigning another account its profile", async () => {
  const ctx = fixture("rename");
  await assert.rejects(ctx.scope.restore());
  await ctx.scope.bootstrapOwnerHost();
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-a");
  assert.equal(ctx.state.profile, null);
  assert.ok(ctx.savedOwners.includes("owner-a"));
  await assert.rejects(ctx.scope.startOwnerHost({ activate: true }), /original restoring account/);
});

test("invalid restored ownership or a failed settings save stops startup and preserves the Vault binding", async () => {
  for (const phase of ["invalid-receipt", "save-failure"]) {
    const ctx = fixture("rename");
    await assert.rejects(ctx.scope.restore());
    if (phase === "invalid-receipt") ctx.scope.readSpsOwnerVaultRestoreReceipt = async () => { throw new Error("Invalid restore ownership"); };
    else ctx.scope.persistState = async () => { throw new Error("Ownership settings save failed"); };
    await ctx.scope.bootstrapOwnerHost();
    assert.equal(ctx.scope.ownerHostStatus.state, "stopped");
    assert.equal(ctx.calls.some(value => Array.isArray(value) && value[0] === "start"), false);
    assert.equal(ctx.state.ownerHostOwnerSubject, null);
    assert.equal(ctx.receipt().ownerSubject, "owner-a");
  }
});
