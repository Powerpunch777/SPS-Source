import { randomUUID } from "node:crypto";

const namespace = "builder-chat";
const stateKey = companyId => ({ scopeKind: "company", scopeId: companyId, namespace, stateKey: "conversations" });
const id = () => randomUUID();
const text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const unavailable = new Set(["terminated", "paused", "pending_approval"]);
const inFlight = status => status === "running" || status === "cancelling";
const terminalEvent = event => event?.eventType === "done" || event?.eventType === "error";

function recoveredStatus(run, { lead = false } = {}) {
  if (run.status === "succeeded") return "completed";
  if (run.status === "failed" || run.status === "timed_out") return "failed";
  if (run.status === "interrupted") return "interrupted";
  if (run.status === "cancelled") return lead && run.cancellationRequested && run.termination === "confirmed" ? "cancelled" : "interrupted";
  return null;
}

function terminalEventStatus(event, currentStatus) {
  const status = event.payload?.status;
  if (status === "succeeded") return "completed";
  if (status === "failed" || status === "timed_out") return "failed";
  if (status === "interrupted") return "interrupted";
  if (status === "cancelled") return currentStatus === "cancelling" ? "cancelled" : "interrupted";
  return event.eventType === "error" ? "failed" : "completed";
}

function safeSessionEvent(event) {
  if (!event || !["chunk", "status", "done", "error"].includes(event.eventType)) return null;
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : {};
  const result = payload.resultJson;
  const output = typeof result === "string" ? result : result && typeof result === "object"
    ? result.summary || result.message || result.output : "";
  return {
    runId: typeof event.runId === "string" ? event.runId : "",
    eventType: event.eventType,
    message: text(event.message, 4_000),
    payload: terminalEvent(event) ? {
      ...(typeof payload.status === "string" ? { status: payload.status.slice(0, 40) } : {}),
      resultJson: text(output, 100_000),
      error: text(payload.error, 4_000),
    } : null,
  };
}

function createRunEventReceiver(onEvent, logger) {
  let expectedRunId = null;
  const earlyProgress = [];
  let earlyTerminal = null;
  function deliver(event) {
    void Promise.resolve(onEvent(event)).catch(error => logger.error?.(error.message));
  }
  return {
    receive(event) {
      const safe = safeSessionEvent(event);
      if (!safe) return;
      if (expectedRunId === null) {
        if (terminalEvent(safe)) earlyTerminal = safe;
        else if (safe.message) {
          earlyProgress.push(safe);
          if (earlyProgress.length > 80) earlyProgress.shift();
        }
        return;
      }
      if (safe.runId === expectedRunId) deliver(safe);
    },
    bind(runId) {
      expectedRunId = runId;
      for (const event of earlyProgress) if (event.runId === runId) deliver(event);
      earlyProgress.length = 0;
      if (earlyTerminal?.runId === runId) deliver(earlyTerminal);
      earlyTerminal = null;
    },
  };
}

function hasRunIdentity(item) {
  return typeof item.sessionId === "string" && Boolean(item.sessionId)
    && typeof item.runId === "string" && Boolean(item.runId);
}

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
    await ensureRecovery(companyId);
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
    await ensureRecovery(companyId);
    await validateTeam(companyId, input.leadId, input.workerIds ?? []);
    return mutate(companyId, conversations => {
      const conversation = find(conversations, input.conversationId);
      if (active.has(conversation.id) || conversation.messages.some(message => inFlight(message.status) || message.recoveryPending)) {
        throw new Error("Wait for the current or unresolved Lead run before changing the team.");
      }
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
    await ensureRecovery(companyId);
    const content = text(input.message, 20_000);
    const files = attachments(input.attachments);
    if (!content && !files.length) throw new Error("Write a message or attach a text file.");
    const conversation = find(await load(companyId), input.conversationId);
    await validateTeam(companyId, conversation.leadId, conversation.workerIds);
    if (active.has(conversation.id)) throw new Error("The Lead is already replying.");
    active.set(conversation.id, true);
    let assistantId;
    let sendAttempted = false;
    try {
      await mutate(companyId, conversations => {
        const current = find(conversations, conversation.id);
        if (current.messages.length >= 400) throw new Error("Start a new conversation; this one has reached its message limit.");
        if (current.messages.some(message => inFlight(message.status) || message.recoveryPending)) {
          throw new Error("The previous Lead run is still active or unresolved. Check its state before retrying.");
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
      await mutate(companyId, conversations => {
        find(conversations, conversation.id).messages.find(item => item.id === assistantId).sessionId = sessionId;
      });
      const receiver = createRunEventReceiver(event => recordEvent(companyId, conversation.id, assistantId, event), logger);
      sendAttempted = true;
      const result = await agents.sessions.sendMessage(sessionId, companyId, {
        prompt, reason: "Plugin Builder user message",
        onEvent: receiver.receive,
      });
      if (typeof result?.runId !== "string" || !result.runId) throw new Error("Lead run identity was not returned.");
      await mutate(companyId, conversations => {
        const message = find(conversations, conversation.id).messages.find(item => item.id === assistantId);
        message.runId = result.runId;
      });
      receiver.bind(result.runId);
      return { conversationId: conversation.id, runId: result.runId };
    } catch (error) {
      active.delete(conversation.id);
      if (assistantId) await mutate(companyId, conversations => {
        const message = find(conversations, conversation.id).messages.find(item => item.id === assistantId);
        if (inFlight(message.status)) {
          if (sendAttempted) {
            message.status = hasRunIdentity(message) ? "running" : "interrupted";
            message.recoveryPending = true;
            message.content = "The Lead request could not be confirmed. Check its execution state before retrying.";
          } else {
            message.status = "failed"; message.recoveryPending = false; message.content = error.message;
          }
        }
      });
      throw error;
    }
  }
  async function recordEvent(companyId, conversationId, messageId, event) {
    await mutate(companyId, conversations => {
      const conversation = find(conversations, conversationId);
      const message = conversation.messages.find(item => item.id === messageId);
      if (!message || !inFlight(message.status) || !message.runId || message.runId !== event.runId) return;
      const terminal = terminalEvent(event);
      if (terminal) {
        if (message.status === "cancelling" || event.payload?.status === "cancelled") {
          message.status = "cancelling";
          return;
        }
        const result = event.payload?.resultJson;
        const output = typeof result === "string" ? result : result?.summary || result?.message || result?.output;
        message.content = text(output, 100_000) || text(event.payload?.error, 4_000) || (event.eventType === "error" ? text(event.message, 4_000) : "The run finished without a text response.");
        message.status = terminalEventStatus(event, message.status);
        message.recoveryPending = false;
        active.delete(conversationId);
      } else if (event.message) {
        message.steps.push({ type: event.eventType, text: text(event.message, 2_000) });
        message.steps = message.steps.slice(-80);
      }
      conversation.updatedAt = new Date().toISOString();
    });
  }
  async function applyRunState(companyId, conversationId, messageId, run, { recovering = false } = {}) {
    return mutate(companyId, conversations => {
      const message = find(conversations, conversationId).messages.find(item => item.id === messageId);
      if (!message || message.runId !== run.runId || (recovering ? !message.recoveryPending : !inFlight(message.status))) return;
      const terminalStatus = recoveredStatus(run, { lead: true });
      const cancellationUnconfirmed = run.cancellationRequested && run.termination !== "confirmed";
      if (terminalStatus && !cancellationUnconfirmed) {
        const wasRecovering = message.recoveryPending === true;
        message.status = terminalStatus;
        message.recoveryPending = false;
        if (!message.content) message.content = run.status === "succeeded" && wasRecovering
          ? "The Lead run completed while Builder was restarting; its response text could not be restored."
          : text(run.error, 4_000);
      } else {
        message.status = run.cancellationRequested ? "cancelling" : "running";
        message.recoveryPending = recovering || cancellationUnconfirmed;
      }
      active.delete(conversationId);
    });
  }
  async function applyWorkerRunState(companyId, conversationId, reportId, run) {
    return mutate(companyId, conversations => {
      const report = find(conversations, conversationId).reports?.find(item => item.id === reportId);
      if (!report?.recoveryPending || report.runId !== run.runId) return;
      const status = recoveredStatus(run);
      if (status && !(run.cancellationRequested && run.termination !== "confirmed")) {
        report.status = status;
        report.recoveryPending = false;
        if (!report.content) report.content = run.status === "succeeded"
          ? "The Worker run completed while Builder was restarting; its response text could not be restored."
          : text(run.error, 4_000);
      } else {
        report.status = "running";
        report.recoveryPending = true;
      }
      active.delete(report.id);
    });
  }
  async function refreshRecovery(companyId) {
    const conversations = await load(companyId);
    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        if (!(message.recoveryPending || message.status === "cancelling") || !hasRunIdentity(message)) continue;
        try {
          const run = await agents.sessions.getRun(message.sessionId, companyId, message.runId);
          await applyRunState(companyId, conversation.id, message.id, run, { recovering: message.recoveryPending === true });
        } catch (error) {
          logger.warn?.(`Builder could not confirm Lead run ${message.runId}: ${error.message}`);
        }
      }
      for (const report of conversation.reports ?? []) {
        if (!report.recoveryPending || !hasRunIdentity(report)) continue;
        try {
          const run = await agents.sessions.getRun(report.sessionId, companyId, report.runId);
          await applyWorkerRunState(companyId, conversation.id, report.id, run);
        } catch (error) {
          logger.warn?.(`Builder could not confirm Worker run ${report.runId}: ${error.message}`);
        }
      }
    }
  }
  async function ensureRecovery(companyId) {
    await queues.get(companyId)?.catch(() => {});
    if (!reconciled.has(companyId)) {
      await reconcile(companyId);
      reconciled.add(companyId);
    }
    await refreshRecovery(companyId);
  }
  async function stop(companyId, input) {
    await ensureRecovery(companyId);
    const conversation = find(await load(companyId), input.conversationId);
    const message = conversation.messages.find(item => item.id === input.messageId);
    if (!message || message.role !== "assistant" || message.runId !== input.runId || !message.runId || !message.sessionId) {
      throw new Error("Select the exact Lead run to stop.");
    }
    if (!inFlight(message.status)) return { runId: message.runId, status: message.status };
    await mutate(companyId, conversations => {
      const current = find(conversations, conversation.id).messages.find(item => item.id === message.id);
      if (inFlight(current.status)) current.status = "cancelling";
    });
    const run = await agents.sessions.cancel(message.sessionId, companyId, message.runId);
    await applyRunState(companyId, conversation.id, message.id, run);
    return run;
  }
  async function reconcile(companyId) {
    // Keep persisted executions blocked until Core confirms their terminal state.
    await mutate(companyId, conversations => {
      for (const conversation of conversations) for (const message of conversation.messages) {
        if (message.role === "assistant" && (inFlight(message.status) || message.status === "interrupted")) {
          message.recoveryPending = true;
          if (!hasRunIdentity(message)) {
            message.status = "interrupted";
            message.content = "Builder restarted without a saved run identity. This turn is unresolved and cannot be retried safely.";
          }
        }
      }
      for (const conversation of conversations) for (const report of conversation.reports ?? []) {
        if (report.status === "running" || report.status === "interrupted") {
          report.recoveryPending = true;
          if (!hasRunIdentity(report)) {
            report.status = "interrupted";
            report.content = "Builder restarted without a saved Worker run identity. This assignment is unresolved and blocks another assignment to this Worker.";
          }
        }
      }
    });
  }
  async function delegate(companyId, input, runContext) {
    await ensureRecovery(companyId);
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
      if (current.reports.some(item => item.workerId === input.workerId && (item.status === "running" || item.recoveryPending))) {
        throw new Error("This Worker already has an active or unresolved assignment.");
      }
      if (current.reports.length >= 100) throw new Error("Worker assignment limit reached.");
      current.reports.push(report);
    });
    active.set(report.id, true);
    let sendAttempted = false;
    try {
      const session = await agents.sessions.create(input.workerId, companyId, { taskKey: `plugin:sps.plugin-discovery:session:worker:${report.id}`, reason: "Builder Lead delegation" });
      await mutate(companyId, conversations => {
        find(conversations, conversation.id).reports.find(item => item.id === report.id).sessionId = session.sessionId;
      });
      const receiver = createRunEventReceiver(event => recordWorkerEvent(companyId, conversation.id, report.id, event), logger);
      sendAttempted = true;
      const result = await agents.sessions.sendMessage(session.sessionId, companyId, {
        prompt: objective, reason: "Builder Worker assignment", onEvent: receiver.receive,
      });
      if (typeof result?.runId !== "string" || !result.runId) throw new Error("Worker run identity was not returned.");
      await mutate(companyId, conversations => {
        find(conversations, conversation.id).reports.find(item => item.id === report.id).runId = result.runId;
      });
      receiver.bind(result.runId);
    } catch (error) {
      active.delete(report.id);
      await mutate(companyId, conversations => {
        const target = find(conversations, conversation.id).reports.find(item => item.id === report.id);
        if (inFlight(target.status)) {
          if (sendAttempted) {
            target.status = hasRunIdentity(target) ? "running" : "interrupted";
            target.recoveryPending = true;
            target.content = "The Worker request could not be confirmed. Check its execution state before retrying this assignment.";
          } else {
            target.status = "failed"; target.recoveryPending = false; target.content = error.message;
          }
        }
      });
      throw error;
    }
    const saved = (await load(companyId)).flatMap(item => item.reports ?? []).find(item => item.id === report.id);
    return { reportId: report.id, status: saved?.status ?? "running" };
  }
  async function recordWorkerEvent(companyId, conversationId, reportId, event) {
    await mutate(companyId, conversations => {
      const target = find(conversations, conversationId).reports?.find(item => item.id === reportId);
      if (!target || target.status !== "running" || target.recoveryPending || target.runId !== event.runId || !terminalEvent(event)) return;
      if (event.payload?.status === "cancelled") {
        target.recoveryPending = true;
        return;
      }
      const result = event.payload?.resultJson;
      target.status = terminalEventStatus(event, target.status);
      target.content = text(result, 100_000) || text(event.payload?.error, 4_000) || text(event.message, 4_000);
      target.recoveryPending = false;
      active.delete(reportId);
    });
  }
  async function report(companyId, input, runContext) {
    await ensureRecovery(companyId);
    const conversation = find(await load(companyId), input.conversationId);
    if (runContext.agentId !== conversation.leadId) throw new Error("Only this conversation's Lead can read Worker reports.");
    const result = conversation.reports.find(item => item.id === input.reportId);
    if (!result) throw new Error("Worker report was not found in this conversation.");
    return result;
  }
  return { view, create, team, send, stop, reconcile, recordEvent, delegate, report };
}
