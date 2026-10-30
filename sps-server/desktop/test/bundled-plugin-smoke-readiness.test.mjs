import assert from "node:assert/strict";
import test from "node:test";
import { waitForBundledPluginRows } from "../scripts/bundled-plugin-smoke-readiness.mjs";

const pluginIds = ["fixture.one", "fixture.two"];
const row = (id, status = "ready") => ({ manifestJson: { id }, status });
const response = rows => ({ ok: true, json: async () => rows });

test("health-era partial bundle rows do not prematurely qualify the smoke", async () => {
  const lists = [[], [row(pluginIds[0])], [row(pluginIds[0]), row(pluginIds[1], "installed")], pluginIds.map(id => row(id))];
  let calls = 0, elapsed = 0;
  await waitForBundledPluginRows({ pluginIds,
    request: async route => { assert.equal(route, "/api/plugins"); return response(lists[calls++]); },
    now: () => elapsed, delay: async milliseconds => { elapsed += milliseconds; }, timeoutMs: 1000 });
  assert.equal(calls, 4);
});

test("missing bundles fail within the fixed readiness budget", async () => {
  let elapsed = 0;
  await assert.rejects(waitForBundledPluginRows({ pluginIds,
    request: async () => response([row(pluginIds[0])]), now: () => elapsed,
    delay: async milliseconds => { elapsed += milliseconds; }, timeoutMs: 500 }), /fixture.two:missing/);
  assert.equal(elapsed, 500);
});

test("invalid, failed or duplicate bundle rows cannot qualify", async () => {
  for (const rows of [null, [row(pluginIds[0], "error")], [row(pluginIds[0]), row(pluginIds[0])]]) {
    await assert.rejects(waitForBundledPluginRows({ pluginIds, request: async () => response(rows) }), /array|failed to load|repeated/);
  }
  await assert.rejects(waitForBundledPluginRows({ pluginIds, request: async () => ({ ok: false, status: 403 }) }), /403/);
});
