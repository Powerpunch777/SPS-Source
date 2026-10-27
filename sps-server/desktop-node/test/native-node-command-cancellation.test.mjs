import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, lstat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeSpsNodeCommand, cancelSpsNodeCommand } from "../src/command-runner.mjs";

test("disconnect while Host completion is pending does not terminate a terminal child's Windows PID", { skip: process.platform !== "win32", timeout: 15000 }, async () => {
  let completed, release;
  const completionStarted = new Promise(resolve => { completed = resolve; });
  const completionGate = new Promise(resolve => { release = resolve; });
  const id = randomUUID();
  const work = executeSpsNodeCommand({
    command: { id, command: "agy", runtimeKind: "agy_cli", args: [], env: {}, timeoutMs: 10000 },
    hubUrl: "https://fixture.example.test", nodeId: "fixture", profile: {},
    resolveWorkspace: async () => process.cwd(),
    resolveInvocation: async () => ({ executable: process.execPath, args: ["-e", "process.exit(0)"] }),
    checkCommandLease: async () => ({ active: true }), appendCommandEvent: async () => {},
    completeCommand: async () => { completed(); await completionGate; },
  });
  try {
    await completionStarted;
    assert.equal(await cancelSpsNodeCommand(id), true);
  } finally { release(); await work; }
  assert.equal(await cancelSpsNodeCommand(id), false);
});

test("another Native connection cannot cancel an existing command after its duplicate ID was rejected", { timeout: 15000 }, async () => {
  const id = randomUUID(), ownerA = Symbol("A"), ownerB = Symbol("B");
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const command = { id, command: "agy", runtimeKind: "agy_cli", args: [], env: {}, timeoutMs: 10000 };
  const options = {
    command, hubUrl: "https://fixture.example.test", nodeId: "fixture", profile: {},
    resolveWorkspace: async () => process.cwd(),
    resolveInvocation: async () => ({ executable: process.execPath,
      args: ["-e", "process.stdout.write('owned-ready\\n'); setInterval(() => {}, 1000)"] }),
    checkCommandLease: async () => ({ active: true }),
    appendCommandEvent: async event => { if (event.body.includes("owned-ready")) ready(); },
    completeCommand: async () => {},
  };
  const work = executeSpsNodeCommand({ ...options, ownership: ownerA });
  try {
    await started;
    await assert.rejects(executeSpsNodeCommand({ ...options, ownership: ownerB }), /duplicate active command ID/);
    assert.equal(await cancelSpsNodeCommand(id, "Disconnect B", { ownership: ownerB }), false);
    assert.equal(await cancelSpsNodeCommand(id, "Disconnect A", { ownership: ownerA }), true);
    await work;
  } finally {
    await cancelSpsNodeCommand(id, "Fixture cleanup A", { ownership: ownerA });
    await work;
  }
});

test("Native connection cancellation stops only its owned command and leaves another Node run alive", { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sps-native-node-cancel-"));
  const root = await realpath(directory), parent = await realpath(os.tmpdir()), identity = await lstat(root, { bigint: true });
  const ids = [randomUUID(), randomUUID()], completions = [], work = [];
  try {
    const started = ids.map(id => new Promise(resolve => {
      const command = { id, pluginKey: "sps.native-cancel-fixture", command: "agy", runtimeKind: "agy_cli",
        args: [], env: {}, stdin: null, lastEventSeq: 0, timeoutMs: 15000 };
      work.push(executeSpsNodeCommand({ command, nodeId: "fixture", hubUrl: "https://fixture.example.test",
        profile: { defaultWorkspacePath: root }, resolveWorkspace: async () => root,
        resolveInvocation: async () => ({ executable: process.execPath,
          args: ["-e", "process.stdout.write('owned-ready\\n'); setInterval(() => {}, 1000)"] }),
        checkCommandLease: async () => ({ active: true }),
        appendCommandEvent: async value => { if (value.body.includes("owned-ready")) resolve(); },
        completeCommand: async value => { completions.push({ id: value.commandId, status: value.completion.status }); },
      }));
    }));
    await Promise.all(started);
    assert.equal(await cancelSpsNodeCommand(ids[0], "Disconnect Native A"), true);
    await work[0];
    assert.deepEqual(completions, [{ id: ids[0], status: "failed" }]);
    assert.equal(await cancelSpsNodeCommand(randomUUID()), false);
    assert.equal(await cancelSpsNodeCommand(ids[1], "Disconnect Native B"), true);
    await work[1];
    assert.deepEqual(completions.map(item => item.id), ids);
    assert.equal(await cancelSpsNodeCommand(ids[0]), false);
  } finally {
    await Promise.all(ids.map(id => cancelSpsNodeCommand(id)));
    await Promise.allSettled(work);
    const current = await lstat(root, { bigint: true });
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    assert.equal(await realpath(directory), root); assert.equal(path.dirname(root), parent);
    assert.ok(path.basename(root).startsWith("sps-native-node-cancel-"));
    await rm(root, { recursive: true, force: true });
  }
});
