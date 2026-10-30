import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const start = main.indexOf("async function recoverInitialOwnerHostMemberships(");
const end = main.indexOf("\nasync function ensureInitialOwnerHostCompany()", start);
assert.ok(start >= 0 && end > start);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const build = new AsyncFunction("normalizeCompanyList", "ownerHostApi", `${main.slice(start, end)}\nreturn recoverInitialOwnerHostMemberships;`);

test("restored Host reclaims existing Workspace access with a technical Member invitation, not a plugin workflow role", async () => {
  const calls = [];
  const recover = await build(value => value, async (route, options) => {
    calls.push({ route, options });
    if (route.endsWith("/invites")) {
      assert.deepEqual(options, { method: "POST", ownerBootstrap: true, body: {
        allowedJoinTypes: "human", humanRole: "operator", expiresInMinutes: 15, agentMessage: null,
      } });
      return { token: "fixture-invite" };
    }
    assert.equal(route, "/invites/fixture-invite/accept");
    assert.deepEqual(options, { method: "POST", body: { requestType: "human" } });
    assert.equal(options.ownerBootstrap, undefined, "Acceptance must use the actual signed-in Identity, not local bootstrap authority.");
    return { status: "approved" };
  });
  const companies = [{ id: "old/workspace", name: "Existing fixture" }];
  assert.deepEqual(await recover(companies), companies);
  assert.equal(calls[0].route, "/companies/old%2Fworkspace/invites");
  assert.equal(calls.length, 2);
});

test("Host recovery rejects missing tokens or unapproved acceptance without claiming recovered access", async () => {
  for (const mode of ["no-token", "pending", "http-error"]) {
    let acceptCalls = 0;
    const recover = await build(value => value, async route => {
      if (mode === "http-error") throw new Error("Fixture transport rejected");
      if (route.endsWith("/invites")) return mode === "no-token" ? {} : { token: "fixture" };
      acceptCalls += 1;
      return { status: "pending" };
    });
    await assert.rejects(recover([{ id: "fixture", name: "Existing" }]), /could not recover|did not approve|transport rejected/);
    assert.equal(acceptCalls, mode === "pending" ? 1 : 0);
  }
});

test("Host recovery checks its protected Vault list and never creates a replacement Workspace", async () => {
  const calls = [];
  const recover = await build(value => value, async (route, options) => {
    calls.push({ route, options });
    assert.equal(route, "/companies");
    assert.deepEqual(options, { ownerBootstrap: true });
    return [];
  });
  assert.deepEqual(await recover(), []);
  assert.equal(calls.length, 1);
});
