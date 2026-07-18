import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";

const { collaborationReadinessFromConfig } = await import("../src/worker.js");

const localOnly = collaborationReadinessFromConfig({
  server: { deploymentMode: "local_trusted", exposure: "private", host: "127.0.0.1", bind: "loopback", port: 3100 },
  auth: {}
});
assert.equal(localOnly.state, "local_only");
assert.equal(localOnly.localOnlySafeDefault, true);
assert.equal(localOnly.collaborationReady, false);
assert.equal(localOnly.checks[0].status, "pass");

const tailnetReady = collaborationReadinessFromConfig({
  server: {
    deploymentMode: "authenticated",
    exposure: "private",
    host: "100.64.0.12",
    bind: "tailnet",
    port: 3100,
    allowedHostnames: ["workplane.tailnet.ts.net"]
  },
  auth: {}
}, { hasAuthenticationSecret: true });
assert.equal(tailnetReady.state, "collaboration_ready");
assert.equal(tailnetReady.collaborationReady, true);
assert.equal(tailnetReady.checks.every((check) => check.status === "pass"), true);

const missingSecret = collaborationReadinessFromConfig({
  server: { deploymentMode: "authenticated", exposure: "private", host: "100.64.0.12", bind: "tailnet", port: 3100, allowedHostnames: ["workplane.tailnet.ts.net"] },
  auth: {}
});
assert.equal(missingSecret.state, "configuration_incomplete");
assert.equal(missingSecret.checks.some((check) => check.status === "fail" && check.label === "Authentication secret"), true);

const missingHostname = collaborationReadinessFromConfig({
  server: { deploymentMode: "authenticated", exposure: "private", host: "100.64.0.12", bind: "tailnet", port: 3100 },
  auth: {}
}, { hasAuthenticationSecret: true });
assert.equal(missingHostname.state, "configuration_incomplete");
assert.equal(missingHostname.checks.some((check) => check.status === "fail" && check.label === "Trusted hostname"), true);

const publicMissingUrl = collaborationReadinessFromConfig({
  server: { deploymentMode: "authenticated", exposure: "public", host: "0.0.0.0", bind: "lan", port: 3100 },
  auth: { baseUrlMode: "automatic" }
}, { hasAuthenticationSecret: true });
assert.equal(publicMissingUrl.state, "configuration_incomplete");
assert.equal(publicMissingUrl.checks.some((check) => check.status === "fail" && check.label === "Public URL"), true);

console.log("collaboration readiness tests passed");
