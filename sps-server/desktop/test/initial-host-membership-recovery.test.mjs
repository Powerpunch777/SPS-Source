import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { recoverSpsTechnicalMembership } from "../src/owner-membership-recovery.mjs";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
function section(start, end) {
  const from = main.indexOf(start), to = main.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return main.slice(from, to);
}
const target = { id: "old/workspace", name: "Existing fixture" };
function harness() {
  const calls = [];
  const sandbox = {
    state: { profile: { connectionKind: "owner-host", hubUrl: "http://127.0.0.1:4444", companyId: "" },
      teamAccess: null, ownerHostOwnerSubject: "account-a", companies: [] },
    account: "account-a", epoch: 1, generation: 1,
    ownerHostManager: {}, ownerHostInstanceGeneration: 1,
    ownerHostStatus: { state: "running", url: "http://127.0.0.1:4444", startedAt: "fixture-start" },
    ownerHostCompanies: [], ownerHostCompaniesRequestGeneration: 1, ownerHostCompaniesResolvedGeneration: 0,
    currentDesktopAccountSubject: () => sandbox.account,
    currentDesktopSessionEpoch: () => sandbox.epoch,
    currentAccountOwnsOwnerHost: () => sandbox.account === sandbox.state.ownerHostOwnerSubject,
    isOwnerHostProfile: profile => (profile ?? sandbox.state.profile)?.connectionKind === "owner-host",
    ownerHostIsReady: () => sandbox.ownerHostStatus.state === "running",
    ownerVaultOperations: { connectionGeneration: () => sandbox.generation },
    structuredClone, recoverSpsTechnicalMembership,
    normalizeCompanyList: value => Array.isArray(value) ? value.map(company => ({ ...company })) : [],
    initialOwnerHostCompanyName: () => "Fixture Workspace",
    memberships: [], vault: [target], saved: 0,
    refreshOwnerHostCompanies: () => { throw new Error("UI refresh must not decide membership recovery"); },
    async api(route, options) {
      if (route === "/companies") return options.ownerBootstrap ? sandbox.vault : sandbox.memberships;
      if (route.endsWith("/invites")) return { token: "fixture-invite" };
      assert.equal(route, "/invites/fixture-invite/accept");
      sandbox.memberships = [target];
      return { status: "approved" };
    },
    async ownerHostApi(route, options = {}) {
      options.assertCurrent?.();
      calls.push({ route, options });
      const result = await sandbox.api(route, options);
      options.assertCurrent?.();
      return result;
    },
    async persistState({ beforeCommit }) { beforeCommit(); sandbox.saved += 1; },
  };
  vm.runInNewContext([
    section("function captureWorkspaceReadScope(", "function captureHostShareMutation("),
    section("function captureOwnerMembershipRecoveryScope(", "async function restartOwnerHostForConfiguration("),
  ].join("\n"), sandbox);
  return { sandbox, calls };
}

test("restored Host verifies real Identity access before and after a technical Member invitation", async () => {
  const { sandbox, calls } = harness();
  assert.deepEqual(await sandbox.recoverInitialOwnerHostMemberships([target]), [target]);
  assert.deepEqual(calls.map(call => call.route), ["/companies", "/companies/old%2Fworkspace/invites", "/invites/fixture-invite/accept", "/companies"]);
  for (const { route, options } of calls) {
    assert.equal(typeof options.assertCurrent, "function");
    if (route.endsWith("/invites")) {
      assert.equal(options.ownerBootstrap, true);
      assert.equal(options.body.allowedJoinTypes, "human");
      assert.equal(options.body.humanRole, "operator");
      assert.equal(options.body.expiresInMinutes, 15);
      assert.equal(options.body.agentMessage, null);
    } else {
      assert.equal(options.sessionOnly, true);
      assert.equal(options.ownerBootstrap, undefined);
    }
  }
});

test("already-accessible Workspace does not create or accept another recovery invitation", async () => {
  const { sandbox, calls } = harness();
  sandbox.memberships = [target];
  await sandbox.recoverInitialOwnerHostMemberships([target]);
  assert.deepEqual(calls.map(call => call.route), ["/companies"]);
});

test("Host recovery rejects missing tokens, pending approval and transport failure", async () => {
  for (const mode of ["no-token", "pending", "http-error"]) {
    const { sandbox } = harness();
    sandbox.api = async route => {
      if (route === "/companies") return [];
      if (mode === "http-error") throw new Error("Fixture transport rejected");
      if (route.endsWith("/invites")) return mode === "no-token" ? {} : { token: "fixture-invite" };
      return { status: "pending" };
    };
    await assert.rejects(sandbox.recoverInitialOwnerHostMemberships([target]), /could not recover|did not approve|transport rejected/);
  }
});

test("protected Vault inspection with no Workspace does not create a replacement", async () => {
  const { sandbox, calls } = harness();
  sandbox.vault = [];
  assert.deepEqual(Array.from(await sandbox.recoverInitialOwnerHostMemberships()), []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.ownerBootstrap, true);
});

test("initial Host selection uses raw Identity membership, never an empty superseded UI read", async () => {
  const { sandbox } = harness();
  const result = await sandbox.ensureInitialOwnerHostCompany();
  assert.deepEqual(Array.from(result, company => company.id), [target.id]);
  assert.equal(sandbox.state.profile.companyId, target.id);
  assert.equal(sandbox.saved, 1);
  assert.equal(sandbox.ownerHostCompaniesResolvedGeneration, sandbox.ownerHostCompaniesRequestGeneration);
});

test("recovery scope permits company selection but fences every account, Host and connection lifetime", () => {
  for (const mutate of [
    value => { value.account = "account-b"; },
    value => { value.epoch += 1; },
    value => { value.generation += 1; },
    value => { value.ownerHostInstanceGeneration += 1; },
    value => { value.ownerHostManager = {}; },
    value => { value.ownerHostStatus.startedAt = "replacement-host"; },
    value => { value.ownerHostStatus.url = "http://127.0.0.1:5555"; },
    value => { value.state.profile.hubUrl = "http://127.0.0.1:5555"; },
    value => { value.state.profile.connectionKind = "remote"; },
    value => { value.state.teamAccess = { companyId: "another-workspace" }; },
  ]) {
    const { sandbox } = harness();
    const assertCurrent = sandbox.captureOwnerMembershipRecoveryScope();
    sandbox.state.profile.companyId = target.id;
    assert.doesNotThrow(assertCurrent);
    mutate(sandbox);
    assert.throws(assertCurrent, /changed/);
  }
});

test("a late initial membership response cannot mutate the next account's Workspace", async () => {
  const { sandbox, calls } = harness();
  let resolve;
  sandbox.api = () => new Promise(done => { resolve = done; });
  const pending = sandbox.ensureInitialOwnerHostCompany();
  sandbox.epoch += 1;
  sandbox.state.companies = [{ id: "new-account-workspace" }];
  resolve([target]);
  await assert.rejects(pending, /account changed/);
  assert.equal(sandbox.saved, 0);
  assert.equal(sandbox.state.companies[0].id, "new-account-workspace");
  assert.equal(calls.length, 1);
});
