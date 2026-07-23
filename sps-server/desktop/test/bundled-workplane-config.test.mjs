import assert from "node:assert/strict";
import test from "node:test";
import { spsTeamWorkplaneRuntimeConfig, synchronizeSpsTeamWorkplaneConfig } from "../src/bundled-workplane-config.mjs";

test("binds the Team Workplane to the selected local Owner Host while preserving plugin choices", () => {
  const config = spsTeamWorkplaneRuntimeConfig("http://127.0.0.1:31310/path", {
    enableAgyQuotaFallback: true,
    spsApiUrl: "http://127.0.0.1:3100",
  });

  assert.deepEqual(config, {
    enableAgyQuotaFallback: true,
    spsApiUrl: "http://127.0.0.1:31310",
  });
});

test("refuses to bind a local Team Workplane to a remote server", () => {
  assert.throws(
    () => spsTeamWorkplaneRuntimeConfig("https://example.com", {}),
    /local Owner Host/,
  );
});

test("updates a stale Team Workplane runtime address once", async () => {
  const calls = [];
  const result = await synchronizeSpsTeamWorkplaneConfig({
    ownerHostUrl: "http://127.0.0.1:31310",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET", body: init.body ?? null, headers: new Headers(init.headers) });
      if (!init.method) return new Response(JSON.stringify({ configJson: { spsApiUrl: "http://127.0.0.1:3100", customSetting: true } }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.equal(result.changed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(JSON.parse(calls[1].body), {
    configJson: { spsApiUrl: "http://127.0.0.1:31310", customSetting: true },
  });
  assert.equal(calls[0].headers.get("x-sps-desktop-access"), null);
});

test("uses the ephemeral Desktop access token when binding a protected Owner Host", async () => {
  const calls = [];
  await synchronizeSpsTeamWorkplaneConfig({
    ownerHostUrl: "http://127.0.0.1:31310",
    desktopAccessToken: "desktop-token-for-test",
    fetchImpl: async (_url, init = {}) => {
      calls.push(new Headers(init.headers));
      return new Response(JSON.stringify({ configJson: { spsApiUrl: "http://127.0.0.1:31310" } }), { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].get("x-sps-desktop-access"), "desktop-token-for-test");
});

test("does not rewrite an already synchronized Team Workplane configuration", async () => {
  const calls = [];
  const result = await synchronizeSpsTeamWorkplaneConfig({
    ownerHostUrl: "http://127.0.0.1:31310",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET" });
      return new Response(JSON.stringify({ configJson: { spsApiUrl: "http://127.0.0.1:31310" } }), { status: 200 });
    },
  });

  assert.equal(result.changed, false);
  assert.equal(calls.length, 1);
});
