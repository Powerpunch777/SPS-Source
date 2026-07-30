const STATE_NAMESPACE = "discovery";
const ASSISTANT_STATE_KEY = "assistant";
const TRANSCRIPT_STATE_KEY = "transcript";
const MAX_TRANSCRIPT_MESSAGES = 120;

function requiredCompanyId(params) {
  const companyId = typeof params?.companyId === "string" ? params.companyId.trim() : "";
  if (!companyId) throw new Error("A Workspace is required.");
  return companyId;
}

function stateKey(companyId, stateKey) {
  return { scopeKind: "company", scopeId: companyId, namespace: STATE_NAMESPACE, stateKey };
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asTrimmedString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeAssistant(value) {
  const candidate = asRecord(value);
  const agentId = asTrimmedString(candidate.agentId);
  const sessionId = asTrimmedString(candidate.sessionId) || null;
  return agentId ? { agentId, sessionId } : null;
}

function normalizeTranscript(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const role = record.role === "assistant" || record.role === "system" ? record.role : "user";
      const content = asTrimmedString(record.content);
      const at = asTrimmedString(record.at);
      return content ? { role, content: content.slice(0, 20_000), at: at || new Date().toISOString() } : null;
    })
    .filter(Boolean)
    .slice(-MAX_TRANSCRIPT_MESSAGES);
}

function textFromResult(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  const record = asRecord(value);
  for (const key of ["output", "text", "content", "message", "response"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  const nested = asRecord(record.result);
  for (const key of ["output", "text", "content", "message", "response"]) {
    if (typeof nested[key] === "string" && nested[key].trim()) return nested[key].trim();
  }
  return "";
}

function ensureSelectedAssistant(assistants, selectedId) {
  const assistant = assistants.find((candidate) => candidate.id === selectedId);
  if (!assistant) throw new Error("Select an available Assistant before sending a message.");
  return assistant;
}

/**
 * Keeps Discovery conversation state inside this plugin's namespace. Core
 * only supplies generic agent-session transport; it does not own the choice
 * of assistant, transcript, or Discovery workflow.
 */
export function createDiscoveryConversationService(ctx, { hasCatalog = () => false } = {}) {
  async function appendTranscript(companyId, entry) {
    const stored = await ctx.state.get(stateKey(companyId, TRANSCRIPT_STATE_KEY));
    const transcript = normalizeTranscript(stored);
    transcript.push({
      role: entry.role === "assistant" || entry.role === "system" ? entry.role : "user",
      content: asTrimmedString(entry.content).slice(0, 20_000),
      at: new Date().toISOString(),
    });
    await ctx.state.set(stateKey(companyId, TRANSCRIPT_STATE_KEY), transcript.slice(-MAX_TRANSCRIPT_MESSAGES));
  }

  async function resolveSession(companyId, assistant) {
    if (assistant.sessionId) {
      const sessions = await ctx.agents.sessions.list(assistant.agentId, companyId);
      if (sessions.some((session) => session.sessionId === assistant.sessionId && session.status === "active")) {
        return assistant.sessionId;
      }
    }
    const session = await ctx.agents.sessions.create(assistant.agentId, companyId, {
      taskKey: "discovery-main",
      reason: "Plugin Discovery conversation",
    });
    await ctx.state.set(stateKey(companyId, ASSISTANT_STATE_KEY), {
      agentId: assistant.agentId,
      sessionId: session.sessionId,
    });
    return session.sessionId;
  }

  async function workspaceView(params) {
    const companyId = requiredCompanyId(params);
    const [agents, storedAssistant, storedTranscript] = await Promise.all([
      ctx.agents.list({ companyId, limit: 100 }),
      ctx.state.get(stateKey(companyId, ASSISTANT_STATE_KEY)),
      ctx.state.get(stateKey(companyId, TRANSCRIPT_STATE_KEY)),
    ]);
    const assistants = agents
      .filter((agent) => agent.status !== "terminated")
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        title: agent.title,
        status: agent.status,
        adapterType: agent.adapterType,
      }));
    const selected = normalizeAssistant(storedAssistant);
    const selectedAssistantId = assistants.some((agent) => agent.id === selected?.agentId)
      ? selected?.agentId ?? null
      : assistants[0]?.id ?? null;
    return {
      assistants,
      selectedAssistantId,
      transcript: normalizeTranscript(storedTranscript),
      hasCatalog: Boolean(hasCatalog()),
    };
  }

  async function selectAssistant(params) {
    const companyId = requiredCompanyId(params);
    const assistantId = asTrimmedString(params.assistantId);
    const agents = await ctx.agents.list({ companyId, limit: 100 });
    const selected = ensureSelectedAssistant(agents.filter((agent) => agent.status !== "terminated"), assistantId);
    await Promise.all([
      ctx.state.set(stateKey(companyId, ASSISTANT_STATE_KEY), { agentId: selected.id, sessionId: null }),
      ctx.state.set(stateKey(companyId, TRANSCRIPT_STATE_KEY), []),
    ]);
    return { assistantId: selected.id };
  }

  async function send(params) {
    const companyId = requiredCompanyId(params);
    const prompt = asTrimmedString(params.prompt);
    if (!prompt) throw new Error("Write a message before sending it.");

    const [agents, storedAssistant] = await Promise.all([
      ctx.agents.list({ companyId, limit: 100 }),
      ctx.state.get(stateKey(companyId, ASSISTANT_STATE_KEY)),
    ]);
    const availableAgents = agents.filter((agent) => agent.status !== "terminated");
    const requestedId = asTrimmedString(params.assistantId);
    const saved = normalizeAssistant(storedAssistant);
    const selected = ensureSelectedAssistant(availableAgents, requestedId || saved?.agentId || availableAgents[0]?.id);
    const assistant = requestedId && requestedId !== saved?.agentId
      ? { agentId: selected.id, sessionId: null }
      : saved ?? { agentId: selected.id, sessionId: null };
    const sessionId = await resolveSession(companyId, assistant);

    await appendTranscript(companyId, { role: "user", content: prompt });
    const chunks = [];
    const sent = await ctx.agents.sessions.sendMessage(sessionId, companyId, {
      prompt,
      reason: "Plugin Discovery conversation",
      onEvent: (event) => {
        if (event.eventType === "chunk" && event.message) chunks.push(event.message);
        ctx.streams.emit("discovery-chat", {
          companyId,
          sessionId,
          eventType: event.eventType,
          stream: event.stream,
          message: event.message,
          payload: event.payload,
          at: new Date().toISOString(),
        });
        if (event.eventType === "done") {
          const content = textFromResult(event.payload?.resultJson) || chunks.join("").trim() || asTrimmedString(event.message);
          if (content) {
            void appendTranscript(companyId, { role: "assistant", content }).catch((error) => {
              ctx.logger.warn("Failed to persist Discovery assistant response", { message: String(error) });
            });
          }
        }
        if (event.eventType === "error") {
          const content = asTrimmedString(event.payload?.error) || asTrimmedString(event.message, "Assistant run failed.");
          void appendTranscript(companyId, { role: "system", content }).catch((error) => {
            ctx.logger.warn("Failed to persist Discovery assistant error", { message: String(error) });
          });
        }
      },
    });
    return { sessionId, runId: sent.runId, assistantId: selected.id };
  }

  return { workspaceView, selectAssistant, send };
}

export const discoveryConversationState = Object.freeze({
  namespace: STATE_NAMESPACE,
  assistantKey: ASSISTANT_STATE_KEY,
  transcriptKey: TRANSCRIPT_STATE_KEY,
  maxTranscriptMessages: MAX_TRANSCRIPT_MESSAGES,
});
