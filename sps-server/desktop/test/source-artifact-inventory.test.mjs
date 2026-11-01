import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { requireSpsSourceArtifactInventory as requireInventory } from "../src/source-artifact-inventory.mjs";

const ids = {
  workspaceA: "11111111-1111-4111-8111-111111111111",
  workspaceB: "22222222-2222-4222-8222-222222222222",
  projectA: "33333333-3333-4333-8333-333333333333",
  grantA: "44444444-4444-4444-8444-444444444444",
  grantB: "55555555-5555-4555-8555-555555555555",
  nodeA: "66666666-6666-4666-8666-666666666666",
  nodeB: "77777777-7777-4777-8777-777777777777",
};
const revision = "2026-11-02T03:04:05.006Z";
const digest = value => createHash("sha256").update(value, "utf8").digest("hex");
const source = (kind, id, workspaceId, resourceId, routeFingerprint = null) => ({
  kind, id, workspaceId, resourceId, status: "available", routeFingerprint, revision,
});
const grant = (kind, id, workspaceId, sourceId, nodeId) => ({
  kind, id, workspaceId, sourceId, nodeId, revokedAt: null, revision,
});
const inventory = (sources = [], grants = []) => {
  const sortedSources = [...sources].sort((left, right) => `${left.kind}:${left.id}` < `${right.kind}:${right.id}` ? -1
    : `${left.kind}:${left.id}` > `${right.kind}:${right.id}` ? 1 : 0);
  const sortedGrants = [...grants].sort((left, right) => `${left.kind}:${left.id}` < `${right.kind}:${right.id}` ? -1
    : `${left.kind}:${left.id}` > `${right.kind}:${right.id}` ? 1 : 0);
  return { sources, grants, fingerprint: digest(JSON.stringify([sortedSources, sortedGrants])) };
};
const invalid = value => assert.throws(() => requireInventory(value), error => {
  assert.equal(error.code, "SPS_SOURCE_ARTIFACT_INVENTORY_UNAVAILABLE");
  assert.equal(error.message, "SPS source artifact inventory is unavailable.");
  return true;
});

test("accepts empty inventory and returns canonical frozen clone", () => {
  const input = inventory();
  const output = requireInventory(input);
  assert.deepEqual(output, input);
  assert.deepEqual(Object.keys(output), ["sources", "grants", "fingerprint"]);
  assert.ok(Object.isFrozen(output) && Object.isFrozen(output.sources) && Object.isFrozen(output.grants));
});

test("validates safe synthetic data, sorts deterministically, and hashes canonical rows", () => {
  const project = source("project", ids.projectA, ids.workspaceA, ids.projectA, "a".repeat(64));
  const workspace = source("workspace", ids.workspaceB, ids.workspaceB, ids.workspaceB);
  const grants = [grant("project", ids.grantA, ids.workspaceA, ids.projectA, ids.nodeA),
    grant("workspace", ids.grantB, ids.workspaceB, ids.workspaceB, ids.nodeB)];
  const first = requireInventory(inventory([workspace, project], grants));
  const second = requireInventory(inventory([project, workspace], [...grants].reverse()));
  assert.deepEqual(first, second);
  assert.deepEqual(first.sources.map(row => `${row.kind}:${row.id}`), [
    `project:${ids.projectA}`, `workspace:${ids.workspaceB}`,
  ]);
  assert.deepEqual(first.grants.map(row => `${row.kind}:${row.id}`), [
    `project:${ids.grantA}`, `workspace:${ids.grantB}`,
  ]);
  assert.equal(first.fingerprint, digest(JSON.stringify([first.sources, first.grants])));
  assert.deepEqual(Object.keys(first.sources[0]), ["kind", "id", "workspaceId", "resourceId", "status", "routeFingerprint", "revision"]);
  assert.deepEqual(Object.keys(first.grants[0]), ["kind", "id", "workspaceId", "sourceId", "nodeId", "revokedAt", "revision"]);
});

test("returns isolated clones that remain unchanged when input is mutated", () => {
  const input = inventory([source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceA)]);
  const output = requireInventory(input);
  input.sources[0].status = "changed";
  input.sources.push(source("workspace", ids.workspaceB, ids.workspaceB, ids.workspaceB));
  assert.equal(output.sources.length, 1);
  assert.equal(output.sources[0].status, "available");
  assert.notEqual(output.sources[0], input.sources[0]);
});

test("rejects invalid fingerprints and envelope or route fields", () => {
  const valid = inventory();
  invalid({ ...valid, fingerprint: "0".repeat(64) });
  invalid({ inventory: valid });
  invalid({ ...valid, route: "C:\\private\\workspace" });
  invalid(inventory([Object.assign(source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceA), { route: "private" })]));
});

test("rejects unknown, symbol, getter, and non-plain properties without invoking accessors", () => {
  invalid({ ...inventory(), extra: "no" });
  const symbolRoot = inventory();
  symbolRoot[Symbol("extra")] = 1;
  invalid(symbolRoot);
  let calls = 0;
  const accessor = Object.defineProperty({}, "sources", { enumerable: true, get() { calls++; throw Error("secret"); } });
  Object.defineProperties(accessor, {
    grants: { enumerable: true, value: [] }, fingerprint: { enumerable: true, value: digest("[[],[]]") },
  });
  invalid(accessor);
  assert.equal(calls, 0);
  invalid(Object.assign(Object.create({ inherited: true }), inventory()));
  invalid(new Date());
});

test("rejects sparse arrays, array accessors, and extra array properties", () => {
  const sparse = inventory([source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceA)]);
  sparse.sources = Array(1);
  invalid(sparse);
  const getterArray = [];
  Object.defineProperty(getterArray, "0", { enumerable: true, get() { throw Error("secret"); } });
  getterArray.length = 1;
  invalid({ sources: getterArray, grants: [], fingerprint: digest("[[],[]]") });
  const extended = [];
  extended.extra = 1;
  invalid(inventory(extended));
});

test("rejects source and grant count limits", () => {
  const sourceRow = source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceA);
  invalid(inventory(Array.from({ length: 4097 }, () => sourceRow)));
  invalid(inventory([], Array.from({ length: 16385 }, () => grant("workspace", ids.grantA,
    ids.workspaceA, ids.workspaceA, ids.nodeA))));
});

test("rejects duplicate source keys, duplicate resource bindings, and missing or mismatched parents", () => {
  const sourceA = source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceA);
  const duplicateId = source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceB);
  invalid(inventory([sourceA, duplicateId]));
  const another = source("workspace", ids.workspaceB, ids.workspaceA, ids.workspaceA);
  invalid(inventory([sourceA, another]));
  invalid(inventory([sourceA], [grant("workspace", ids.grantA, ids.workspaceA, ids.workspaceB, ids.nodeA)]));
  invalid(inventory([sourceA], [grant("workspace", ids.grantA, ids.workspaceB, ids.workspaceA, ids.nodeA)]));
});

test("rejects duplicate grant IDs and source-node bindings", () => {
  const sourceA = source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceA);
  const first = grant("workspace", ids.grantA, ids.workspaceA, ids.workspaceA, ids.nodeA);
  const duplicateId = { ...first, sourceId: ids.workspaceA, nodeId: ids.nodeB };
  invalid(inventory([sourceA], [first, duplicateId]));
  const duplicateBinding = { ...first, id: ids.grantB };
  invalid(inventory([sourceA], [first, duplicateBinding]));
});

test("rejects malformed identifiers, status text, route hashes, and noncanonical dates", () => {
  const good = source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceA);
  for (const change of [
    { id: ids.projectA.toUpperCase() },
    { status: "" }, { status: "x".repeat(65) }, { status: "private\u0000status" },
    { status: "replacement\ufffd" }, { revision: "2026-02-30T03:04:05.006Z" },
    { revision: "2026-11-02T03:04:05Z" }, { routeFingerprint: "A".repeat(64) },
  ]) invalid(inventory([{ ...good, ...change }]));
  invalid(inventory([source("workspace", ids.workspaceA, ids.workspaceA, ids.workspaceB)]));
  invalid(inventory([source("project", ids.projectA, ids.workspaceA, ids.projectA, null)]));
  const grantA = grant("workspace", ids.grantA, ids.workspaceA, ids.workspaceA, ids.nodeA);
  invalid(inventory([good], [{ ...grantA, revokedAt: "2026-11-02T03:04:05.006+00:00" }]));
});

test("accepts maximum row counts while keeping the canonical body within six MiB", () => {
  const makeId = (number, middle) => `${number.toString(16).padStart(8, "0")}-${middle}`;
  const sources = Array.from({ length: 4096 }, (_, index) => {
    const id = makeId(index + 1, "1111-4111-8111-111111111111");
    return { kind: "workspace", id, workspaceId: id, resourceId: id, status: "s".repeat(64), routeFingerprint: null, revision };
  });
  const grants = Array.from({ length: 16384 }, (_, index) => {
    const parent = sources[index % sources.length];
    return { kind: "workspace", id: makeId(index + 1, "2222-4222-8222-222222222222"),
      workspaceId: parent.workspaceId, sourceId: parent.id,
      nodeId: makeId(index + 1, "3333-4333-8333-333333333333"), revokedAt: null, revision };
  });
  const output = requireInventory(inventory(sources, grants));
  assert.equal(output.sources.length, 4096);
  assert.equal(output.grants.length, 16384);
  assert.ok(Buffer.byteLength(JSON.stringify(output), "utf8") <= 6 * 1024 * 1024);

  const unicodeSources = sources.map(row => ({ ...row, status: "\u0800".repeat(64) }));
  const unicodeOutput = requireInventory(inventory(unicodeSources, grants));
  assert.ok(Buffer.byteLength(JSON.stringify(unicodeOutput), "utf8") <= 6 * 1024 * 1024);
});
