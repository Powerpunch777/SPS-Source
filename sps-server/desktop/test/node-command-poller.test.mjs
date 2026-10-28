import assert from "node:assert/strict";
import test from "node:test";
import {
  claimNextSpsNodeWork,
  executionTransportForSpsNodeWork,
} from "../src/node-command-poller.mjs";

test("preserves legacy Agent command priority before polling plugin-owned runs", async () => {
  let pluginClaims = 0;
  const next = await claimNextSpsNodeWork({
    claimAgentCommand: async () => ({ id: "agent-command-1" }),
    claimPluginRun: async () => {
      pluginClaims += 1;
      return { id: "plugin-run-1" };
    },
  });

  assert.deepEqual(next, { kind: "agent-command", command: { id: "agent-command-1" } });
  assert.equal(pluginClaims, 0);
  assert.deepEqual(executionTransportForSpsNodeWork(next.kind, { appendCommandEvent() {}, checkCommandLease() {}, completeCommand() {} }), {});
});

test("claims a workflow-neutral plugin run only when the Agent queue is empty", async () => {
  const transport = {
    appendCommandEvent() {},
    checkCommandLease() {},
    completeCommand() {},
  };
  const next = await claimNextSpsNodeWork({
    claimAgentCommand: async () => null,
    claimPluginRun: async () => ({ id: "plugin-run-1", pluginKey: "sps.example" }),
  });

  assert.deepEqual(next, {
    kind: "plugin-run",
    command: { id: "plugin-run-1", pluginKey: "sps.example" },
  });
  assert.deepEqual(executionTransportForSpsNodeWork(next.kind, transport), {
    appendCommandEvent: transport.appendCommandEvent,
    checkCommandLease: transport.checkCommandLease,
    completeCommand: transport.completeCommand,
  });
});

test("reports no work when both Node queues are empty", async () => {
  const next = await claimNextSpsNodeWork({
    claimAgentCommand: async () => null,
    claimPluginRun: async () => null,
  });
  assert.equal(next, null);
});
