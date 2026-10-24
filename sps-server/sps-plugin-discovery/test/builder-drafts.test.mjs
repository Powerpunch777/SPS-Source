import test from "node:test";
import assert from "node:assert/strict";
import { builderDraftKey, createBuilderDraftStore } from "../src/ui/builder-drafts.js";

test("conversation navigation preserves separate text and attachment drafts", () => {
  const store = createBuilderDraftStore();
  const a = builderDraftKey("workspace", "a"), b = builderDraftKey("workspace", "b");
  const files = [{ name: "notes.txt", content: "draft notes" }];
  store.update(a, { draft: "unfinished", files });
  store.update(b, { draft: "different" });
  assert.deepEqual(store.read(a), { draft: "unfinished", files });
  assert.equal(store.read(b).draft, "different");
  assert.equal(store.read(builderDraftKey("other", "a")).draft, "");
});

test("new conversation is adopted without losing a failed send's draft", () => {
  const store = createBuilderDraftStore();
  const fresh = builderDraftKey("workspace", null), created = builderDraftKey("workspace", "created");
  store.update(fresh, { draft: "retry this" });
  store.move(fresh, created);
  assert.equal(store.read(fresh).draft, "");
  assert.equal(store.read(created).draft, "retry this");
});

test("send completion cannot clear another conversation or a newer edit", () => {
  const store = createBuilderDraftStore();
  const a = builderDraftKey("workspace", "a"), b = builderDraftKey("workspace", "b");
  store.update(a, { draft: "sent" });
  const sent = store.read(a);
  store.update(a, { draft: "new edit" });
  store.update(b, { draft: "other" });
  store.clearSent(a, sent);
  assert.equal(store.read(a).draft, "new edit");
  assert.equal(store.read(b).draft, "other");
  store.clearSent(b, store.read(b));
  assert.equal(store.read(b).draft, "");
});

test("clearing a Workspace transition discards all in-memory data", () => {
  const store = createBuilderDraftStore();
  store.update("key", { draft: "private" });
  store.clear();
  assert.deepEqual(store.read("key"), { draft: "", files: [] });
  assert.equal(store.hasDrafts(), false);
});

test("acknowledgement clears sent text while retaining newer attachments or text", () => {
  const store = createBuilderDraftStore();
  const oldFile = { name: "old.txt", content: "sent" }, newFile = { name: "new.txt", content: "unsent" };
  store.update("key", { draft: "sent", files: [oldFile] });
  const sent = store.read("key");
  store.update("key", { files: [newFile] });
  store.clearSent("key", sent);
  assert.deepEqual(store.read("key"), { draft: "", files: [newFile] });
  assert.equal(store.hasDrafts(), true);
});
