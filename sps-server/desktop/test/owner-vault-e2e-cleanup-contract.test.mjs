import assert from "node:assert/strict";
import test from "node:test";
import { validateOwnerVaultE2eCleanup } from "../scripts/owner-vault-e2e-cleanup-contract.mjs";

function summary(overrides = {}) {
  return {
    children: 2,
    exited: 2,
    orderly: 2,
    outputEnded: 4,
    outputFailed: 0,
    expectedCrashCount: 0,
    confirmedCrashCount: 0,
    fixtureProcessesAbsent: true,
    identityClosed: true,
    delegatedJobCleanup: false,
    ...overrides,
  };
}

test("accepts normal cleanup and returns an unchanged frozen copy", () => {
  const input = summary();
  const result = validateOwnerVaultE2eCleanup(input);

  assert.deepEqual(result, input);
  assert.notEqual(result, input);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(input), false);
});

test("accepts a confirmed intentional main-process crash", () => {
  assert.deepEqual(
    validateOwnerVaultE2eCleanup(summary({
      children: 3,
      exited: 3,
      orderly: 2,
      outputEnded: 6,
      expectedCrashCount: 1,
      confirmedCrashCount: 1,
    })),
    summary({
      children: 3,
      exited: 3,
      orderly: 2,
      outputEnded: 6,
      expectedCrashCount: 1,
      confirmedCrashCount: 1,
    }),
  );
});

test("accepts an empty cleanup summary", () => {
  assert.deepEqual(validateOwnerVaultE2eCleanup(summary({
    children: 0,
    exited: 0,
    orderly: 0,
    outputEnded: 0,
  })), summary({
    children: 0,
    exited: 0,
    orderly: 0,
    outputEnded: 0,
  }));
});

test("rejects invalid counts, live children, and unconfirmed or contradictory crashes", () => {
  const invalid = [
    { children: -1 },
    { children: 33 },
    { children: 1.5 },
    { exited: 1 },
    { expectedCrashCount: 1 },
    { confirmedCrashCount: 1 },
    { orderly: 2, expectedCrashCount: 1, confirmedCrashCount: 1 },
    { outputEnded: 3 },
    { outputFailed: 1 },
    { fixtureProcessesAbsent: false },
    { identityClosed: 0 },
    { delegatedJobCleanup: true },
    { extra: true },
  ];

  for (const overrides of invalid) {
    assert.throws(() => validateOwnerVaultE2eCleanup(summary(overrides)), undefined, JSON.stringify(overrides));
  }
});

test("delegated cleanup remains explicitly unobserved in the child and cannot claim local process absence", () => {
  const delegated = summary({ fixtureProcessesAbsent: null, delegatedJobCleanup: true });
  assert.deepEqual(validateOwnerVaultE2eCleanup(delegated), delegated);
  assert.throws(() => validateOwnerVaultE2eCleanup(summary({ fixtureProcessesAbsent: null })));
  assert.throws(() => validateOwnerVaultE2eCleanup(summary({ delegatedJobCleanup: true, fixtureProcessesAbsent: true })));
  assert.throws(() => validateOwnerVaultE2eCleanup(summary({ delegatedJobCleanup: "true", fixtureProcessesAbsent: null })));
});
