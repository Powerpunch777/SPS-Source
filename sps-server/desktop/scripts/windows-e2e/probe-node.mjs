import assert from "node:assert/strict";

// Harmless fixed fixture: no UI, files, listener or runtime execution.
assert.deepEqual(process.argv.slice(2), ['a "quoted" value', "tail\\", "unicode-\uD55C\uAE00"]);
assert.equal(process.env.NODE_OPTIONS, undefined);
assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined);
assert.equal(process.env.GITHUB_TOKEN, undefined);
assert.equal(process.env.SPS_CI_E2E_SECRET_SENTINEL, undefined);
console.log(JSON.stringify({ nodeProbe: true, argumentsPreserved: true, executionHooksCleared: true, unrelatedEnvironmentRemoved: true, label: "unicode-\uD55C\uAE00" }));
console.error("restricted_e2e_probe_stderr");
