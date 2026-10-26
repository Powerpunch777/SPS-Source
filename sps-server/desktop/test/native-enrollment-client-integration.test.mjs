import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Native client/Core interoperability is an isolated explicit real-service gate, not a product mount", async () => {
  const script = await readFile(new URL("../scripts/smoke-native-enrollment-client-core.mjs", import.meta.url), "utf8");
  for (const required of ["--isolated-native-enrollment-client", "startEmbeddedPostgresTestDatabase",
    'server/src/auth/sps-identity.ts', 'server/src/services/sps-native-session-exchange-http.ts',
    'server/src/services/sps-native-enrollment-http.ts', 'createSpsNativeEnrollmentClient',
    'server/src/services/sps-native-identity-http.ts', 'createSpsNativeEnrollmentBootstrap',
    'assert.equal(requests.length, 0', 'status, "pending"', 'status, "consumed"',
    'await assert.rejects(replay.complete', 'for (const table of [agents, plugins, companyMemberships, spsNodes])',
    'globalThis.fetch = previousFetch', 'await db.$client.end()', 'await database.cleanup()']) {
    assert.ok(script.includes(required), `Missing real Core interoperability assertion: ${required}`);
  }
  assert.match(script, /server\.listen\(0, "127\.0\.0\.1", resolve\)/);
  assert.match(script, /assert\.equal\(support\.supported, true/);
  const bootstrapStart = script.indexOf("const metadata = await bootstrap.inspect()");
  const sessionStart = script.indexOf("await member.exchange(token())");
  assert.ok(bootstrapStart > 0 && sessionStart > bootstrapStart);
  const bootstrap = script.slice(bootstrapStart, sessionStart);
  assert.match(bootstrap, /assert\.deepEqual\(await db\.select\(\)\.from\(authSessions\), \[\]\)/);
  assert.match(bootstrap, /assert\.equal\(requests\[0\]\.hasBearer, false\)/);
  assert.match(bootstrap, /assert\.equal\(requests\[0\]\.hasCookie, false\)/);
  assert.match(bootstrap, /issuerSpkiSha256: metadata\.issuerSpkiSha256/);
  assert.ok(script.lastIndexOf('console.log(mode === "--isolated-native-member-controller"') > script.indexOf("await database.cleanup()"));
  assert.match(script, /AES safeStorage substitute only/);
  assert.match(script, /createSpsNativeMemberController/);
  assert.match(script, /assert\.equal\(current\.ino, localFixtureIdentity\?\.ino\)/);
  assert.doesNotMatch(script, /from ["']electron|app\.whenReady|0\.0\.0\.0|sps-production/);
});

test("full Linux Core verification also runs the actual Desktop transport integration", async () => {
  const workflow = (await readFile(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const at = workflow.indexOf("name: SPS Core full Linux typecheck and build");
  const end = workflow.indexOf("\n  room-plugin:", at);
  assert.ok(at >= 0 && end > at);
  const job = workflow.slice(at, end);
  assert.match(job, /working-directory: external\/sps-core/);
  assert.match(job, /working-directory: sps-server\/desktop\s+run: npm ci --ignore-scripts/);
  assert.match(job, /timeout-minutes: 5\s+run: pnpm --filter @paperclipai\/db exec tsx (?:\.\.\/){4}sps-server\/desktop\/scripts\/smoke-native-enrollment-client-core\.mjs --isolated-native-enrollment-client/);
  assert.match(job, /timeout-minutes: 5\s+run: pnpm --filter @paperclipai\/db exec tsx (?:\.\.\/){4}sps-server\/desktop\/scripts\/smoke-native-enrollment-client-core\.mjs --isolated-native-member-controller/);
  assert.doesNotMatch(job, /continue-on-error|\|\| true/);
});

test("the Native enrollment client is not imported by Main, preloads or renderer startup", async () => {
  for (const relative of ["../src/main.mjs", "../src/core-settings-preload.cjs", "../renderer/core-settings.mjs"]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /native-enrollment-client|createSpsNativeEnrollmentClient/);
  }
});
