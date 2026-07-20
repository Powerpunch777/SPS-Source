import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { getRuntimeConfig } = await import("../dist/worker.js");

const defaultRuntime = await getRuntimeConfig({ config: { get: async () => ({}) } });
assert.equal(defaultRuntime.enableAgyQuotaFallback, false);
assert.equal(defaultRuntime.enableCodexRooms, true);

const previousOwnerHostUrl = process.env.SPS_ROOM_API_URL;
process.env.SPS_ROOM_API_URL = "http://127.0.0.1:31457";
const ownerHostRuntime = await getRuntimeConfig({
  config: { get: async () => ({ spsApiUrl: "http://127.0.0.1:3100" }) }
});
assert.equal(ownerHostRuntime.spsApiUrl, "http://127.0.0.1:31457");
if (previousOwnerHostUrl === undefined) delete process.env.SPS_ROOM_API_URL;
else process.env.SPS_ROOM_API_URL = previousOwnerHostUrl;

const optedInRuntime = await getRuntimeConfig({
  config: { get: async () => ({ enableAgyQuotaFallback: true }) }
});
assert.equal(optedInRuntime.enableAgyQuotaFallback, true);

const explicitlyDisabledRuntime = await getRuntimeConfig({
  config: { get: async () => ({ enableAgyQuotaFallback: false }) }
});
assert.equal(explicitlyDisabledRuntime.enableAgyQuotaFallback, false);

console.log("PASS quota provider fallback is opt-in and never changes the default provider silently");
