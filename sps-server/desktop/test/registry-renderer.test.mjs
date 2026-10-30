import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Script } from "node:vm";

const renderer = await readFile(new URL("../renderer/registry.mjs", import.meta.url), "utf8");
const html = await readFile(new URL("../renderer/registry.html", import.meta.url), "utf8");
const sourceA = { id: "registry-a", displayName: "Registry A", kind: "local" };
const sourceB = { id: "registry-b", displayName: "Registry B", kind: "local" };
const stage = {
  stageId: "stage-1", pluginId: "io.example.plugin", version: "1.0.0", packageName: "example-plugin",
  source: { registryId: sourceA.id }, artifactSha256: "a".repeat(64),
  status: "staged", capabilities: [], stagedAt: "2026-10-24T00:00:00.000Z",
};

function report(source) {
  return {
    source, valid: true, trust: "local", releases: [{
      pluginId: stage.pluginId, version: stage.version, publisherId: "example", visibility: "public",
      capabilities: [], artifact: { sizeBytes: 100, sha256: "a".repeat(64) },
      catalog: { displayName: `${source.displayName} package` },
    }],
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

class Element {
  constructor(attributes = "") {
    this.dataset = {};
    this.listeners = new Map();
    this.buttons = [];
    this.value = "";
    this.disabled = /\bdisabled(?:\s|$)/.test(attributes);
    this.isConnected = true;
    this.classes = new Set();
    this.classList = {
      contains: name => this.classes.has(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
    for (const [, key, value] of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) {
      if (key === "class") this.classes = new Set(value.split(/\s+/));
      if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
    this.innerHTML = "";
  }

  set innerHTML(value) {
    for (const button of this.buttons) button.isConnected = false;
    this.markup = value;
    this.buttons = [...value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attributes, label]) => {
      const button = new Element(attributes);
      button.textContent = label;
      return button;
    });
  }
  get innerHTML() { return this.markup; }
  set textContent(value) { this.innerHTML = String(value); }
  get textContent() { return this.markup.replace(/<[^>]*>/g, ""); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  closest(selector) {
    if (selector === "button") return this;
    if (selector.startsWith(".")) return this.classes.has(selector.slice(1)) ? this : null;
    const attribute = selector.match(/^\[data-([\w-]+)\]$/)?.[1];
    const key = attribute?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return key && Object.hasOwn(this.dataset, key) ? this : null;
  }
  async emit(name, target = this) {
    return await this.listeners.get(name)?.({ target, currentTarget: this, preventDefault() {} });
  }
}

function harness(overrides = {}, { search = "", confirm = true } = {}) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [`#${id}`, new Element()]));
  const get = selector => {
    assert.ok(elements.has(selector), `Missing HTML element ${selector}`);
    return elements.get(selector);
  };
  const body = new Element();
  const calls = [];
  const api = {
    listSources: async () => [sourceA, sourceB],
    listBundledReviews: async () => [],
    stageBundledReview: async input => { calls.push({ method: "stageBundledReview", ...JSON.parse(JSON.stringify(input)) }); return { stage }; },
    listStages: async () => [],
    listDeveloperProjects: async () => [],
    getDeveloperContext: async () => null,
    getPreviewState: async () => ({ active: false }),
    listPreviewDiagnostics: async () => ({ events: [] }),
    inspectSource: async ({ sourceId }) => report(sourceId === sourceA.id ? sourceA : sourceB),
    stageRelease: async input => { calls.push({ method: "stageRelease", ...JSON.parse(JSON.stringify(input)) }); return { stage }; },
    enableStage: async input => { calls.push({ method: "enableStage", ...JSON.parse(JSON.stringify(input)) }); return { stage: { ...stage, status: "registered" }, plugin: { pluginKey: stage.pluginId, version: stage.version, status: "ready" } }; },
    removeSource: async ({ sourceId }) => [sourceA, sourceB].filter(source => source.id !== sourceId),
    ...overrides,
  };
  const window = {
    spsRegistry: api, location: { search },
    confirm: () => { calls.push({ method: "confirm" }); return confirm; },
  };
  const document = {
    body, querySelector: get,
    querySelectorAll: selectors => selectors.includes("#preview-environment-form")
      ? ["#preview-role", "#preview-viewport", "#preview-ui-state", "#preview-node", "#preview-runtime", "#preview-source", "#apply-preview-environment"].map(get)
      : selectors.split(",").map(selector => get(selector.trim())),
  };
  const ready = new Script(`(async () => { "use strict";\n${renderer}\n})()`, { filename: "registry.mjs" })
    .runInNewContext({ window, document, URLSearchParams });
  const button = (container, className, predicate = () => true) => {
    const found = get(container).buttons.find(entry => entry.classList.contains(className) && predicate(entry));
    assert.ok(found, `Missing ${className} button`);
    return found;
  };
  return {
    api, body, calls, get, ready, button,
    select: sourceId => get("#source-list").emit("click", button("#source-list", "source-select", entry => entry.dataset.sourceId === sourceId)),
    click: (container, target) => get(container).emit("click", target),
    output: () => [...elements.values()].map(element => element.innerHTML).join("\n"),
  };
}

test("restored current-app copies stage without implicit confirmation or enablement", async () => {
  const review = { pluginId: "sps.default-memory", packageName: "memory <script>", version: "0.1.0",
    capabilities: ["events.subscribe"], manifestSha256: "c".repeat(64) };
  const h = harness({ listBundledReviews: async () => [review] });
  await h.ready;
  assert.match(h.get("#bundled-review-list").innerHTML, /memory &lt;script&gt;/);
  const button = h.button("#bundled-review-list", "stage-bundled-review");
  await h.click("#bundled-review-list", button);
  assert.deepEqual(h.calls, [{ method: "stageBundledReview", pluginId: review.pluginId }]);
  assert.match(h.get("#notice").textContent, /without running code/);
  assert.equal(button.disabled, false);
});

test("restored bundle review failures stay stopped and support refresh", async () => {
  const h = harness({ listBundledReviews: async () => { throw new Error("private-path"); } });
  await h.ready;
  assert.match(h.get("#bundled-review-list").innerHTML, /Could not load/);
  assert.doesNotMatch(h.output(), /private-path/);
  h.api.listBundledReviews = async () => [];
  await h.get("#refresh-bundled-reviews").emit("click");
  // Refresh handler schedules its async read without changing lifecycle state.
  await new Promise(resolve => setImmediate(resolve));
  assert.match(h.get("#bundled-review-list").innerHTML, /No restored/);
  assert.deepEqual(h.calls, []);
});

test("ignores late source inspection results and stages only the displayed source", async () => {
  const a = deferred();
  const h = harness({ inspectSource: ({ sourceId }) => sourceId === sourceA.id ? a.promise : Promise.resolve(report(sourceB)) });
  await h.ready;
  const selectA = h.select(sourceA.id);
  await h.select(sourceB.id);
  a.resolve(report(sourceA));
  await selectA;
  assert.equal(h.get("#catalog-title").textContent, sourceB.displayName);
  const button = h.button("#release-list", "stage-release");
  await h.click("#release-list", button);
  assert.deepEqual(h.calls, [{ method: "stageRelease", sourceId: sourceB.id, pluginId: stage.pluginId, version: stage.version }]);
});

test("ignores late inspection failures and older requests for the same source", async () => {
  const old = deferred();
  let inspections = 0;
  const h = harness({ inspectSource: () => ++inspections === 1 ? old.promise : Promise.resolve(report(sourceA)) });
  await h.ready;
  const first = h.select(sourceA.id);
  await h.select(sourceA.id);
  old.reject(new Error("private-token-and-path"));
  await first;
  assert.match(h.get("#release-list").innerHTML, /Stage for review/);
  assert.doesNotMatch(h.output(), /private-token/);
});

test("rejects stale buttons, altered release identity, and mismatched inspection provenance", async () => {
  const h = harness();
  await h.ready;
  await h.select(sourceA.id);
  const old = h.button("#release-list", "stage-release");
  await h.select(sourceB.id);
  await h.click("#release-list", old);
  const current = h.button("#release-list", "stage-release");
  current.dataset.pluginId = "io.unreviewed.plugin";
  await h.click("#release-list", current);
  assert.equal(h.calls.length, 0);
  h.api.inspectSource = async () => report(sourceA);
  await h.select(sourceB.id);
  assert.match(h.get("#release-list").innerHTML, /Could not verify/);
  assert.equal(h.get("#release-list").buttons.length, 0);
});

test("removing a source invalidates its in-flight inspection and old release buttons", async () => {
  const pending = deferred();
  const h = harness();
  await h.ready;
  await h.select(sourceA.id);
  const old = h.button("#release-list", "stage-release");
  h.api.inspectSource = () => pending.promise;
  const inspecting = h.select(sourceA.id);
  await h.click("#source-list", h.button("#source-list", "remove-source", entry => entry.dataset.removeSourceId === sourceA.id));
  pending.resolve(report(sourceA));
  await inspecting;
  await h.click("#release-list", old);
  assert.equal(h.get("#catalog-title").textContent, "Choose a source");
  assert.equal(h.calls.length, 0);
});

test("finishing removal clears a source reselected while its removal was pending", async () => {
  const removal = deferred();
  const h = harness({ removeSource: () => removal.promise });
  await h.ready;
  await h.select(sourceA.id);
  const removing = h.click("#source-list", h.button("#source-list", "remove-source", entry => entry.dataset.removeSourceId === sourceA.id));
  await h.select(sourceA.id);
  const old = h.button("#release-list", "stage-release");
  removal.resolve([sourceB]);
  await removing;
  await h.click("#release-list", old);
  assert.equal(h.get("#catalog-title").textContent, "Choose a source");
  assert.equal(h.calls.length, 0);
});

test("renders pending review without an apply action or an invented settings link", async () => {
  const h = harness({ listStages: async () => [{ ...stage, status: "review_pending" }] });
  await h.ready;
  assert.match(h.get("#stage-list").innerHTML, /Awaiting Host review/);
  assert.match(h.get("#stage-list").innerHTML, /Settings > Plugins/);
  assert.doesNotMatch(h.get("#stage-list").innerHTML, /enable-stage|href=/);
  await h.click("#stage-list", new Element('class="enable-stage" data-stage-id="stage-1"'));
  assert.equal(h.calls.length, 0);
});

test("reports either pending response status honestly even if the refreshed stage is stale", async () => {
  for (const response of [
    { stage: { status: "review_pending" }, plugin: { status: "ready" } },
    { stage: { status: "staged" }, plugin: { status: "upgrade_pending" } },
  ]) {
    let applied = 0;
    const h = harness({ listStages: async () => [stage], enableStage: async () => { applied++; return response; } });
    await h.ready;
    const old = h.button("#stage-list", "enable-stage");
    await h.click("#stage-list", old);
    assert.match(h.get("#notice").textContent, /awaiting Host review/);
    assert.doesNotMatch(h.get("#notice").textContent, /is ready/);
    assert.match(h.get("#stage-list").innerHTML, /Awaiting Host review/);
    await h.click("#stage-list", old);
    assert.equal(applied, 1);
  }
});

test("keeps applying explicit and reports a ready result after confirmation", async () => {
  const cancelled = harness({ listStages: async () => [stage] }, { confirm: false });
  await cancelled.ready;
  await cancelled.click("#stage-list", cancelled.button("#stage-list", "enable-stage"));
  assert.deepEqual(cancelled.calls, [{ method: "confirm" }]);
  const h = harness({ listStages: async () => [stage] });
  await h.ready;
  await h.click("#stage-list", h.button("#stage-list", "enable-stage"));
  assert.deepEqual(h.calls, [{ method: "confirm" }, { method: "enableStage", stageId: stage.stageId }]);
  assert.match(h.get("#notice").textContent, /is ready/);
});

test("source deep links and review queue initialize while optional panels are still loading", async () => {
  const diagnostics = deferred();
  const projects = deferred();
  const h = harness({
    listPreviewDiagnostics: () => diagnostics.promise,
    listDeveloperProjects: () => projects.promise,
    listStages: async () => [stage],
  }, { search: `?source=${sourceA.id}` });
  await new Promise(setImmediate);
  assert.match(h.get("#release-list").innerHTML, /Registry A package/);
  assert.match(h.get("#stage-list").innerHTML, /Enable reviewed version/);
  assert.match(h.get("#developer-project-list").innerHTML, /Loading/);
  diagnostics.reject(new Error("private-token-and-path"));
  projects.resolve([]);
  await h.ready;
  assert.match(h.get("#preview-diagnostics-list").innerHTML, /Use Refresh to retry/);
  assert.doesNotMatch(h.output(), /private-token/);
});

test("startup panel failures are safe, independent, and recover through existing Refresh controls", async () => {
  const cases = [
    ["listSources", "#source-list", "#refresh-sources", [sourceA, sourceB], /Registry A/],
    ["listDeveloperProjects", "#developer-project-list", "#refresh-developer-projects", [], /No external plugin projects/],
    ["getPreviewState", "#preview-environment-status", "#refresh-preview-environment", { active: false }, /Open an isolated Preview/],
    ["listPreviewDiagnostics", "#preview-diagnostics-list", "#refresh-preview-diagnostics", { events: [] }, /No Development diagnostics/],
    ["listStages", "#stage-list", "#refresh-stages", [], /No staged packages/],
    ["getDeveloperContext", "#developer-context-project", "#refresh-developer-projects", null, /No project linked/],
  ];
  for (const [method, panel, refresh, result, recovered] of cases) {
    const h = harness({ [method]: async () => { throw new Error("private-token-and-path"); } }, { search: `?source=${sourceA.id}` });
    await h.ready;
    assert.match(h.get(panel).textContent, /Refresh/, method);
    assert.doesNotMatch(h.output(), /private-token/);
    assert.equal(h.body.classList.contains("developer-context-mode"), false);
    if (method !== "listSources") assert.match(h.get("#release-list").innerHTML, /Registry A package/);
    if (method === "getPreviewState") assert.equal(h.get("#apply-preview-environment").disabled, true);
    h.api[method] = async () => result;
    await h.get(refresh).emit("click");
    assert.match(h.get(panel).textContent, recovered, method);
    if (method === "listSources") assert.match(h.get("#release-list").innerHTML, /Registry A package/);
  }
});

test("source inspection errors are safe and a source Refresh retries the selected catalog", async () => {
  const h = harness({ inspectSource: async () => { throw new Error("private-token-and-path"); } }, { search: `?source=${sourceA.id}` });
  await h.ready;
  assert.match(h.get("#release-list").innerHTML, /Could not verify/);
  assert.doesNotMatch(h.output(), /private-token/);
  h.api.inspectSource = async () => report(sourceA);
  await h.get("#refresh-sources").emit("click");
  assert.match(h.get("#release-list").innerHTML, /Stage for review/);
});
