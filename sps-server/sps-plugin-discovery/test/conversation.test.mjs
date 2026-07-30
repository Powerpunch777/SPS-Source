import assert from "node:assert/strict";
import test from "node:test";
import { createDiscoveryConversationService, discoveryConversationState } from "../src/conversation.js";

function stateId(input) {
  return [input.scopeKind, input.scopeId, input.namespace, input.stateKey].join(":");
}

function createContext({ agents } = {}) {
  const state = new Map();
  const sessions = new Map();
  const sent = [];
  const streams = [];
  let nextSession = 1;

  const context = {
    state: {
      async get(input) {
        return state.get(stateId(input));
      },
      async set(input, value) {
        state.set(stateId(input), value);
      },
    },
    agents: {
      async list() {
        return agents ?? [
          { id: "assistant-a", name: "Avery", title: "Assistant", status: "ready", adapterType: "cli" },
          { id: "assistant-b", name: "Blair", title: "Assistant", status: "ready", adapterType: "cli" },
          { id: "retired", name: "Retired", title: "Assistant", status: "terminated", adapterType: "cli" },
        ];
      },
      sessions: {
        async list(agentId) {
          return sessions.get(agentId) ?? [];
        },
        async create(agentId) {
          const sessionId = `session-${nextSession++}`;
          const values = sessions.get(agentId) ?? [];
          values.push({ sessionId, status: "active" });
          sessions.set(agentId, values);
          return { sessionId };
        },
        async sendMessage(sessionId, companyId, options) {
          sent.push({ sessionId, companyId, prompt: options.prompt });
          options.onEvent?.({ sessionId, eventType: "chunk", stream: "assistant", message: "Draft " });
          options.onEvent?.({
            sessionId,
            eventType: "done",
            stream: "assistant",
            payload: { resultJson: { output: "ready" } },
          });
          return { runId: `run-${sent.length}` };
        },
      },
    },
    streams: {
      emit(channel, payload) {
        streams.push({ channel, payload });
      },
    },
    logger: { warn() {} },
  };

  return { context, state, sessions, sent, streams };
}

async function flushAsyncEvents() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("keeps the selected Assistant, session, and transcript in plugin-owned state", async () => {
  const harness = createContext();
  const discovery = createDiscoveryConversationService(harness.context, { hasCatalog: () => true });

  const initial = await discovery.workspaceView({ companyId: "workspace-1" });
  assert.deepEqual(initial.assistants.map((assistant) => assistant.id), ["assistant-a", "assistant-b"]);
  assert.equal(initial.selectedAssistantId, "assistant-a");
  assert.equal(initial.hasCatalog, true);

  const first = await discovery.send({ companyId: "workspace-1", prompt: "Find a Web plugin" });
  await flushAsyncEvents();
  assert.deepEqual(first, { sessionId: "session-1", runId: "run-1", assistantId: "assistant-a" });
  assert.deepEqual(
    harness.state.get(`company:workspace-1:${discoveryConversationState.namespace}:${discoveryConversationState.assistantKey}`),
    { agentId: "assistant-a", sessionId: "session-1" },
  );
  assert.deepEqual(
    harness.state.get(`company:workspace-1:${discoveryConversationState.namespace}:${discoveryConversationState.transcriptKey}`).map((entry) => [entry.role, entry.content]),
    [["user", "Find a Web plugin"], ["assistant", "ready"]],
  );
  assert.equal(harness.streams.length, 2);

  const second = await discovery.send({ companyId: "workspace-1", prompt: "Show another option" });
  await flushAsyncEvents();
  assert.equal(second.sessionId, "session-1");
  assert.equal(harness.sessions.get("assistant-a").length, 1);
  assert.equal(harness.sent.length, 2);
});

test("switching Assistants deliberately resets only the plugin conversation", async () => {
  const harness = createContext();
  const discovery = createDiscoveryConversationService(harness.context);

  await discovery.send({ companyId: "workspace-1", prompt: "First conversation" });
  await flushAsyncEvents();
  const selected = await discovery.selectAssistant({ companyId: "workspace-1", assistantId: "assistant-b" });
  assert.deepEqual(selected, { assistantId: "assistant-b" });

  const view = await discovery.workspaceView({ companyId: "workspace-1" });
  assert.equal(view.selectedAssistantId, "assistant-b");
  assert.deepEqual(view.transcript, []);
  assert.deepEqual(
    harness.state.get(`company:workspace-1:${discoveryConversationState.namespace}:${discoveryConversationState.assistantKey}`),
    { agentId: "assistant-b", sessionId: null },
  );
});

test("rejects missing Workspace, blank messages, and unavailable Assistants", async () => {
  const harness = createContext();
  const discovery = createDiscoveryConversationService(harness.context);

  await assert.rejects(() => discovery.workspaceView({}), /Workspace is required/);
  await assert.rejects(() => discovery.send({ companyId: "workspace-1", prompt: "  " }), /Write a message/);
  await assert.rejects(() => discovery.selectAssistant({ companyId: "workspace-1", assistantId: "missing" }), /Select an available Assistant/);
});
