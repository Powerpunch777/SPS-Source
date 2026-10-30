import test from "node:test";
import assert from "node:assert/strict";
import {
  addSpsWorkspaceSource,
  normalizeSpsWorkspaceSources,
  removeSpsWorkspaceSource,
  renameSpsWorkspaceSource,
} from "../src/workspace-sources.mjs";

const client = { id: "source_001", name: "Client", sourcePath: "C:\\Projects\\client" };

test("keeps only valid named Host Workspace sources", () => {
  assert.deepEqual(normalizeSpsWorkspaceSources([
    client,
    { id: "bad", name: "Ignored", sourcePath: "C:\\Ignored" },
    { ...client, name: "Duplicate" },
  ]), [client]);
});

test("retains a Core source handle without inventing a Host-local folder mapping", () => {
  assert.deepEqual(normalizeSpsWorkspaceSources([
    { id: "source_002", name: "Transferred source", sourcePath: "" },
  ]), [{ id: "source_002", name: "Transferred source", sourcePath: "" }]);
  assert.throws(
    () => addSpsWorkspaceSource([], { id: "source_003", name: "Missing folder", sourcePath: "" }),
    /Choose a local folder/,
  );
});

test("adds, renames, and removes a source without exposing remote state", () => {
  const withSource = addSpsWorkspaceSource([], client);
  assert.deepEqual(renameSpsWorkspaceSource(withSource, client.id, "Web client"), [
    { ...client, name: "Web client" },
  ]);
  assert.deepEqual(removeSpsWorkspaceSource(withSource, client.id), []);
});
