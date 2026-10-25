import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { defineSpsPlugin, runSpsWorker } from "@sonparkserver/plugin-sdk/worker";
import { CHECKLIST_CAPABILITIES, createChecklistPlugin } from "./fixtures/no-ai-checklist/worker.mjs";

const EVENT_NAME = "plugin.local.no-ai-checklist.changed";
const STATE_NAMESPACE = "no-ai-checklist";

function storedKey(companyId, stateKey) {
  return JSON.stringify(["company", companyId, STATE_NAMESPACE, stateKey]);
}

function startSession({ state = new Map(), capabilities = CHECKLIST_CAPABILITIES } = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const pendingResponses = new Map();
  const invocationCompanies = new Map();
  const hostRequests = [];
  const subscriptions = [];
  let nextHostId = 0;
  let buffer = "";

  function respond(id, result) {
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }

  function reject(id, cause) {
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: cause.message } })}\n`);
  }

  function requireCapability(capability) {
    if (!capabilities.includes(capability)) throw new Error(`Undeclared capability: ${capability}.`);
  }

  function requireInvocationCompany(message) {
    const companyId = invocationCompanies.get(message.paperclipInvocationId);
    if (typeof companyId !== "string" || companyId.trim().length === 0) {
      throw new Error("Fake Host requires authenticated invocation scope.");
    }
    return companyId;
  }

  function requireStateScope(message, params) {
    const companyId = requireInvocationCompany(message);
    if (params.scopeKind !== "company" || params.scopeId !== companyId
      || params.namespace !== STATE_NAMESPACE
      || !["items", "event-count", "job-count"].includes(params.stateKey)) {
      throw new Error("Fake Host denied state outside authenticated company scope.");
    }
    return storedKey(companyId, params.stateKey);
  }

  async function handleWorkerRequest(message) {
    const { id, method, params } = message;
    hostRequests.push({ method, params });
    try {
      let result = null;
      if (method === "events.subscribe") {
        requireCapability("events.subscribe");
        subscriptions.push(params.eventPattern);
      } else if (method === "events.emit") {
        requireCapability("events.emit");
        if (params.name !== "changed") throw new Error("Fake Host requires the bare event name; Core supplies the Plugin namespace.");
        const companyId = requireInvocationCompany(message);
        if (params.companyId !== companyId) throw new Error("Fake Host denied cross-company event emission.");
      } else if (method === "state.get") {
        requireCapability("plugin.state.read");
        const key = requireStateScope(message, params);
        result = state.has(key) ? structuredClone(state.get(key)) : null;
      } else if (method === "state.set") {
        requireCapability("plugin.state.write");
        const key = requireStateScope(message, params);
        state.set(key, structuredClone(params.value));
      } else if (method === "state.delete") {
        requireCapability("plugin.state.write");
        const key = requireStateScope(message, params);
        state.delete(key);
      } else {
        throw new Error(`Unexpected Worker-to-Host operation: ${method}.`);
      }
      respond(id, result);
    } catch (cause) {
      reject(id, cause);
    }
  }

  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) {
        const message = JSON.parse(line);
        if (typeof message.method === "string") {
          void handleWorkerRequest(message);
        } else if (pendingResponses.has(String(message.id))) {
          const pending = pendingResponses.get(String(message.id));
          pendingResponses.delete(String(message.id));
          if (message.error) pending.reject(new Error(message.error.message));
          else pending.resolve(message.result);
        }
      }
      newline = buffer.indexOf("\n");
    }
  });

  const worker = runSpsWorker(createChecklistPlugin({ capabilities }), {
    input,
    output,
    logger() {},
  });

  function invoke(method, params = {}, companyId) {
    const id = `host-${++nextHostId}`;
    let paperclipInvocation;
    if (companyId !== undefined) {
      paperclipInvocation = { id: `inv-${id}`, scope: { companyId } };
      invocationCompanies.set(paperclipInvocation.id, companyId);
    }
    const response = new Promise((resolve, rejectPromise) => {
      pendingResponses.set(id, { resolve, reject: rejectPromise });
    });
    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
      ...(paperclipInvocation ? { paperclipInvocation } : {}),
    })}\n`);
    return response;
  }

  return { invoke, worker, state, hostRequests, subscriptions };
}

function action(companyId, key, params) {
  return {
    key,
    companyId,
    params,
    actorContext: { type: "user", companyId, userId: "test-user" },
  };
}

async function stopSession(session) {
  await session.invoke("shutdown");
  await session.worker.closed;
}

test("export-only checklist uses the public Worker transport with a fake scoped Host (not Core evidence)", async () => {
  assert.deepEqual(CHECKLIST_CAPABILITIES, [
    "plugin.state.read", "plugin.state.write", "events.emit", "events.subscribe", "jobs.schedule",
  ]);
  const definition = createChecklistPlugin();
  assert.ok(definition.handlers.platform);
  assert.deepEqual(definition.handlers.platform.tools, []);

  const state = new Map();
  const session = startSession({ state });
  const initialized = await session.invoke("initialize");
  assert.ok(initialized.supportedMethods.includes("getData"));
  assert.ok(initialized.supportedMethods.includes("performAction"));
  assert.deepEqual(session.subscriptions, [EVENT_NAME]);
  assert.deepEqual(session.hostRequests.map(({ method }) => method), ["events.subscribe"]);
  assert.deepEqual(await session.invoke("health"), { status: "ok", ready: true, mode: "no-ai" });

  const addedA = await session.invoke("performAction", action("company-a", "checklist.add", {
    text: "  scoped to A  ",
    companyId: "company-b",
  }), "company-a");
  assert.deepEqual(addedA, {
    items: [{ id: addedA.items[0].id, text: "scoped to A", completed: false }],
    eventCount: 0,
    jobCount: 0,
  });
  assert.equal(session.hostRequests.filter(({ method }) => method === "events.emit").length, 1);

  const toggledA = await session.invoke("performAction", action("company-a", "checklist.toggle", {
    id: addedA.items[0].id,
    completed: true,
    companyId: "company-b",
  }), "company-a");
  assert.equal(toggledA.items[0].completed, true);
  assert.equal(toggledA.eventCount, 0);
  assert.deepEqual(await session.invoke("performAction", action("company-b", "checklist.add", { text: "scoped to B" }), "company-b"), {
    items: [{ id: (await session.invoke("getData", { key: "checklist", companyId: "company-b", params: {} }, "company-b")).items[0].id, text: "scoped to B", completed: false }],
    eventCount: 0,
    jobCount: 0,
  });

  const dataA = await session.invoke("getData", { key: "checklist", companyId: "company-a", params: {} }, "company-a");
  assert.deepEqual(dataA, { items: toggledA.items, eventCount: 0, jobCount: 0 });
  const eventResult = await session.invoke("onEvent", {
    event: { eventType: EVENT_NAME, eventId: "event-1", companyId: "company-a", payload: {} },
  }, "company-a");
  assert.equal(eventResult, null);
  const jobResult = await session.invoke("runJob", {
    job: { jobKey: "checklist-audit", jobId: "job-1", companyId: "company-a" },
  }, "company-a");
  assert.deepEqual(jobResult, { items: toggledA.items, eventCount: 1, jobCount: 1 });
  assert.deepEqual(await session.invoke("getData", { key: "checklist", companyId: "company-b", params: {} }, "company-b"), {
    items: [{ id: (await session.invoke("getData", { key: "checklist", companyId: "company-b", params: {} }, "company-b")).items[0].id, text: "scoped to B", completed: false }],
    eventCount: 0,
    jobCount: 0,
  });
  await stopSession(session);
  assert.equal(session.hostRequests.at(-1).method, "state.get");

  const restarted = startSession({ state });
  await restarted.invoke("initialize");
  assert.deepEqual(await restarted.invoke("getData", { key: "checklist", companyId: "company-a", params: {} }, "company-a"), {
    items: toggledA.items,
    eventCount: 1,
    jobCount: 1,
  });
  await stopSession(restarted);
});

test("checklist validates scope and payloads, caps text/items, and serializes concurrent item changes", async () => {
  const session = startSession();
  await session.invoke("initialize");
  await assert.rejects(session.invoke("getData", { key: "checklist", params: {} }), /companyId/);
  await assert.rejects(session.invoke("performAction", action(" ", "checklist.add", { text: "missing scope" }), " "), /companyId/);

  for (const params of [{}, { text: "   " }, { text: "x".repeat(201) }, { text: 4 }]) {
    await assert.rejects(session.invoke("performAction", action("bounds", "checklist.add", params), "bounds"));
  }
  for (const params of [{ id: "item", completed: "yes" }, { id: "", completed: true }, { id: "x".repeat(101), completed: true }]) {
    await assert.rejects(session.invoke("performAction", action("bounds", "checklist.toggle", params), "bounds"));
  }

  const first = await session.invoke("performAction", action("bounds", "checklist.add", { text: "x".repeat(200) }), "bounds");
  assert.equal(first.items[0].text.length, 200);
  const additions = await Promise.all(Array.from({ length: 99 }, (_, index) => session.invoke(
    "performAction",
    action("bounds", "checklist.add", { text: `item-${index}` }),
    "bounds",
  )));
  assert.equal(additions.at(-1).items.length, 100);
  assert.equal(new Set(additions.at(-1).items.map(({ id }) => id)).size, 100);
  const emitsBeforeOverflow = session.hostRequests.filter(({ method }) => method === "events.emit").length;
  await assert.rejects(session.invoke("performAction", action("bounds", "checklist.add", { text: "overflow" }), "bounds"), /limited to 100/);
  assert.equal(session.hostRequests.filter(({ method }) => method === "events.emit").length, emitsBeforeOverflow);
  await stopSession(session);
});

test("corrupt stored values are rejected without resetting them", async () => {
  const state = new Map([[storedKey("corrupt", "items"), [{ id: "broken", text: "", completed: false }]]]);
  const original = structuredClone(state.get(storedKey("corrupt", "items")));
  const session = startSession({ state });
  await session.invoke("initialize");
  await assert.rejects(session.invoke("getData", { key: "checklist", companyId: "corrupt", params: {} }, "corrupt"), /corrupt/);
  assert.deepEqual(state.get(storedKey("corrupt", "items")), original);
  assert.equal(session.hostRequests.some(({ method }) => method === "state.set"), false);
  await stopSession(session);
});

test("the fake Host rejects undeclared state capabilities before mutation", async () => {
  const capabilities = CHECKLIST_CAPABILITIES.filter((capability) => capability !== "plugin.state.read");
  const session = startSession({ capabilities });
  await session.invoke("initialize");
  await assert.rejects(session.invoke("performAction", action("denied", "checklist.add", { text: "not stored" }), "denied"), /Undeclared capability: plugin.state.read/);
  assert.equal(session.state.size, 0);
  assert.equal(session.hostRequests.some(({ method }) => method === "state.set" || method === "events.emit"), false);
  await stopSession(session);
});
