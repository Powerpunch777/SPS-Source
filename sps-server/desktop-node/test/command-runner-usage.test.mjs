import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cancelSpsNodeCommand, executeSpsNodeCommand } from "../src/command-runner.mjs";

const usageLine = `${JSON.stringify({
  type: "result",
  modelUsage: {
    sonnet: {
      inputTokens: 31,
      cacheCreationInputTokens: 4,
      cacheReadInputTokens: 12,
      outputTokens: 8,
    },
  },
})}\n`;

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

async function runClaudeCommand(commandOverrides = {}) {
  const events = [];
  const completions = [];
  await executeSpsNodeCommand({
    command: {
      id: "usage-collector-child-test",
      command: "claude",
      runtimeKind: "claude_cli",
      args: [],
      env: {},
      stdin: null,
      lastEventSeq: 0,
      ...commandOverrides,
    },
    hubUrl: "https://sps.example.test",
    nodeId: "node-1",
    profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
    resolveWorkspace: async () => process.cwd(),
    resolveInvocation: async () => ({
      executable: process.execPath,
      args: ["-e", `process.stdout.write(${JSON.stringify(usageLine)})`],
    }),
    checkCommandLease: async () => ({ active: true, status: "running" }),
    appendCommandEvent: async (input) => { events.push(input); },
    completeCommand: async (input) => { completions.push(input.completion); },
  });
  return { events, completions };
}

test("attaches collected Claude usage to a neutral plugin run after child close", async () => {
  const { events, completions } = await runClaudeCommand({ pluginKey: "sps.example-workplane", subjectKey: "build:1" });

  assert.equal(events.map((event) => event.body).join(""), usageLine);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].status, "succeeded");
  assert.deepEqual(completions[0].usageReport, {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens: 35,
    cachedInputTokens: 12,
    outputTokens: 8,
  });
});

test("does not add a usage report to a legacy Claude command completion", async () => {
  const { completions } = await runClaudeCommand();

  assert.equal(completions.length, 1);
  assert.equal(Object.hasOwn(completions[0], "usageReport"), false);
});

test("retries the cached normal completion payload after a lost response without rerunning the child", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sps-node-usage-completion-"));
  const invocationMarker = path.join(directory, "invocations.txt");
  const completionAttempts = [];
  let completionCalls = 0;
  try {
    await assert.rejects(executeSpsNodeCommand({
      command: {
        id: "usage-completion-retry-test",
        pluginKey: "sps.example-workplane",
        subjectKey: "build:retry",
        command: "claude",
        runtimeKind: "claude_cli",
        args: [],
        env: {},
        stdin: null,
        lastEventSeq: 0,
      },
      hubUrl: "https://sps.example.test",
      nodeId: "node-1",
      profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
      resolveWorkspace: async () => process.cwd(),
      resolveInvocation: async () => ({
        executable: process.execPath,
        args: ["-e", `require('node:fs').appendFileSync(${JSON.stringify(invocationMarker)}, 'run\\n');process.stdout.write(${JSON.stringify(usageLine)})`],
      }),
      checkCommandLease: async () => ({ active: true, status: "running" }),
      appendCommandEvent: async () => {},
      completeCommand: async (input) => {
        completionAttempts.push(input);
        completionCalls += 1;
        if (completionCalls === 1) throw new Error("completion response lost");
      },
    }), /completion response lost/);

    assert.equal(completionAttempts.length, 2);
    assert.strictEqual(completionAttempts[1], completionAttempts[0]);
    assert.equal(completionAttempts[0].completion.status, "succeeded");
    assert.deepEqual(completionAttempts[0].completion.usageReport, {
      schemaVersion: 1,
      source: "claude_model_usage_v1",
      inputTokens: 35,
      cachedInputTokens: 12,
      outputTokens: 8,
    });
    assert.equal(await fs.readFile(invocationMarker, "utf8"), "run\n");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("preserves the process result when output upload fails before child exit", { timeout: 10_000 }, async () => {
  const id = randomUUID();
  const ownership = Symbol("output failure test");
  let outputPosted;
  const outputStarted = new Promise(resolve => { outputPosted = resolve; });
  const completions = [];
  const unhandledRejections = [];
  const onUnhandledRejection = reason => unhandledRejections.push(reason);
  let childPid = null;
  let execution;
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    execution = executeSpsNodeCommand({
      command: {
        id,
        command: "claude",
        runtimeKind: "claude_cli",
        args: [],
        env: {},
        stdin: null,
        lastEventSeq: 0,
      },
      hubUrl: "https://sps.example.test",
      nodeId: "node-1",
      ownership,
      profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
      resolveWorkspace: async () => process.cwd(),
      resolveInvocation: async () => ({
        executable: process.execPath,
        args: ["-e", "process.stdout.write(JSON.stringify({pid: process.pid}) + '\\n'); setTimeout(() => process.exit(0), 750);"],
      }),
      checkCommandLease: async () => ({ active: true, status: "running" }),
      appendCommandEvent: async input => {
        childPid = JSON.parse(input.body).pid;
        outputPosted();
        throw new Error("output POST failed");
      },
      completeCommand: async input => { completions.push(input); },
    });
    void execution.catch(() => undefined);

    await outputStarted;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(completions.length, 0, "completion waits until process exit is confirmed");
    assert.ok(isProcessAlive(childPid), "child remains alive after output upload failure");
    assert.deepEqual(unhandledRejections, [], "output tail has an immediate rejection observer");

    await assert.rejects(execution, /output POST failed/);
    assert.equal(completions.length, 1);
    assert.equal(completions[0].completion.status, "succeeded");
    assert.equal(completions[0].completion.exitCode, 0);
    assert.equal(isProcessAlive(childPid), false);
    assert.deepEqual(unhandledRejections, []);
  } finally {
    try { await cancelSpsNodeCommand(id, "Output failure fixture cleanup", { ownership }); }
    catch { /* The assertion result is primary; command ownership still prevents unrelated cancellation. */ }
    await execution?.catch(() => {});
    process.off("unhandledRejection", onUnhandledRejection);
  }
});
