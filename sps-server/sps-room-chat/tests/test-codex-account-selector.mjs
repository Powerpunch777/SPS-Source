import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { applyCodexAccountToAdapterConfig, codexAccountLabel, normalizeCodexHome } = await import("../dist/worker.js");

assert.equal(codexAccountLabel(".codex"), "Default Codex account");
assert.equal(codexAccountLabel(".codex-plus-b"), "Plus B Codex account");
assert.equal(normalizeCodexHome("C:/Users/young/.codex-plus-b/"), normalizeCodexHome("C:/Users/young/.codex-plus-b"));

const agent = {
  adapterConfig: {
    model: "gpt-5.6-sol",
    modelReasoningEffort: "xhigh",
    env: {
      EXISTING_VALUE: { type: "plain", value: "preserved" },
      CODEX_HOME: { type: "plain", value: "C:/Users/young/.codex" }
    }
  }
};
const updated = applyCodexAccountToAdapterConfig(agent, {
  id: "codex-home:.codex-plus-b",
  home: "C:/Users/young/.codex-plus-b"
});

assert.equal(updated.model, "gpt-5.6-sol");
assert.equal(updated.modelReasoningEffort, "xhigh");
assert.deepEqual(updated.env.EXISTING_VALUE, { type: "plain", value: "preserved" });
assert.deepEqual(updated.env.CODEX_HOME, { type: "plain", value: "C:/Users/young/.codex-plus-b" });
console.log("PASS Codex account selection preserves Agent adapter configuration");
