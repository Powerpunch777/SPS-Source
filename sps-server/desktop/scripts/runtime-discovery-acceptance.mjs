import assert from "node:assert/strict";
import path from "node:path";
import { createNodeIdentity, createSignedHeartbeat } from "@sps/desktop-node";
import { createChecklistPackage } from "./no-ai-checklist-package.mjs";

/** Simulated Node protocol, real Desktop/Core/SDK bridge; no CLI process starts. */
export async function runRuntimeDiscoveryAcceptance({ cdp, company, secondCompany, api, temporaryRoot }) {
  const call = (url, options) => api(cdp, url, options);
  const fixture = await createChecklistPackage(path.join(temporaryRoot, "reference-plugins", "runtime-discovery"), {
    id: "local.runtime-discovery", withUi: false, runtimeDiscovery: true,
  });
  await call("/api/plugins/install", { method: "POST", body: { packageName: fixture.directory, isLocalPath: true } });
  const plugin = (await call("/api/plugins")).find(item => item.pluginKey === "local.runtime-discovery");
  assert.equal(plugin?.status, "ready");
  for (const companyId of [company.id, secondCompany.id]) {
    await call(`/api/plugins/${plugin.id}/companies/${companyId}/activation`, { method: "PUT", body: { enabled: true } });
  }
  const read = async (companyId = company.id) => (await call(`/api/plugins/${plugin.id}/data/runtime-connections`, {
    method: "POST", body: { companyId },
  })).data;
  const support = (await call(`/api/plugins/${plugin.id}/data/host-api-support`, {
    method: "POST", body: { companyId: company.id },
  })).data;
  assert.equal(support.state, "reported");
  assert.equal(support.contractVersion, "1.0");
  assert.ok(support.operations.includes("sps.runtimes.list"));
  assert.ok(support.operations.includes("agents.sessions.create"));
  assert.ok(!support.operations.some(operation => /secret|model|oce|install/.test(operation)));
  assert.deepEqual(Object.keys(support).sort(), ["contractVersion", "operations", "state"]);
  const deniedFixture = await createChecklistPackage(path.join(temporaryRoot, "reference-plugins", "runtime-denied"), {
    id: "local.runtime-denied", withUi: false, runtimeDiscovery: true, omitCapability: "sps.runtimes.read",
  });
  // The negative fixture omits its primitive too, so installation remains valid.
  await call("/api/plugins/install", { method: "POST", body: { packageName: deniedFixture.directory, isLocalPath: true } });
  const deniedPlugin = (await call("/api/plugins")).find(item => item.pluginKey === "local.runtime-denied");
  assert.equal(deniedPlugin?.status, "ready");
  await call(`/api/plugins/${deniedPlugin.id}/companies/${company.id}/activation`, { method: "PUT", body: { enabled: true } });
  const deniedSupport = (await call(`/api/plugins/${deniedPlugin.id}/data/host-api-support`, {
    method: "POST", body: { companyId: company.id },
  })).data;
  assert.ok(deniedSupport.operations.includes("sps.runtimes.list"), "Registered API reporting is not a permission grant");
  await assert.rejects(call(`/api/plugins/${deniedPlugin.id}/data/runtime-connections`, {
    method: "POST", body: { companyId: company.id },
  }), /capability|permission|not allowed|denied/i);
  console.log("[host-support] public SDK read registered Runtime/Agent APIs; no model/Secret/OCE claim, and missing runtime capability still denied");
  assert.deepEqual(await read(), []);
  const identity = createNodeIdentity();
  const node = await call(`/api/companies/${company.id}/sps-nodes`, {
    method: "POST", body: {
      displayName: "Simulated runtime discovery Node", publicKey: identity.publicKeyPem,
      transportPublicKey: identity.transportPublicKeyPem, platform: "win32", appVersion: "0.4.137",
      capabilities: [{ kind: "codex_cli", label: "Fixture CLI" }],
    },
  });
  assert.ok(node.id);
  await call(`/api/sps-nodes/${node.id}/heartbeat`, { method: "POST", body: createSignedHeartbeat({ identity, nodeId: node.id }) });
  await call(`/api/sps-nodes/${node.id}/approve`, { method: "POST", body: {} });
  const [runtime] = await read();
  assert.ok(runtime?.id && runtime.nodeId === node.id);
  assert.equal(runtime.online, true);
  assert.deepEqual(Object.keys(runtime.connection).sort(), ["authorization", "executionOwner", "observedAt", "state"]);
  assert.equal(runtime.connection.state, "recently_seen");
  assert.equal(runtime.connection.executionOwner, "node");
  assert.equal(runtime.connection.authorization, "execution_grant_required");
  assert.ok(Number.isFinite(Date.parse(runtime.connection.observedAt)));
  assert.equal(runtime.credentialStatus, "unknown", "A heartbeat must not invent a CLI login");
  assert.deepEqual(await read(secondCompany.id), [], "Workspace B saw A's Node runtime");
  assert.equal(runtime.privateKey, undefined);
  assert.equal(runtime.publicKey, undefined);
  await call(`/api/sps-nodes/${node.id}/revoke`, { method: "POST", body: {} });
  const [revoked] = await read();
  assert.equal(revoked.id, runtime.id);
  assert.equal(revoked.online, true, "Legacy heartbeat liveness must not silently become an approval check");
  assert.equal(revoked.connection.state, "inactive");
  console.log("[runtime-discovery] public SDK/Core bridge: signed simulated heartbeat, recent observation != CLI login/grant, A/B scope and revoke projection passed; no CLI command dispatched");
}
