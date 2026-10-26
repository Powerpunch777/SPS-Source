import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Native client/Core interoperability is an isolated explicit real-service gate, not a product mount", async () => {
  const script = await readFile(new URL("../scripts/smoke-native-enrollment-client-core.mjs", import.meta.url), "utf8");
  for (const required of ["--isolated-native-enrollment-client", "startEmbeddedPostgresTestDatabase",
    'server/src/auth/sps-identity.ts', 'server/src/services/sps-native-session-exchange-http.ts',
    'server/src/services/sps-native-enrollment-http.ts', 'createSpsNativeEnrollmentClient',
    'assert.equal(requests.length, 0', 'status, "pending"', 'status, "consumed"',
    'await assert.rejects(replay.complete', 'for (const table of [agents, plugins, companyMemberships, spsNodes])',
    'globalThis.fetch = previousFetch', 'await db.$client.end()', 'await database.cleanup()']) {
    assert.ok(script.includes(required), `Missing real Core interoperability assertion: ${required}`);
  }
  assert.match(script, /server\.listen\(0, "127\.0\.0\.1", resolve\)/);
  assert.match(script, /assert\.equal\(support\.supported, true/);
  assert.ok(script.lastIndexOf('console.log("Native enrollment') > script.indexOf("await database.cleanup()"));
  assert.doesNotMatch(script, /safeStorage|electron|app\.whenReady|0\.0\.0\.0|sps-production/);
});

test("full Linux Core verification also runs the actual Desktop transport integration", async () => {
  const workflow = (await readFile(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const at = workflow.indexOf("name: SPS Core full Linux typecheck and build");
  const end = workflow.indexOf("\n  room-plugin:", at);
  assert.ok(at >= 0 && end > at);
  const job = workflow.slice(at, end);
  assert.match(job, /working-directory: external\/sps-core/);
  assert.match(job, /working-directory: sps-server\/desktop\s+run: npm ci --ignore-scripts/);
  assert.match(job, /timeout-minutes: 5\s+run: pnpm exec tsx \.\.\/\.\.\/sps-server\/desktop\/scripts\/smoke-native-enrollment-client-core\.mjs --isolated-native-enrollment-client/);
  assert.doesNotMatch(job, /continue-on-error|\|\| true/);
});

test("the Native enrollment client is not imported by Main, preloads or renderer startup", async () => {
  for (const relative of ["../src/main.mjs", "../src/core-settings-preload.cjs", "../renderer/core-settings.mjs"]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /native-enrollment-client|createSpsNativeEnrollmentClient/);
  }
});
