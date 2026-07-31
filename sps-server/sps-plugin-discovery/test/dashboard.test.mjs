import assert from "node:assert/strict";
import test from "node:test";
import { createDiscoveryConversationService } from "../src/conversation.js";

function createContext() {
  const state = new Map();
  const stateId = (input) => [input.scopeKind, input.scopeId, input.namespace, input.stateKey].join(":");
  return {
    state: {
      async get(input) { return state.get(stateId(input)); },
      async set(input, value) { state.set(stateId(input), value); },
    },
    agents: {
      async list() {
        return [{ id: "assistant-a", name: "Avery", title: "Discovery Lead", status: "ready", adapterType: "cli" }];
      },
      sessions: { async list() { return []; } },
    },
    streams: { emit() {} },
    logger: { warn() {} },
  };
}

test("the Discovery dashboard can reuse the existing workspace conversation state", async () => {
  const conversation = createDiscoveryConversationService(createContext());
  const workspace = await conversation.workspaceView({ companyId: "workspace-1" });
  const assistant = workspace.assistants.find((entry) => entry.id === workspace.selectedAssistantId);

  assert.equal(assistant?.name, "Avery");
  assert.equal(workspace.transcript.length, 0);
  assert.equal(workspace.selectedAssistantId, "assistant-a");
});
