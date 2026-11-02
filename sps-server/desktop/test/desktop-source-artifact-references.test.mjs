import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureSpsDesktopSourceArtifactReferences as capture } from "../src/desktop-source-artifact-references.mjs";

const root = path.resolve(os.tmpdir(), "sps-source-reference-fixture");
const directory = name => path.join(root, name);
const empty = () => ({ profile: {}, accountConnections: {}, encryptedShareState: null });

test("retains active, saved and shared Source paths without credentials, account IDs or a whole Vault blanket", () => {
  const state = { profile: { defaultWorkspacePath: directory("default"), projectWorkspaces: {
    projectA: directory("project-a"), projectB: directory("project-b"), unassigned: "",
  }, workspaceSources: [{ id: "source123", name: "Private display name", sourcePath: directory("workspace") },
    { id: "unmapped1", name: "Transferred handle", sourcePath: "" }] },
  accountConnections: { "private-account@example.invalid": { projectWorkspaces: { old: directory("saved") } } },
  encryptedShareState: "encrypted-private-value" };
  let decryptions = 0;
  const result = capture({ readState: () => state, readShareState: () => {
    decryptions++;
    return { projects: { oldWorkspace: { sourcePath: directory("shared"), grants: { node: { password: "private-password" } } } } };
  } });
  assert.deepEqual(result.references.map(ref => ref.path), ["default", "project-a", "project-b", "workspace", "saved", "shared"].map(directory));
  assert.ok(result.references.every(ref => ref.kind === "directory" && ref.state === "retained" && Object.isFrozen(ref)));
  assert.equal(result.references.some(ref => ref.path === root), false);
  assert.doesNotMatch(JSON.stringify(result), /private-account|private-password|encrypted-private-value|Private display name/);
  result.assertCurrent();
  assert.equal(decryptions, 1, "Unchanged encrypted state must not be decrypted repeatedly.");
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.references));
});

test("empty transferred/unassigned mappings are not invented directories", () => {
  const state = { ...empty(), profile: { defaultWorkspacePath: "", projectWorkspaces: { project: "" },
    workspaceSources: [{ id: "source123", name: "Unmapped", sourcePath: "" }] } };
  const result = capture({ readState: () => state, readShareState: () => assert.fail("No protected share state exists") });
  assert.deepEqual(result.references, []);
  result.assertCurrent();
});

for (const [name, change] of [
  ["active path", state => { state.profile.defaultWorkspacePath = directory("new-active"); }],
  ["saved path", state => { state.accountConnections.saved.projectWorkspaces.project = directory("new-saved"); }],
  ["saved connection", state => { delete state.accountConnections.saved; }],
  ["share ciphertext", state => { state.encryptedShareState = "replacement-ciphertext"; }],
]) {
  test(`invalidates observation when ${name} changes`, () => {
    const state = { ...empty(), profile: { defaultWorkspacePath: directory("active") },
      accountConnections: { saved: { projectWorkspaces: { project: directory("saved") } } } };
    const result = capture({ readState: () => state, readShareState: () => ({ projects: {} }) });
    change(state);
    assert.throws(result.assertCurrent);
  });
}

test("malformed Source records fail instead of being filtered or normalized away", () => {
  const bad = [
    { profile: { defaultWorkspacePath: "relative" } },
    { profile: { projectWorkspaces: { project: null } } },
    { profile: { workspaceSources: [null] } },
    { profile: { workspaceSources: [{ id: "source123", name: "Name", sourcePath: directory("a") },
      { id: "source123", name: "Duplicate", sourcePath: directory("b") }] } },
    { profile: { workspaceSources: Array(1) } },
    { profile: { workspaceSources: [{ id: "source123", name: "Name" }] } },
    { accountConnections: { saved: null } },
    { accountConnections: [] },
    { encryptedShareState: "" },
  ];
  for (const value of bad) assert.throws(() => capture({ readState: () => ({ ...empty(), ...value }), readShareState: () => ({ projects: {} }) }));
});

test("corrupt protected records never become an empty Source list or leak decryption details", () => {
  assert.throws(() => capture({ readState: () => { throw new Error("private-password"); }, readShareState: () => ({ projects: {} }) }),
    error => /unavailable or changed/.test(error.message) && !error.message.includes("private-password"));
  for (const readShareState of [() => { throw new Error("private-password"); }, () => ({ projects: { broken: {} } })]) {
    assert.throws(() => capture({ readState: () => ({ ...empty(), encryptedShareState: "ciphertext" }), readShareState }),
      error => /unavailable or changed/.test(error.message) && !error.message.includes("private-password"));
  }
});

test("Source metadata accessors are rejected without invoking them", () => {
  let calls = 0;
  const profile = Object.defineProperty({}, "defaultWorkspacePath", { enumerable: true, get() { calls++; throw new Error("Do not invoke"); } });
  assert.throws(() => capture({ readState: () => ({ ...empty(), profile }), readShareState: () => ({ projects: {} }) }));
  assert.equal(calls, 0);
});

test("missing root fields and async Source readers cannot imply no references", async () => {
  for (const readState of [() => ({}), async () => empty(), async () => { throw new Error("private failure"); }]) {
    assert.throws(() => capture({ readState, readShareState: () => ({ projects: {} }) }));
  }
  assert.throws(() => capture({ readState: () => ({ ...empty(), encryptedShareState: "ciphertext" }),
    readShareState: async () => { throw new Error("private failure"); } }));
  await new Promise(resolve => setImmediate(resolve));
});

test("bounded Source enumeration rejects excessive profiles, paths and unmapped metadata", () => {
  for (const value of [
    { accountConnections: Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`account${i}`, {}])) },
    { profile: { projectWorkspaces: Object.fromEntries(Array.from({ length: 1025 }, (_, i) => [`p${i}`, directory(`path${i}`)])) } },
    { profile: { projectWorkspaces: Object.fromEntries(Array.from({ length: 4096 }, (_, i) => [`p${i}`, ""])) },
      accountConnections: { another: { projectWorkspaces: { extra: "" } } } },
  ]) assert.throws(() => capture({ readState: () => ({ ...empty(), ...value }), readShareState: () => ({ projects: {} }) }));
});
