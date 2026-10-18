import { randomUUID } from "node:crypto";

const namespace = "builder-chat";
const stateKey = companyId => ({ scopeKind: "company", scopeId: companyId, namespace, stateKey: "conversations" });
const id = () => randomUUID();
const text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const unavailable = new Set(["terminated", "paused", "pending_approval"]);

export function createBuilderChat({ state, agents, logger = console }) {
  const queues = new Map();
  const active = new Map();
  const reconciled = new Set();
  async function load(companyId) {
    if (!companyId || typeof companyId !== "string") throw new Error("Workspace is required.");
    const value = await state.get(stateKey(companyId));
    return Array.isArray(value) ? value : [];
  }
  function mutate(companyId, fn) {
    const operation = (queues.get(companyId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const conversations = await load(companyId);
      const result = await fn(conversations);
      await state.set(stateKey(companyId), conversations);
      return result;
    });
    queues.set(companyId, operation);
    return operation.finally(() => { if (queues.get(companyId) === operation) queues.delete(companyId); });
  }
  function find(conversations, conversationId) {
    const conversation = conversations.find(item => item.id === conversationId);
    if (!conversation) throw new Error("Conversation not found in this Workspace.");
    return conversation;
  }
  async function available(companyId) {
    return (await agents.list({ companyId, limit: 200 })).filter(agent => !unavailable.has(agent.status));
  }
  async function validateTeam(companyId, leadId, workerIds) {
    const allowed = new Set((await available(companyId)).map(agent => agent.id));
    if (!allowed.has(leadId)) throw new Error("Select an available Lead in this Workspace.");
    if (!Array.isArray(workerIds) || workerIds.length > 12 || new Set(workerIds).size !== workerIds.length
      || workerIds.some(workerId => workerId === leadId || !allowed.has(workerId))) {
      throw new Error("Workers must be distinct available Agents, excluding the Lead.");
    }
  }
  async function view(companyId) {
    if (!reconciled.has(companyId)) { await reconcile(companyId); reconciled.add(companyId); }
    const [conversations, roster] = await Promise.all([load(companyId), available(companyId)]);
    return {
      conversations,
      agents: roster.map(agent => ({ id: agent.id, name: agent.name, status: agent.status,
        adapterType: agent.adapterType,
        model: text(agent.adapterConfig?.model, 120),
        effort: text(agent.adapterConfig?.reasoningEffort, 40) })),
    };
  }
  async function create(companyId, input) {
    await validateTeam(companyId, input.leadId, input.workerIds ?? []);
    return mutate(companyId, conversations => {
      if (conversations.length >= 100) throw new Error("This Workspace has reached the 100 conversation limit.");
      const conversation = { id: id(), title: "New conversation", leadId: input.leadId,
        workerIds: input.workerIds ?? [], sessionId: null, messages: [], reports: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      conversations.push(conversation);
      return conversation;
    });
  }
  async function team(companyId, input) {
    await validateTeam(companyId, input.leadId, input.workerIds ?? []);
    return mutate(companyId, conversations => {
      const conversation = find(conversations, input.conversationId);
      if (active.has(conversation.id)) throw new Error("Wait for the current reply before changing the team.");
      if (conversation.messages.length && conversation.leadId !== input.leadId) {
        throw new Error("Start a new conversation to change its Lead.");
      }
      conversation.leadId = input.leadId;
      conversation.workerIds = input.workerIds ?? [];
      return conversation;
    });
  }
  function attachments(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 4) throw new Error("Attach up to four text files.");
    return value.map(file => {
      if (typeof file?.content !== "string" || Buffer.byteLength(file.content, "utf8") > 65_536) {
        throw new Error("Each text attachment must be at most 64 KiB.");
      }
      const name = text(file.name, 120);
      if (!name || /[\\/\x00-\x1f]/.test(name)) throw new Error("Attachment name must not contain a path.");
      return { name, content: file.content };
    });
  }
  async function send(companyId, input) {
    const content = text(input.message, 20_000);
    const files = attachments(input.attachments);
    if (!content && !files.length) throw new Error("Write a message or attach a text file.");
    const conversation = find(await load(companyId), input.conversationId);
    await validateTeam(companyId, conversation.leadId, conversation.workerIds);
    if (active.has(conversation.id)) throw new Error("The Lead is already replying.");
    active.set(conversation.id, true);
    let assistantId;
    try {
      await mutate(companyId, conversations => {
        const current = find(conversations, conversation.id);
        if (current.messages.length >= 400) throw new Error("Start a new conversation; this one has reached its message limit.");
        if (current.messages.some(message => message.status === "running")) {
          throw new Error("The previous run was interrupted. Refresh its state before retrying.");
        }
        current.title = current.messages.length ? current.title : (content || files[0].name).slice(0, 60);
        current.messages.push({ id: id(), role: "user", content, attachments: files, at: new Date().toISOString() });
        assistantId = id();
        current.messages.push({ id: assistantId, role: "assistant", content: "", status: "running", steps: [], at: new Date().toISOString() });
        current.updatedAt = new Date().toISOString();
      });
      let sessionId = conversation.sessionId;
      if (sessionId && !(await agents.sessions.list(conversation.leadId, companyId)).some(session => session.sessionId === sessionId)) sessionId = null;
      if (!sessionId) {
        const session = await agents.sessions.create(conversation.leadId, companyId, { taskKey: `plugin:sps.plugin-discovery:session:builder:${conversation.id}`, reason: "Plugin Builder conversation" });
        sessionId = session.sessionId;
        await mutate(companyId, conversations => { find(conversations, conversation.id).sessionId = sessionId; });
      }
      const prompt = [
        `Plugin Builder conversation ID: ${conversation.id}. You are its Lead.`,
        `Selected Worker Agent IDs: ${conversation.workerIds.join(", ") || "none"}.`,
        content,
        ...files.map(file => `Attached text file: ${file.name}\n${file.content}`),
      ].join("\n\n");
      const result = await agents.sessions.sendMessage(sessionId, companyId, {
        prompt, reason: "Plugin Builder user message",
        onEvent(event) { void recordEvent(companyId, conversation.id, assistantId, event).catch(error => logger.error?.(error.message)); },
      });
      await mutate(companyId, conversations => {
        const message = find(conversations, conversation.id).messages.find(item => item.id === assistantId);
        message.runId = result.runId;
      });
      return { conversationId: conversation.id, runId: result.runId };
    } catch (error) {
      active.delete(conversation.id);
      if (assistantId) await mutate(companyId, conversations => {
        const message = find(conversations, conversation.id).messages.find(item => item.id === assistantId);
        message.status = "failed"; message.content = error.message;
      });
      throw error;
    }
  }
  async function recordEvent(companyId, conversationId, messageId, event) {
    await mutate(companyId, conversations => {
      const conversation = find(conversations, conversationId);
      const message = conversation.messages.find(item => item.id === messageId);
      if (!message || message.status !== "running") return;
      const terminal = event.eventType === "done" || event.eventType === "error";
      if (terminal) {
        const result = event.payload?.resultJson;
        const output = typeof result === "string" ? result : result?.summary || result?.message || result?.output;
        message.content = text(output, 100_000) || text(event.payload?.error, 4_000) || (event.eventType === "error" ? text(event.message, 4_000) : "The run finished without a text response.");
        message.status = event.eventType === "error" ? "failed" : "completed";
        active.delete(conversationId);
      } else if (event.message) {
        message.steps.push({ type: event.eventType, text: text(event.message, 2_000) });
        message.steps = message.steps.slice(-80);
      }
      conversation.updatedAt = new Date().toISOString();
    });
  }
  async function reconcile(companyId) {
    // Worker restarts lose callbacks, not transcripts. Never silently rerun a turn.
    await mutate(companyId, conversations => {
      for (const conversation of conversations) for (const message of conversation.messages) {
        if (message.status === "running" && !active.has(conversation.id)) {
          message.status = "interrupted";
          message.content = "Builder restarted while this run was in progress. Its result must be checked before sending again.";
        }
      }
      for (const conversation of conversations) for (const report of conversation.reports ?? []) {
        if (report.status === "running" && !active.has(report.id)) { report.status = "interrupted"; report.content = "Builder restarted before the Worker report arrived."; }
      }
    });
  }
  async function delegate(companyId, input, runContext) {
    const conversation = find(await load(companyId), input.conversationId);
    if (runContext.agentId !== conversation.leadId || !conversation.workerIds.includes(input.workerId)) {
      throw new Error("Only this conversation's Lead can delegate to its selected Workers.");
    }
    await validateTeam(companyId, conversation.leadId, conversation.workerIds);
    const objective = text(input.objective, 20_000);
    if (!objective) throw new Error("Worker objective is required.");
    const report = { id: id(), workerId: input.workerId, objective, status: "running", content: "", at: new Date().toISOString() };
    await mutate(companyId, conversations => {
      const current = find(conversations, conversation.id);
      if (current.reports.some(item => item.workerId === input.workerId && item.status === "running")) throw new Error("This Worker already has a running assignment.");
      if (current.reports.length >= 100) throw new Error("Worker assignment limit reached.");
      current.reports.push(report);
    });
    active.set(report.id, true);
    try {
      const session = await agents.sessions.create(input.workerId, companyId, { taskKey: `plugin:sps.plugin-discovery:session:worker:${report.id}`, reason: "Builder Lead delegation" });
      await agents.sessions.sendMessage(session.sessionId, companyId, {
        prompt: objective, reason: "Builder Worker assignment",
        onEvent(event) {
          if (!["done", "error"].includes(event.eventType)) return;
          void mutate(companyId, conversations => {
            const target = find(conversations, conversation.id).reports.find(item => item.id === report.id);
            const result = event.payload?.resultJson;
            target.status = event.eventType === "done" ? "completed" : "failed";
            target.content = text(typeof result === "string" ? result : result?.summary || result?.output || event.payload?.error || event.message, 100_000);
            active.delete(report.id);
          }).catch(error => logger.error?.(error.message));
        },
      });
    } catch (error) {
      active.delete(report.id);
      await mutate(companyId, conversations => { const target = find(conversations, conversation.id).reports.find(item => item.id === report.id); target.status = "failed"; target.content = error.message; });
      throw error;
    }
    return { reportId: report.id, status: "running" };
  }
  async function report(companyId, input, runContext) {
    const conversation = find(await load(companyId), input.conversationId);
    if (runContext.agentId !== conversation.leadId) throw new Error("Only this conversation's Lead can read Worker reports.");
    const result = conversation.reports.find(item => item.id === input.reportId);
    if (!result) throw new Error("Worker report was not found in this conversation.");
    return result;
  }
  return { view, create, team, send, reconcile, recordEvent, delegate, report };
}
