import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  claimNextSpsNodeWork,
  createSpsNodeCommandPollGate,
  executionTransportForSpsNodeWork,
} from "../src/node-command-poller.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

test("a late claim is fenced after stop and its old finally cannot clear a new poll", async () => {
  const gate = createSpsNodeCommandPollGate();
  const first = gate.begin(() => true);
  let releaseClaim;
  const pendingClaim = new Promise(resolve => { releaseClaim = resolve; });
  const firstPoll = claimNextSpsNodeWork({
    assertCurrent() {
      if (!gate.isCurrent(first, () => true)) throw new Error("poll stopped");
    },
    claimAgentCommand: () => pendingClaim,
    claimPluginRun: async () => ({ id: "must-not-claim" }),
  });

  gate.stop();
  const second = gate.begin(() => true);
  assert.ok(second);
  releaseClaim({ id: "late-command" });
  await assert.rejects(firstPoll, /poll stopped/);
  gate.finish(first);
  assert.equal(gate.isCurrent(second, () => true), true);
  gate.finish(second);
});

test("a cleanup generation becomes stale when a same-eligibility poll begins", () => {
  const gate = createSpsNodeCommandPollGate();
  gate.stop();
  const cleanupGeneration = gate.currentGeneration();
  const nextPoll = gate.begin(() => true);
  assert.ok(nextPoll);
  assert.equal(gate.isGeneration(cleanupGeneration), false);
  assert.equal(gate.isCurrent(nextPoll, () => true), true);
  gate.finish(nextPoll);
});

test("checks ownership after every priority claim and before fallback claim", async () => {
  const calls = [];
  let checks = 0;
  await assert.rejects(claimNextSpsNodeWork({
    assertCurrent() {
      checks += 1;
      calls.push("check");
      if (checks === 2) throw new Error("ownership changed");
    },
    claimAgentCommand: async () => {
      calls.push("agent");
      return null;
    },
    claimPluginRun: async () => {
      calls.push("plugin");
      return null;
    },
  }), /ownership changed/);
  assert.deepEqual(calls, ["check", "agent", "check"]);
});

test("Desktop poll wiring snapshots ownership and suppresses stale status/finally writes", async () => {
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");
  assert.match(main, /const commandPollGate = createSpsNodeCommandPollGate\(\)/);
  assert.match(main, /function stopCommandPolling\(\)[\s\S]*?commandPollGate\.stop\(\)/);
  assert.match(main, /function scheduleCommandPolling\(\)[\s\S]*?commandPollGate\.stop\(\)/);
  assert.match(main, /const profileSnapshot = state\.profile \? structuredClone\(state\.profile\) : null/);
  assert.match(main, /const accountSubject = currentDesktopAccountSubject\(\)/);
  assert.match(main, /const ticket = commandPollGate\.begin\(isEligible\)/);
  assert.match(main, /if \(!commandPollGate\.isCurrent\(ticket, isEligible\)\) return/);
  assert.match(main, /commandPollGate\.finish\(ticket\)/);
  assert.match(main, /async function clearRemovedMemberConnection\(\{ stillCurrent = \(\) => true \} = \{\}\)[\s\S]*?const stoppedPollGeneration = commandPollGate\.currentGeneration\(\)[\s\S]*?await cancelSpsNodeCommands\([\s\S]*?cleanupIsCurrent\(\)[\s\S]*?sessionEpoch: currentDesktopSessionEpoch\(\)[\s\S]*?beforeCommit: \(\) => \{[\s\S]*?currentDesktopSessionEpoch\(\) !== expected\.sessionEpoch[\s\S]*?cleanupOwnerIsCurrent\(\)/);
  assert.match(main, /profile: profileSnapshot,[\s\S]*?assertCurrent,/);
});
