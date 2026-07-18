import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { getRuntimeConfig } = await import("../dist/worker.js");

const defaultRuntime = await getRuntimeConfig({ config: { get: async () => ({}) } });
assert.equal(defaultRuntime.enableAgyQuotaFallback, false);

const optedInRuntime = await getRuntimeConfig({
  config: { get: async () => ({ enableAgyQuotaFallback: true }) }
});
assert.equal(optedInRuntime.enableAgyQuotaFallback, true);

const explicitlyDisabledRuntime = await getRuntimeConfig({
  config: { get: async () => ({ enableAgyQuotaFallback: false }) }
});
assert.equal(explicitlyDisabledRuntime.enableAgyQuotaFallback, false);

console.log("PASS quota provider fallback is opt-in and never changes the default provider silently");
