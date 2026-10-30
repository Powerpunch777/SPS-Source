import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createSpsOwnerVaultOperationGate } from "../src/owner-vault-operation-gate.mjs";

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
const saveProfile = section("async function saveRemoteProfile(", "async function saveRemoteProfileWithContext(");
const accountActions = section("async function startDesktopAccountSignIn()", "function currentTeamCredentials()");

function fixture(phase) {
  let account = { subject: "owner-a", name: "Fixture Owner" };
  const state = { ownerHostOwnerSubject: null, profile: null };
  const root = path.resolve("C:/fixture/vault");
  const calls = [];
  const scope = {
    path, process: { execPath: "fixture-node" }, __dirname: path.resolve("C:/fixture/desktop/src"), os: { hostname: () => "fixture" },
    app: { isPackaged: false, getPath: () => path.resolve("C:/fixture/user-data") },
    desktopStateUnavailable: false, state, ownerVaultOperations: createSpsOwnerVaultOperationGate(),
    desktopAccountController: { getStatus: () => ({ pending: false }) },
    ensureDesktopIdentityAccessToken: async () => "fixture-token",
    currentDesktopAccount: () => account,
    currentDesktopAccountSubject: () => account?.subject ?? null,
    ownerVaultRoot: () => root,
    ownerHostIsReady: () => false,
    isOwnerHostProfile: () => state.profile?.connectionKind === "owner-host",
    ownerHostStatus: { url: "http://127.0.0.1:31310" },
    ownerHostCompanies: [],
    requireSpsOwnerHostOrigin: value => value,
    persistState: async () => {},
    publicStatus: () => ({ ready: true }),
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ["fixture-transfer"] }), showMessageBox: async () => {} },
    mainWindow: null,
    randomUUID: () => "fixture-restore",
    assertSpsOwnerVaultRestoreTarget: async () => ({ root, fresh: true, reason: "bootstrap-only" }),
    nativeIdentityStore: () => ({}),
    assertSpsNativeHostCredentialsAbsentForRestore: async () => { calls.push("presence-checked"); },
    inspectSpsOwnerVaultTransfer: async () => ({ bundleRoot: "fixture-transfer" }),
    ensureSpsOwnerHostConfig: async () => ({ layout: { configPath: "fixture-config" } }),
    importSpsOwnerVaultTransfer: async () => ({ backupFile: "fixture-backup" }),
    resolveSpsOwnerHostRuntime: async () => ({ command: "fixture", cwd: "fixture", environment: {} }),
    runOwnerHostRestoreProcess: async () => {
      if (phase === "database-stop") throw new Error("Fixture database shutdown unconfirmed");
      calls.push("database-restored");
    },
    updateSpsOwnerHostConfig: async () => {},
    refreshOwnerHostCompanies: async () => [],
    fs: {
      rm: async target => {
        calls.push(["remove", target]);
        if (phase === "remove" && target === root) account = { subject: "owner-b", name: "Different Fixture" };
      },
      rename: async () => {
        calls.push("promoted");
        if (phase === "rename") account = { subject: "owner-b", name: "Different Fixture" };
      },
    },
    startOwnerHostWithContext: async ({ expectedSubject }) => {
      calls.push(["start", expectedSubject]);
      if (phase === "start") account = { subject: "owner-b", name: "Different Fixture" };
      if (phase === "profile-save") {
        await assert.rejects(scope.saveRemoteProfile({ hubUrl: "https://other.example" }), /restore to finish/);
        await assert.rejects(scope.startDesktopAccountSignIn(), /restore to finish/);
        await assert.rejects(scope.signOutDesktopAccount(), /restore to finish/);
      }
      scope.ownerHostIsReady = () => true;
      await scope.activateOwnerHostProfile(expectedSubject);
    },
  };
  runInNewContext(`${activation}\n${start}\n${restore}\n${saveProfile}\n${accountActions}\nthis.activateOwnerHostProfile = activateOwnerHostProfile; this.restore = restoreOwnerServerFromTransfer; this.saveRemoteProfile = saveRemoteProfile; this.startDesktopAccountSignIn = startDesktopAccountSignIn; this.signOutDesktopAccount = signOutDesktopAccount;`, scope);
  return { scope, calls, state, root };
}

test("the actual Main restore flow checks Native absence and activates only its captured account", async () => {
  const ctx = fixture();
  await ctx.scope.restore();
  assert.equal(ctx.state.ownerHostOwnerSubject, "owner-a");
  assert.ok(ctx.calls.filter(value => value === "presence-checked").length >= 3);
  assert.ok(ctx.calls.some(value => Array.isArray(value) && value[0] === "start" && value[1] === "owner-a"));
  assert.equal(ctx.scope.ownerVaultOperations.isRestoring(), false);
});

test("account changes during bootstrap removal, promotion or Host start never activate a different Owner", async () => {
  for (const phase of ["remove", "rename", "start"]) {
    const ctx = fixture(phase);
    await assert.rejects(ctx.scope.restore(), phase === "remove" ? /account changed/ : /data was retained/);
    assert.notEqual(ctx.state.ownerHostOwnerSubject, "owner-b");
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
