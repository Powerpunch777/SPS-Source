import assert from "node:assert/strict";
import test from "node:test";
import { chooseLocalAgentWorkingDirectory, registerDesktopAgentDirectoryIpc } from "../src/desktop-agent-directory-controller.mjs";

const folder = process.platform === "win32" ? "C:\\project" : "/project";
function fixture(overrides = {}) {
  const calls = [];
  return { calls, dependencies: {
    assertOwner() { calls.push("owner"); },
    parentWindow: { id: 1 },
    dialog: { async showOpenDialog(parent, options) { calls.push("dialog"); assert.equal(parent.id, 1); assert.deepEqual(options.properties, ["openDirectory"]); return { canceled: false, filePaths: [folder] }; } },
    fsApi: { async lstat(value) { assert.equal(value, folder); calls.push("lstat"); return { isDirectory: () => true, isSymbolicLink: () => false }; }, async realpath(value) { calls.push("realpath"); return value; } },
    ...overrides,
  } };
}

test("native folder selection returns only a selected path without saving or executing", async () => {
  const f = fixture();
  assert.deepEqual(await chooseLocalAgentWorkingDirectory(f.dependencies), { cwd: folder });
  assert.deepEqual(f.calls, ["owner", "dialog", "owner", "lstat", "realpath", "owner"]);
});

test("cancel leaves the input unchanged and performs no filesystem reads", async () => {
  const f = fixture({ dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) } });
  assert.equal(await chooseLocalAgentWorkingDirectory(f.dependencies), null);
  assert.deepEqual(f.calls, ["owner", "owner"]);
});

test("rejects malformed, multiple, relative and network paths", async () => {
  const bad = [[], [folder, folder], ["relative"], ["\0"], ...(process.platform === "win32" ? [["\\\\server\\project"], ["C:project"], ["\\project"]] : [])];
  for (const filePaths of bad) {
    const f = fixture({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths }) } });
    await assert.rejects(chooseLocalAgentWorkingDirectory(f.dependencies));
    assert.ok(!f.calls.includes("lstat"));
  }
});

test("rejects files and links without resolving them", async () => {
  for (const stats of [{ isDirectory: () => false, isSymbolicLink: () => false }, { isDirectory: () => true, isSymbolicLink: () => true }]) {
    const f = fixture();
    f.dependencies.fsApi.lstat = async () => stats;
    await assert.rejects(chooseLocalAgentWorkingDirectory(f.dependencies), /real local directory/);
    assert.ok(!f.calls.includes("realpath"));
  }
});

test("denies revoked Host authority after a dialog or filesystem await", async () => {
  for (const at of [1, 2, 3]) {
    const f = fixture(); let count = 0;
    f.dependencies.assertOwner = () => { if (++count === at) throw new Error("Host required"); };
    await assert.rejects(chooseLocalAgentWorkingDirectory(f.dependencies), /Host required/);
  }
});

test("only the guarded Workspace IPC can open the native picker", async () => {
  let handler; const denied = new Error("wrong window"); let chosen = 0;
  registerDesktopAgentDirectoryIpc({
    ipcMain: { handle(channel, callback) { assert.equal(channel, "desktop:workspace-choose-agent-directory"); handler = callback; } },
    assertLocalOwnerWorkspace() { throw denied; }, chooseDirectory() { chosen++; },
  });
  await assert.rejects(handler({}), actual => actual === denied);
  assert.equal(chosen, 0);
});
