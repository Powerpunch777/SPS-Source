import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { createChecklistPackage } from "./no-ai-checklist-package.mjs";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(read, predicate, label) {
  const end = Date.now() + 20_000;
  while (Date.now() < end) { const value = await read(); if (predicate(value)) return value; await pause(100); }
  throw new Error(`Timed out waiting for ${label}`);
}

/** Real Desktop -> public SDK Worker -> Core -> local mock; no real model/key or Agent is used. */
export async function runModelRequestAcceptance({ call, temporaryRoot, unrelatedCompanyId }) {
  const fakeKey = "fake-model-key-source-electron-only";
  const received = [];
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    received.push({ method: req.method, path: req.url, auth: req.headers.authorization, body });
    if (body.input === "Hold this mock request") return;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Loopback model result" }] }],
      usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let company, connection;
  try {
    company = await call("/api/companies", { method: "POST", body: { name: "Model request fixture" } });
    assert.deepEqual(await call(`/api/companies/${company.id}/agents`), []);
    const fixture = await createChecklistPackage(path.join(temporaryRoot, "reference-plugins", "model-requests"), {
      id: "local.model-requests", withUi: false, modelRequests: true,
    });
    await call("/api/plugins/install", { method: "POST", body: { packageName: fixture.directory, isLocalPath: true } });
    const plugin = (await call("/api/plugins")).find(item => item.pluginKey === fixture.manifest.id);
    assert.equal(plugin?.status, "ready");
    for (const companyId of [company.id, unrelatedCompanyId]) await call(`/api/plugins/${plugin.id}/companies/${companyId}/activation`, { method: "PUT", body: { enabled: true } });
    const data = async (key, params = {}, companyId = company.id) => (await call(`/api/plugins/${plugin.id}/data/${key}`, { method: "POST", body: { companyId, params } })).data;
    const action = async (key, params) => (await call(`/api/plugins/${plugin.id}/actions/${key}`, { method: "POST", body: { companyId: company.id, params } })).data;
    assert.deepEqual(await data("model-connections"), []);
    const secret = await call(`/api/companies/${company.id}/secrets`, { method: "POST", body: { name: "fixture-model-key", provider: "local_encrypted", value: fakeKey } });
    connection = await call(`/api/companies/${company.id}/sps-model-connections`, { method: "POST", body: {
      displayName: "Loopback mock model", secretId: secret.id, transport: { endpoint: `http://127.0.0.1:${server.address().port}/v1/responses`,
        model: "mock-model", allowLoopbackHttp: true, timeoutMs: 10_000, maxConcurrentRequests: 1 },
    } });
    const input = { connectionId: connection.id, requestKey: randomUUID(), input: "Source Desktop model fixture" };
    await assert.rejects(action("model-submit", input), /unavailable|grant|permission|denied/i);
    assert.equal(received.length, 0, "Unapproved connection reached a provider");
    const grant = await call(`/api/companies/${company.id}/sps-model-connections/${connection.id}/grants`, { method: "POST", body: { pluginId: plugin.id } });
    const [visible] = await data("model-connections");
    assert.equal(visible.id, connection.id); assert.equal(visible.readiness, "unknown");
    assert.ok(!JSON.stringify(visible).includes(secret.id)); assert.equal(visible.endpoint, undefined); assert.equal(visible.secretId, undefined);
    assert.deepEqual(await data("model-connections", {}, unrelatedCompanyId), []);
    await assert.rejects(data("model-connections", { targetCompanyId: unrelatedCompanyId }), /scope|invocation|company|Workspace/i);
    const queued = await action("model-submit", input);
    const run = await eventually(() => data("model-run", { runId: queued.id }), value => value.status === "succeeded", "model completion");
    assert.equal(run.resultState, "available"); assert.equal(run.result.text, "Loopback model result");
    assert.deepEqual(run.result.usage, { inputTokens: 8, outputTokens: 4, totalTokens: 12 });
    assert.equal((await action("model-submit", input)).id, queued.id); assert.equal(received.length, 1);
    assert.equal(received[0].auth, `Bearer ${fakeKey}`); assert.equal(received[0].method, "POST");
    assert.equal(received[0].body.store, false); assert.equal(received[0].body.background, false); assert.equal(received[0].body.stream, false);
    assert.deepEqual(received[0].body.tools, []); assert.ok(!JSON.stringify(received[0].body).includes(fakeKey));
    const history = await data("model-history"); assert.equal(history.items.length, 1);
    assert.equal(history.items[0].lane, "model_request"); assert.equal(history.items[0].runtime.modelSource, "configured");
    assert.equal(history.items[0].usage.inputTokens.value, 8); assert.equal(history.items[0].usage.costUsd.value, null);
    assert.ok(!JSON.stringify(history).includes("Loopback model result"));
    await call(`/api/companies/${company.id}/sps-model-grants/${grant.id}/revoke`, { method: "POST", body: {} });
    assert.equal((await data("model-run", { runId: queued.id })).resultState, "withheld");
    const secondGrant = await call(`/api/companies/${company.id}/sps-model-connections/${connection.id}/grants`, { method: "POST", body: { pluginId: plugin.id } });
    assert.equal(secondGrant.revision, grant.revision + 1);
    assert.equal((await data("model-run", { runId: queued.id })).resultState, "withheld", "Reapproval restored an older grant's output");
    const held = await action("model-submit", { ...input, requestKey: randomUUID(), input: "Hold this mock request" });
    await eventually(async () => received.length, value => value === 2, "second actual request");
    await action("model-cancel", { runId: held.id });
    const cancelled = await eventually(() => data("model-run", { runId: held.id }), value => value.status === "cancelled", "persisted cancellation");
    assert.equal(cancelled.externalEffects, "unknown"); assert.equal(cancelled.result, null);
    assert.deepEqual(await call(`/api/companies/${company.id}/agents`), [], "Model calls created an Agent");
    assert.equal(received.length, 2, "Model calls were retried");
    console.log("[model-request] public SDK Worker/Core persisted grant + idempotency + actual loopback HTTP, token evidence, A/B denial, revoke/reapproval withholding and local cancellation passed; no real provider/key/Agent");
  } finally {
    try {
      if (company && connection) await call(`/api/companies/${company.id}/sps-model-connections/${connection.id}`, { method: "PATCH", body: { status: "disabled" } });
    } finally {
      await new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    }
  }
}
