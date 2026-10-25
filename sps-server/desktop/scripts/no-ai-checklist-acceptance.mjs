import assert from "node:assert/strict";
import path from "node:path";
import { createChecklistPackage, CHECKLIST_PLUGIN_KEY } from "./no-ai-checklist-package.mjs";
import { runRuntimeDiscoveryAcceptance } from "./runtime-discovery-acceptance.mjs";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function eventually(read, predicate, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await read();
    if (predicate(value)) return value;
    await pause(150);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}

async function assertDenied(cdp, url, body, label) {
  const result = await cdp.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(url)}, { method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} });
    return { status: response.status, body: await response.json() };
  })()`, true);
  assert.ok([400, 403, 502].includes(result.status), `${label} was not rejected: ${JSON.stringify(result)}`);
  assert.match(JSON.stringify(result.body), /capability|scope|not enabled|disabled|denied|outside|permission/i, `${label} failed for an unrelated reason: ${JSON.stringify(result)}`);
}

export async function runNoAiChecklistAcceptance({ cdp, company, api, click, restart, openRecovery, captureScreenshot, screenshotPath, temporaryRoot, runtimeDiscovery = false }) {
  let workspace = cdp;
  const request = (url, options) => api(workspace, url, options);
  const data = (plugin, companyId = company.id, params = {}) => request(`/api/plugins/${plugin.id}/data/checklist`, {
    method: "POST", body: { companyId, params },
  }).then(result => result.data);
  const activate = (plugin, companyId, enabled) => request(`/api/plugins/${plugin.id}/companies/${companyId}/activation`, {
    method: "PUT", body: { enabled },
  });
  const change = (plugin, key, params, companyId = company.id) => request(`/api/plugins/${plugin.id}/actions/${key}`, {
    method: "POST", body: { companyId, params },
  }).then(result => result.data);
  async function install(name, options) {
    const directory = path.join(temporaryRoot, "reference-plugins", name);
    const { manifest } = await createChecklistPackage(directory, options);
    await request("/api/plugins/install", { method: "POST", body: { packageName: directory, isLocalPath: true } });
    return await eventually(() => request("/api/plugins"), plugins => plugins.some(p => p.pluginKey === manifest.id && p.status === "ready"), `ready ${name}`)
      .then(plugins => plugins.find(p => p.pluginKey === manifest.id));
  }
  const agents = await request(`/api/companies/${company.id}/agents`);
  assert.deepEqual(agents, [], "No-AI acceptance must not start with an Agent");
  const plugin = await install("checklist", {});
  await assertDenied(workspace, `/api/plugins/${plugin.id}/data/checklist`, { companyId: company.id }, "inactive Plugin access");
  await activate(plugin, company.id, true);
  assert.deepEqual(await data(plugin), { items: [], eventCount: 0, jobCount: 0 });
  console.log("[no-ai] installed explicitly, inactive access denied, empty data loaded without an Agent");
  const second = await request("/api/companies", { method: "POST", body: { name: "No-AI scope B" } });
  assert.ok(second.id && second.issuePrefix);
  await activate(plugin, second.id, true);
  if (runtimeDiscovery) await runRuntimeDiscoveryAcceptance({ cdp: workspace, company, secondCompany: second, api, temporaryRoot });

  const pageUrl = `/${company.issuePrefix}/plugins/${plugin.id}`;
  await workspace.evaluate(`location.assign(${JSON.stringify(pageUrl)})`);
  await eventually(() => workspace.evaluate(`Boolean(document.querySelector('[data-testid="checklist-empty"]'))`), Boolean, "No-AI empty UI");
  await workspace.evaluate(`(() => {
    const input = document.querySelector('#checklist-text');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Verify no-AI persistence');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await eventually(() => workspace.evaluate(`document.querySelector('#checklist-add')?.disabled === false`), Boolean, "enabled Add");
  await click(workspace, "#checklist-add", "Add No-AI checklist item");
  const saved = await eventually(() => data(plugin), value => value.items.length === 1 && value.eventCount === 1, "persisted item and actual event delivery");
  assert.equal(saved.items[0].text, "Verify no-AI persistence");
  await eventually(() => workspace.evaluate(`Boolean(document.querySelector('input[data-checklist-id]'))`), Boolean, "saved checklist checkbox");
  await click(workspace, "input[data-checklist-id]", "Complete No-AI checklist item");
  await eventually(() => data(plugin), value => value.items[0]?.completed === true && value.eventCount === 2, "completed item and second event");
  console.log("[no-ai] actual public UI add/toggle and subscribed event delivery passed");

  // The bridge must derive scope from its authenticated envelope, not nested params.
  const scoped = await change(plugin, "checklist.add", { text: "A only", companyId: second.id });
  assert.equal(scoped.items.length, 2);
  assert.deepEqual((await data(plugin, second.id)).items, []);
  assert.equal((await data(plugin, company.id, { companyId: second.id })).items.length, 2);

  const jobs = await eventually(() => request(`/api/plugins/${plugin.id}/jobs`), value => value.some(job => job.jobKey === "checklist-audit"), "registered Workspace Job");
  const job = jobs.find(item => item.jobKey === "checklist-audit");
  assert.equal(job.scope, "workspace");
  const run = await request(`/api/plugins/${plugin.id}/jobs/${job.id}/trigger`, { method: "POST", body: { companyId: company.id } });
  const jobRun = await eventually(() => request(`/api/plugins/${plugin.id}/jobs/${job.id}/runs?companyId=${company.id}`), value => value.some(item => item.id === run.runId && ["succeeded", "failed", "cancelled"].includes(item.status)), "actual Job completion")
    .then(runs => runs.find(item => item.id === run.runId));
  assert.equal(jobRun.status, "succeeded", `No-AI Job failed: ${JSON.stringify(jobRun)}`);
  assert.equal((await data(plugin)).jobCount, 1);
  assert.equal((await data(plugin, second.id)).jobCount, 0);
  console.log("[no-ai] Workspace-scoped manual Job completed and B remained unchanged");

  const probe = await install("scope-probe", { id: "local.no-ai-probe", withUi: false, probeScope: true, probeJobCompanyId: second.id });
  await activate(probe, company.id, true);
  await activate(probe, second.id, true);
  await assertDenied(workspace, `/api/plugins/${probe.id}/data/scope-probe`, { companyId: company.id, params: { targetCompanyId: second.id } }, "cross-Workspace state request");
  const probeJobs = await eventually(() => request(`/api/plugins/${probe.id}/jobs`), value => value.length === 1, "registered scope-probe Job");
  const probeJob = probeJobs[0];
  const probeRun = await request(`/api/plugins/${probe.id}/jobs/${probeJob.id}/trigger`, { method: "POST", body: { companyId: company.id } });
  const deniedJob = await eventually(() => request(`/api/plugins/${probe.id}/jobs/${probeJob.id}/runs?companyId=${company.id}`), value => value.some(item => item.id === probeRun.runId && ["succeeded", "failed"].includes(item.status)), "cross-Workspace Job denial")
    .then(runs => runs.find(item => item.id === probeRun.runId));
  assert.equal(deniedJob.status, "failed", "Workspace A Job reached B state outside its invocation scope");
  assert.match(deniedJob.error, /scope|company/i);
  const deniedRead = await install("denied-read", { id: "local.no-ai-denied-read", omitCapability: "plugin.state.read" });
  await activate(deniedRead, company.id, true);
  await assertDenied(workspace, `/api/plugins/${deniedRead.id}/data/checklist`, { companyId: company.id }, "undeclared state read");
  const deniedWrite = await install("denied-write", { id: "local.no-ai-denied-write", withUi: false, omitCapability: "plugin.state.write" });
  await activate(deniedWrite, company.id, true);
  await assertDenied(workspace, `/api/plugins/${deniedWrite.id}/actions/checklist.add`, { companyId: company.id, params: { text: "Must not save" } }, "undeclared action write");
  assert.deepEqual((await data(deniedWrite)).items, []);
  const health = await request(`/api/plugins/${probe.id}/health`);
  assert.equal(health.healthy, true, "UI-less Worker should be healthy");
  assert.equal(probe.manifestJson.entrypoints.ui, undefined);
  console.log("[no-ai] Core rejected cross-Workspace state and undeclared read/write capabilities; UI-less Worker healthy");

  const persisted = await eventually(() => data(plugin), value => value.eventCount === 3, "third event completion");
  await click(workspace, "#checklist-refresh", "Refresh observed event/Job counts");
  await eventually(() => workspace.evaluate(`document.querySelector('[data-testid="checklist-jobs"]')?.textContent`), text => text === "Jobs: 1", "Job count rendered by public UI bridge");
  if (screenshotPath) {
    for (const width of [620, 1000]) {
      await workspace.command("Emulation.setDeviceMetricsOverride", { width, height: 760, deviceScaleFactor: 1, mobile: false });
      await workspace.evaluate(`document.fonts.ready`, true);
      const fit = await workspace.evaluate(`({ width: innerWidth, scroll: document.documentElement.scrollWidth, item: document.querySelector('[data-testid="no-ai-checklist"]').getBoundingClientRect().width })`);
      assert.ok(fit.scroll <= fit.width && fit.item > 0 && fit.item <= fit.width, `No-AI UI overflow at ${width}: ${JSON.stringify(fit)}`);
      await captureScreenshot(workspace, path.join(path.dirname(screenshotPath), `no-ai-checklist-${width}.png`));
    }
    await workspace.command("Emulation.clearDeviceMetricsOverride");
  }
  await workspace.command("Page.reload");
  await eventually(() => workspace.evaluate(`document.querySelector('[data-testid="checklist-jobs"]')?.textContent`), text => text === "Jobs: 1", "reload persisted public UI");

  workspace = await restart();
  console.log("[no-ai] Desktop and Owner Host restarted with the same temporary data");
  assert.deepEqual(await data(plugin), persisted, "Host restart lost checklist data/event/Job state");
  assert.deepEqual((await data(plugin, second.id)).items, []);
  assert.deepEqual(await request(`/api/companies/${company.id}/agents`), []);
  assert.deepEqual(await request(`/api/companies/${second.id}/agents`), []);
  const runs = await request(`/api/companies/${company.id}/heartbeat-runs?limit=10`);
  assert.deepEqual(runs, [], "No-AI reference must not dispatch Agent work");
  await activate(plugin, company.id, false);
  await assertDenied(workspace, `/api/plugins/${plugin.id}/data/checklist`, { companyId: company.id }, "deactivated checklist");
  await activate(plugin, company.id, true);
  assert.deepEqual(await data(plugin), persisted, "Deactivation erased stored data");
  assert.equal(plugin.pluginKey, CHECKLIST_PLUGIN_KEY);
  await workspace.evaluate(`location.assign(${JSON.stringify(`/${company.issuePrefix}/plugins/${deniedRead.id}`)})`);
  await eventually(() => workspace.evaluate(`document.querySelector('[data-testid="no-ai-checklist"] [role="alert"]')?.textContent`), text => /could not be loaded/.test(text ?? ""), "capability-denied Plugin UI error state");
  await openRecovery();
  console.log("No-AI checklist Desktop E2E passed: real UI/actions/state/events/Workspace Job, A/B isolation, capability denial, UI-less Worker, Host restart, independent Native recovery. No Agent/provider/Gateway configured or Agent run created; this is not an OS sandbox or network-egress certification.");
  return { pluginKey: plugin.pluginKey, scenarios: 13 };
}
