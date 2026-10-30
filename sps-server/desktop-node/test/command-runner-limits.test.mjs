import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createWorkspaceE2eFixture } from "../../desktop/scripts/workspace-e2e-fixture.mjs";
import {
  cancelSpsNodeCommands,
  executeSpsNodeCommand,
  resolveSpsNodeCommandTimeoutMs,
} from "../src/command-runner.mjs";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_PLUGIN_TIMEOUT_MS = 4 * 60 * 60 * 1_000;

function makeCommand(id, overrides = {}) {
  return {
    id,
    pluginKey: "sps.test-plugin",
    command: "agy",
    runtimeKind: "agy_cli",
    args: [],
    env: {},
    stdin: null,
    lastEventSeq: 0,
    ...overrides,
  };
}

function makeExecutionOptions(command, overrides = {}) {
  return {
    command,
    hubUrl: "https://sps.example.test",
    nodeId: "node-test",
    profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
    resolveWorkspace: async () => process.cwd(),
    resolveInvocation: async () => ({ executable: process.execPath, args: ["-e", "process.exit(0)"] }),
    checkCommandLease: async () => ({ active: true, status: "running" }),
    appendCommandEvent: async () => {},
    completeCommand: async () => {},
    ...overrides,
  };
}

async function waitForFile(filePath) {
  // Include bounded supervisor startup and the CLI's first filesystem action.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await fs.access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error(`Timed out waiting for child process marker: ${filePath}`);
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

test("validates and clamps neutral plugin timeouts while preserving legacy timeout behavior", () => {
  assert.equal(resolveSpsNodeCommandTimeoutMs(makeCommand("default", { timeoutMs: undefined })), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveSpsNodeCommandTimeoutMs(makeCommand("default-null", { timeoutMs: null })), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveSpsNodeCommandTimeoutMs(makeCommand("min", { timeoutMs: 1 })), 1_000);
  assert.equal(resolveSpsNodeCommandTimeoutMs(makeCommand("min-boundary", { timeoutMs: 1_000 })), 1_000);
  assert.equal(resolveSpsNodeCommandTimeoutMs(makeCommand("max-boundary", { timeoutMs: MAX_PLUGIN_TIMEOUT_MS })), MAX_PLUGIN_TIMEOUT_MS);
  assert.equal(resolveSpsNodeCommandTimeoutMs(makeCommand("max-clamp", { timeoutMs: MAX_PLUGIN_TIMEOUT_MS + 1 })), MAX_PLUGIN_TIMEOUT_MS);

  assert.equal(resolveSpsNodeCommandTimeoutMs({ timeoutMs: undefined }), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveSpsNodeCommandTimeoutMs({ timeoutMs: -1 }), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveSpsNodeCommandTimeoutMs({ timeoutMs: "1000" }), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveSpsNodeCommandTimeoutMs({ timeoutMs: 0.5 }), 0.5);
  assert.equal(resolveSpsNodeCommandTimeoutMs({ timeoutMs: Number.POSITIVE_INFINITY }), Number.POSITIVE_INFINITY);
});

test("rejects invalid neutral plugin timeouts before preflight, lease checks, or completion", async () => {
  const invalidTimeouts = [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, "1000", Number.MAX_SAFE_INTEGER + 1];
  for (const [index, timeoutMs] of invalidTimeouts.entries()) {
    const calls = [];
    await assert.rejects(executeSpsNodeCommand(makeExecutionOptions(
      makeCommand(`invalid-timeout-${index}`, { timeoutMs }),
      {
        resolveWorkspace: async () => { calls.push("workspace"); return process.cwd(); },
        resolveInvocation: async () => { calls.push("invocation"); return null; },
        checkCommandLease: async () => { calls.push("lease"); return { active: true }; },
        completeCommand: async () => { calls.push("completion"); },
      },
    )), /positive safe integer/);
    assert.deepEqual(calls, []);
  }
});

test("clamps a 1 ms neutral plugin timeout to 1 second and waits for the child to exit before completion", { timeout: 10_000 }, async () => {
  let stdout = "";
  let childPid = null;
  let completion = null;
  let childWasDeadAtCompletion = false;

  const result = await executeSpsNodeCommand(makeExecutionOptions(
    makeCommand("bounded-timeout-regression", { timeoutMs: 1 }),
    {
      resolveInvocation: async () => ({
        executable: process.execPath,
        args: ["-e", "process.stdout.write(JSON.stringify({pid: process.pid}) + '\\n'); setInterval(() => {}, 1_000);"],
      }),
      appendCommandEvent: async (input) => {
        if (input.stream === "stdout") stdout += input.body;
      },
      completeCommand: async (input) => {
        childPid = JSON.parse(stdout.trim()).pid;
        childWasDeadAtCompletion = !processIsAlive(childPid);
        completion = input.completion;
      },
    },
  ));

  assert.equal(result.timedOut, true);
  assert.ok(result.elapsedMs >= 900, `Expected the minimum 1 second timeout, got ${result.elapsedMs}ms`);
  assert.equal(completion?.timedOut, true);
  assert.equal(completion?.status, "failed");
  assert.equal(childWasDeadAtCompletion, true);
  assert.equal(processIsAlive(childPid), false);
});

test("reports a natural nonzero CLI exit after confirmed child closure", { timeout: 10_000 }, async () => {
  let stdout = "";
  let childPid = null;
  let completion = null;
  let persistedCompletion = null;
  let childWasDeadAtCompletion = false;

  const result = await executeSpsNodeCommand(makeExecutionOptions(
    makeCommand("natural-nonzero-exit-regression"),
    {
      resolveInvocation: async () => ({
        executable: process.execPath,
        args: ["-e", "process.stdout.write(JSON.stringify({pid: process.pid}) + '\\n'); process.exit(7);"],
      }),
      appendCommandEvent: async (input) => {
        if (input.stream === "stdout") stdout += input.body;
      },
      persistCompletion: async (input) => { persistedCompletion = input; },
      completeCommand: async (input) => {
        childPid = JSON.parse(stdout.trim()).pid;
        childWasDeadAtCompletion = !processIsAlive(childPid);
        completion = input;
      },
    },
  ));

  assert.equal(result.exitCode, 7);
  assert.equal(result.timedOut, false);
  assert.equal(completion?.completion.status, "failed");
  assert.equal(completion?.completion.exitCode, 7);
  assert.equal(completion?.completion.signal, null);
  assert.equal(completion?.completion.timedOut, false);
  assert.equal(completion?.completion.error, "Local command exited with code 7.");
  assert.deepEqual(persistedCompletion, completion);
  assert.equal(childWasDeadAtCompletion, true);
  assert.equal(processIsAlive(childPid), false);
});

test("rejects duplicate active IDs without disturbing the original process and permits reuse after completion", async () => {
  const fixture = await createWorkspaceE2eFixture();
  const directory = fixture.directory;
  const marker = path.join(directory, "original-started.txt");
  const completions = [];
  let invocationCount = 0;
  let duplicatePreflightCount = 0;
  let execution;
  try {
    execution = executeSpsNodeCommand(makeExecutionOptions(
      makeCommand("shared-command-id", { timeoutMs: 10_000 }),
      {
        resolveInvocation: async () => {
          invocationCount += 1;
          return {
            executable: process.execPath,
            args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started"); setInterval(() => {}, 1_000);`],
          };
        },
        completeCommand: async (input) => { completions.push(input.completion); },
      },
    ));
    await waitForFile(marker);

    let duplicateError;
    await assert.rejects(executeSpsNodeCommand(makeExecutionOptions(
      makeCommand("shared-command-id", { timeoutMs: 10_000 }),
      {
        resolveInvocation: async () => { duplicatePreflightCount += 1; return null; },
        completeCommand: async () => { duplicatePreflightCount += 1; },
      },
    )), (error) => {
      duplicateError = error;
      return /duplicate active command ID/.test(error.message);
    });
    assert.equal(duplicateError.message.includes("shared-command-id"), false);

    assert.equal(invocationCount, 1);
    assert.equal(duplicatePreflightCount, 0);
    assert.equal(completions.length, 0);
    assert.equal(await fs.readFile(marker, "utf8"), "started");
    assert.equal(await cancelSpsNodeCommands("Cancel original duplicate-guard test process"), 1);
    const result = await execution;
    assert.notEqual(result.exitCode, 0);
    assert.equal(completions.length, 1);
    assert.equal(completions[0].error, "Cancel original duplicate-guard test process");

    await executeSpsNodeCommand(makeExecutionOptions(
      makeCommand("shared-command-id", { timeoutMs: 1_000 }),
      {
        resolveInvocation: async () => ({ executable: process.execPath, args: ["-e", "process.exit(0)"] }),
        completeCommand: async (input) => { completions.push(input.completion); },
      },
    ));
    assert.equal(completions.length, 2);
    assert.equal(completions[1].status, "succeeded");
  } finally {
    await cancelSpsNodeCommands("Clean up duplicate-guard test process").catch(() => undefined);
    await execution?.catch(() => undefined);
    await fixture.remove();
  }
});

test("allows distinct command IDs to run concurrently without a global cap", async () => {
  const fixture = await createWorkspaceE2eFixture();
  const directory = fixture.directory;
  const markers = [path.join(directory, "one.txt"), path.join(directory, "two.txt")];
  const completions = [];
  let executions = [];
  try {
    executions = markers.map((marker, index) => executeSpsNodeCommand(makeExecutionOptions(
      makeCommand(`concurrent-command-${index}`, { timeoutMs: 10_000 }),
      {
        resolveInvocation: async () => ({
          executable: process.execPath,
          args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started"); setInterval(() => {}, 1_000);`],
        }),
        completeCommand: async (input) => { completions.push(input.completion); },
      },
    )));
    await Promise.all(markers.map(waitForFile));
    assert.equal(await cancelSpsNodeCommands("Cancel concurrent test processes"), 2);
    const results = await Promise.all(executions);
    assert.equal(results.length, 2);
    assert.equal(completions.length, 2);
    assert.ok(completions.every((completion) => completion.error === "Cancel concurrent test processes"));
  } finally {
    await cancelSpsNodeCommands("Clean up concurrent test processes").catch(() => undefined);
    await Promise.all(executions.map((execution) => execution.catch(() => undefined)));
    await fixture.remove();
  }
});
