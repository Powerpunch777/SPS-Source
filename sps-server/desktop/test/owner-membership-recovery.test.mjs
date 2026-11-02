import assert from "node:assert/strict";
import test from "node:test";
import { recoverSpsTechnicalMembership } from "../src/owner-membership-recovery.mjs";

const TARGET = "workspace-target";
const OTHER = "workspace-other";

function makeOptions(overrides = {}) {
  return {
    companyId: TARGET,
    listMemberships: async () => [],
    createInvitation: async () => ({ token: "invite-token" }),
    acceptInvitation: async () => ({ status: "approved" }),
    assertCurrent() {},
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("rejects missing, empty, or malformed required inputs", async () => {
  for (const companyId of [undefined, null, "", "   ", 4]) {
    await assert.rejects(
      recoverSpsTechnicalMembership(makeOptions({ companyId })),
      TypeError,
    );
  }

  for (const callback of ["listMemberships", "createInvitation", "acceptInvitation", "assertCurrent"]) {
    await assert.rejects(
      recoverSpsTechnicalMembership(makeOptions({ [callback]: undefined })),
      TypeError,
    );
    await assert.rejects(
      recoverSpsTechnicalMembership(makeOptions({ [callback]: true })),
      TypeError,
    );
  }
  await assert.rejects(recoverSpsTechnicalMembership(), TypeError);
});

test("returns existing exact membership without creating an invitation", async () => {
  const companies = [{ id: TARGET, name: "Target" }, { id: OTHER, name: "Other" }];
  let invitations = 0;
  const result = await recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => companies,
    createInvitation: async () => { invitations += 1; },
  }));

  assert.deepEqual(result, { recovered: false, companies });
  assert.equal(invitations, 0);
});

test("does not mistake a similarly named or different Workspace for the target", async () => {
  const initial = [{ id: "workspace-target-copy", name: "Target" }, { id: OTHER, name: TARGET }];
  const companies = [{ id: TARGET, name: "Target" }];
  let reads = 0;
  let invitations = 0;
  const result = await recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => ++reads === 1 ? initial : companies,
    createInvitation: async () => { invitations += 1; return { token: "fresh" }; },
  }));

  assert.equal(result.recovered, true);
  assert.deepEqual(result.companies, companies);
  assert.equal(invitations, 1);
});

test("requires listMemberships to return valid company records", async () => {
  for (const companies of [null, {}, "not-an-array", [null], [{}], [{ id: 4 }]]) {
    await assert.rejects(
      recoverSpsTechnicalMembership(makeOptions({ listMemberships: async () => companies })),
      /verify the current Identity memberships/i,
    );
  }
});

test("accepts an approved invitation and rereads exact target membership", async () => {
  const companies = [{ id: TARGET, name: "Target" }];
  const calls = [];
  const result = await recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => { calls.push("list"); return calls.length === 1 ? [] : companies; },
    createInvitation: async () => { calls.push("create"); return { token: "secret-token" }; },
    acceptInvitation: async token => { calls.push(["accept", token]); return { status: "approved" }; },
  }));

  assert.deepEqual(result, { recovered: true, companies });
  assert.deepEqual(calls, ["list", "create", ["accept", "secret-token"], "list"]);
});

test("fails when the reread shows a different Workspace", async () => {
  let reads = 0;
  await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => ++reads === 1 ? [] : [{ id: OTHER }],
  })), /could not verify the recovered Workspace membership/i);
  assert.equal(reads, 2);
});

test("fails when acceptance is approved but access is still absent", async () => {
  let reads = 0;
  await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => { reads += 1; return []; },
  })), /could not verify the recovered Workspace membership/i);
  assert.equal(reads, 2);
});

test("propagates a post-acceptance membership reread failure", async () => {
  const failure = new Error("membership service unavailable");
  let reads = 0;
  await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => { if (++reads === 1) return []; throw failure; },
  })), error => error === failure);
});

test("requires a nonempty invitation token", async () => {
  for (const invitation of [undefined, null, {}, { token: "" }, { token: "  " }, { token: 4 }]) {
    let accepts = 0;
    await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
      createInvitation: async () => invitation,
      acceptInvitation: async () => { accepts += 1; return { status: "approved" }; },
    })), /could not recover access: no membership invitation/i);
    assert.equal(accepts, 0);
  }
});

test("does not treat pending or unapproved acceptance as membership", async () => {
  for (const response of [undefined, null, {}, { status: "pending" }, { status: "rejected" }]) {
    let reads = 0;
    await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
      listMemberships: async () => { reads += 1; return []; },
      acceptInvitation: async () => response,
    })), /did not approve/i);
    assert.equal(reads, 1, "unapproved acceptance must not claim or reread access");
  }
});

test("a 409 only recovers after rereading the exact target membership", async () => {
  const conflict = Object.assign(new Error("conflict"), { status: 409 });
  const companies = [{ id: TARGET }];
  let reads = 0;
  const result = await recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => ++reads === 1 ? [] : companies,
    acceptInvitation: async () => { throw conflict; },
  }));

  assert.deepEqual(result, { recovered: true, companies });
  assert.equal(reads, 2);
});

test("rethrows the identical 409 when reread does not show exact target access", async () => {
  const conflict = Object.assign(new Error("conflict"), { status: 409 });
  let reads = 0;
  await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => ++reads === 1 ? [] : [{ id: OTHER }],
    acceptInvitation: async () => { throw conflict; },
  })), error => error === conflict);
  assert.equal(reads, 2);
});

test("does not swallow a 403 even when a later membership read would show access", async () => {
  const forbidden = Object.assign(new Error("forbidden"), { status: 403 });
  let reads = 0;
  await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => ++reads === 1 ? [] : [{ id: TARGET }],
    acceptInvitation: async () => { throw forbidden; },
  })), error => error === forbidden);
  assert.equal(reads, 1, "non-409 acceptance errors must not trigger a verification retry");
});

test("a failed verification after a 409 remains a failure, never recovered access", async () => {
  const failure = new Error("verification unavailable");
  let reads = 0;
  await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
    listMemberships: async () => { if (++reads === 1) return []; throw failure; },
    acceptInvitation: async () => { throw Object.assign(new Error("conflict"), { status: 409 }); },
  })), error => error === failure);
  assert.equal(reads, 2);
});

test("two concurrent recoveries report only access verified after the 409 race", async () => {
  const membership = { id: TARGET, name: "Target" };
  let initialReads = 0;
  let acceptCalls = 0;
  let granted = false;
  const options = makeOptions({
    listMemberships: async () => {
      if (initialReads < 2) {
        initialReads += 1;
        return [];
      }
      return granted ? [membership] : [];
    },
    createInvitation: async () => ({ token: `invite-${acceptCalls + 1}` }),
    acceptInvitation: async () => {
      acceptCalls += 1;
      if (acceptCalls === 1) {
        granted = true;
        return { status: "approved" };
      }
      throw Object.assign(new Error("concurrent acceptance"), { status: 409 });
    },
  });

  const results = await Promise.all([
    recoverSpsTechnicalMembership(options),
    recoverSpsTechnicalMembership(options),
  ]);
  assert.equal(initialReads, 2);
  assert.equal(acceptCalls, 2);
  assert.ok(results.every(result => result.recovered), "both callers observed missing access become verified; either may need to refresh its UI");
  assert.ok(results.every(result => result.companies.some(company => company.id === TARGET)));
});

test("asserts the same context before and after each awaited callback", async () => {
  let checks = 0;
  let lists = 0;
  const result = await recoverSpsTechnicalMembership(makeOptions({
    assertCurrent: () => { checks += 1; },
    listMemberships: async () => { lists += 1; return lists === 1 ? [] : [{ id: TARGET }]; },
  }));

  assert.equal(result.recovered, true);
  assert.equal(checks, 8, "four async callback boundaries each check context before and after");
});

test("preserves callback failures while the captured context remains current", async () => {
  const failure = new Error("create transport failed");
  let checks = 0;
  await assert.rejects(recoverSpsTechnicalMembership(makeOptions({
    assertCurrent: () => { checks += 1; },
    createInvitation: async () => { throw failure; },
  })), error => error === failure);
  assert.equal(checks, 4, "both awaited callbacks are checked before and after");
});

test("a context switch while an awaited callback is deferred supersedes stale results", async () => {
  const operation = deferred();
  let current = true;
  let accepts = 0;
  const pending = recoverSpsTechnicalMembership(makeOptions({
    listMemberships: () => operation.promise,
    assertCurrent: () => { if (!current) throw new Error("account context changed"); },
    createInvitation: async () => ({ token: "must-not-be-created" }),
    acceptInvitation: async () => { accepts += 1; return { status: "approved" }; },
  }));
  current = false;
  operation.resolve([]);

  await assert.rejects(pending, /account context changed/);
  assert.equal(accepts, 0);
});

test("context invalidation after an awaited callback error supersedes its stale error", async () => {
  const operation = deferred();
  const staleFailure = new Error("old account transport failure");
  let current = true;
  const pending = recoverSpsTechnicalMembership(makeOptions({
    listMemberships: () => operation.promise,
    assertCurrent: () => { if (!current) throw new Error("account context changed"); },
  }));
  current = false;
  operation.reject(staleFailure);

  await assert.rejects(pending, error => error.message === "account context changed");
});
