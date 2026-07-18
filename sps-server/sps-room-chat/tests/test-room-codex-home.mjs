import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { agentInstructionsFingerprint, codexClientKey, configuredEnvironmentValue, resolveCodexHomeForAgent, roomThreadIdForCodexRuntime } = await import("../dist/worker.js");

const runtime = { command: "codex", codexHome: "C:/Users/young/.codex-default" };
const defaultAgent = { id: "manager", adapterConfig: {} };
const secondAccountAgent = {
  id: "designer",
  adapterConfig: {
    env: {
      CODEX_HOME: { type: "plain", value: "C:/Users/young/.codex-plus-b" }
    }
  }
};

assert.equal(configuredEnvironmentValue(secondAccountAgent, "CODEX_HOME"), "C:/Users/young/.codex-plus-b");
assert.equal(resolveCodexHomeForAgent(runtime, defaultAgent), "C:/Users/young/.codex-default");
assert.equal(resolveCodexHomeForAgent(runtime, secondAccountAgent), "C:/Users/young/.codex-plus-b");
assert.notEqual(codexClientKey(runtime, defaultAgent), codexClientKey(runtime, secondAccountAgent));
assert.equal(roomThreadIdForCodexRuntime({ runtime: { codexThreadId: "legacy-thread" } }, runtime, secondAccountAgent), null);
const defaultInstructionsFingerprint = agentInstructionsFingerprint(defaultAgent);
const changedInstructionsFingerprint = agentInstructionsFingerprint(defaultAgent, "A changed managed AGENTS.md.");
assert.equal(roomThreadIdForCodexRuntime({ runtime: { codexThreadId: "thread-a", codexAccountKey: codexClientKey(runtime, defaultAgent), instructionsFingerprint: defaultInstructionsFingerprint } }, runtime, defaultAgent), "thread-a");
assert.equal(roomThreadIdForCodexRuntime({ runtime: { codexThreadId: "thread-a", codexAccountKey: codexClientKey(runtime, defaultAgent), instructionsFingerprint: changedInstructionsFingerprint } }, runtime, defaultAgent), null);
assert.equal(roomThreadIdForCodexRuntime({ runtime: { codexThreadId: "thread-a", codexAccountKey: codexClientKey(runtime, defaultAgent), instructionsFingerprint: defaultInstructionsFingerprint } }, runtime, secondAccountAgent), null);
console.log("PASS Room selects independent Codex clients from Agent CODEX_HOME settings");
