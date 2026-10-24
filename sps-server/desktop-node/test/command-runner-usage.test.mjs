import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeSpsNodeCommand } from "../src/command-runner.mjs";

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
