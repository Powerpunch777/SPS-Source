import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateSpsNativeMemberKeyIndex,
  normalizeSpsNativeMemberKeyIndex,
} from "../src/native-member-key-index.mjs";

const EMPTY = Object.freeze({ v: 1, entries: Object.freeze([]) });
const A = Object.freeze({ identityIssuer: "https://identity.example.test", subject: "member-1", hostId: "11111111-1111-4111-8111-111111111111" });
const B = Object.freeze({ identityIssuer: "https://identity.example.test", subject: "member-2", hostId: "11111111-1111-4111-8111-111111111111" });
const C = Object.freeze({ identityIssuer: "https://identity.example.test", subject: "member-1", hostId: "22222222-2222-4222-8222-222222222222" });
const D = Object.freeze({ identityIssuer: "https://other-identity.example.test", subject: "member-1", hostId: "11111111-1111-4111-8111-111111111111" });
const ALPHABETIC_UUID = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const IDS = [
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
];

function allocator(ids = IDS) {
  let calls = 0;
  return {
    createDeviceKeyId() {
      const result = ids[calls];
      calls += 1;
      return result;
    },
    calls: () => calls,
  };
}

function allocate(index, scope, generator, maxEntries = 8) {
  return allocateSpsNativeMemberKeyIndex(index, scope, { maxEntries, createDeviceKeyId: generator.createDeviceKeyId });
}

test("allocates distinct stable IDs per issuer, account, and Host scope", () => {
  const generator = allocator();
  let index = normalizeSpsNativeMemberKeyIndex(EMPTY);
  const scopes = [A, B, C, D];
  const results = [];
  for (const scope of scopes) {
    const result = allocate(index, scope, generator);
    assert.equal(result.created, true);
    index = result.index;
    results.push(result.deviceKeyId);
  }

  assert.deepEqual(results, IDS);
  assert.equal(generator.calls(), 4);
  for (let i = 0; i < scopes.length; i += 1) {
    const result = allocate(index, scopes[i], generator);
    assert.equal(result.deviceKeyId, IDS[i]);
    assert.equal(result.created, false);
    assert.deepEqual(result.index, index);
  }
  assert.equal(generator.calls(), 4);
});

test("returns deterministic field and entry ordering in fresh deeply frozen values", () => {
  const later = { ...B, deviceKeyId: IDS[1] };
  const earlier = { ...A, deviceKeyId: IDS[0] };
  const input = { entries: [later, earlier], v: 1 };
  const before = structuredClone(input);
  const normalized = normalizeSpsNativeMemberKeyIndex(input);

  assert.deepEqual(input, before);
  assert.notEqual(normalized, input);
  assert.deepEqual(Object.keys(normalized), ["v", "entries"]);
  assert.deepEqual(Object.keys(normalized.entries[0]), ["identityIssuer", "subject", "hostId", "deviceKeyId"]);
  assert.deepEqual(normalized.entries.map(entry => entry.subject), ["member-1", "member-2"]);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.entries), true);
  assert.equal(normalized.entries.every(Object.isFrozen), true);
});

test("successful allocation leaves mutable input untouched and freezes its result", () => {
  const input = { v: 1, entries: [{ ...A, deviceKeyId: IDS[0] }] };
  const before = structuredClone(input);
  const result = allocateSpsNativeMemberKeyIndex(input, B, {
    maxEntries: 4,
    createDeviceKeyId: () => IDS[1],
  });

  assert.deepEqual(input, before);
  assert.equal(result.created, true);
  assert.equal(result.index.entries.length, 2);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.index), true);
  assert.equal(Object.isFrozen(result.index.entries), true);
  assert.equal(result.index.entries.every(Object.isFrozen), true);
});

test("requires explicit bounded allocation capacity and checks capacity before calling the generator", () => {
  const generator = allocator();
  const scope = { ...A };
  let index = normalizeSpsNativeMemberKeyIndex(EMPTY);
  index = allocate(index, scope, generator, 1).index;
  assert.throws(() => allocateSpsNativeMemberKeyIndex(index, B, { maxEntries: 1, createDeviceKeyId: generator.createDeviceKeyId }), /full/);
  assert.equal(generator.calls(), 1);

  for (const maxEntries of [undefined, 0, -1, 1.5, 1025, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => allocateSpsNativeMemberKeyIndex(EMPTY, A, { maxEntries }), /options/);
  }
  assert.throws(() => allocateSpsNativeMemberKeyIndex(EMPTY, A, { createDeviceKeyId: randomUUIDLike }), /options/);
});

function randomUUIDLike() {
  return IDS[0];
}

test("rejects malformed schema, scopes, entries, duplicate scopes, and globally reused device IDs", () => {
  const entry = { ...A, deviceKeyId: IDS[0] };
  const rejects = [
    null,
    { v: 2, entries: [] },
    { v: 1, entries: [], extra: true },
    { v: 1, entries: [entry, { ...entry, subject: "member-1" }] },
    { v: 1, entries: [entry, { ...B, deviceKeyId: IDS[0] }] },
    { v: 1, entries: [{ ...entry, identityIssuer: "https://identity.example.test/path" }] },
    { v: 1, entries: [{ ...entry, identityIssuer: "https://identity.example.test/" }] },
    { v: 1, entries: [{ ...entry, subject: " member-1" }] },
    { v: 1, entries: [{ ...entry, subject: "member\n1" }] },
    { v: 1, entries: [{ ...entry, hostId: ALPHABETIC_UUID.toUpperCase() }] },
    { v: 1, entries: [{ ...entry, deviceKeyId: ALPHABETIC_UUID.toUpperCase() }] },
  ];
  for (const value of rejects) assert.throws(() => normalizeSpsNativeMemberKeyIndex(value));
  assert.throws(() => allocateSpsNativeMemberKeyIndex(EMPTY, { ...A, extra: true }, { maxEntries: 1 }));
});

test("rejects generated UUID collisions exactly once without changing the input", () => {
  const index = normalizeSpsNativeMemberKeyIndex({ v: 1, entries: [{ ...A, deviceKeyId: IDS[0] }] });
  const generator = allocator([IDS[0], IDS[1]]);
  assert.throws(() => allocateSpsNativeMemberKeyIndex(index, B, {
    maxEntries: 4,
    createDeviceKeyId: generator.createDeviceKeyId,
  }), /collision/);
  assert.equal(generator.calls(), 1);
  assert.deepEqual(index.entries.map(entry => entry.deviceKeyId), [IDS[0]]);
});

test("rejects accessors, symbols, custom prototypes, and sparse or decorated arrays without invoking getters", () => {
  let calls = 0;
  const getter = Object.defineProperty({}, "v", { enumerable: true, get() { calls += 1; return 1; } });
  const symbolRecord = { v: 1, entries: [] };
  symbolRecord[Symbol("extra")] = true;
  const sparse = new Array(1);
  const decorated = [];
  decorated.extra = true;
  const accessorEntry = Object.defineProperty({ ...A, deviceKeyId: IDS[0] }, "subject", {
    enumerable: true,
    get() { calls += 1; return "member-1"; },
  });
  const accessorArray = [];
  Object.defineProperty(accessorArray, "0", { enumerable: true, get() { calls += 1; return A; } });
  accessorArray.length = 1;

  for (const value of [getter, symbolRecord, Object.assign(Object.create({ inherited: true }), { v: 1, entries: [] })]) {
    assert.throws(() => normalizeSpsNativeMemberKeyIndex(value));
  }
  for (const entries of [sparse, decorated, accessorArray]) {
    assert.throws(() => normalizeSpsNativeMemberKeyIndex({ v: 1, entries }));
  }
  assert.throws(() => normalizeSpsNativeMemberKeyIndex({ v: 1, entries: [accessorEntry] }));
  assert.throws(() => allocateSpsNativeMemberKeyIndex(EMPTY, A, {
    maxEntries: 1,
    get createDeviceKeyId() { calls += 1; return randomUUIDLike; },
  }));
  assert.equal(calls, 0);
});
