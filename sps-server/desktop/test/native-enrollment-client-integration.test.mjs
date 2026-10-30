import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Native client/Core interoperability is an isolated explicit real-service gate, not a product mount", async () => {
  const script = await readFile(new URL("../scripts/smoke-native-enrollment-client-core.mjs", import.meta.url), "utf8");
  const child = await readFile(new URL("../scripts/fixtures/native-parent-ingress-child.mjs", import.meta.url), "utf8");
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
  assert.match(script, /last stage: \$\{lastStage\}/);
  assert.match(script, /30_000\);/);
  assert.match(script, /configure-ready/);
  assert.match(script, /configurationSent/);
  assert.match(child, /sps\.test\.native-parent\.progress/);
  assert.ok(child.indexOf("process.once(\"message\"") < child.indexOf("sps.test.native-parent.configure-ready"));
  assert.match(child, /imports-db[\s\S]*imports-identity[\s\S]*imports-enrollment[\s\S]*imports-ingress[\s\S]*identity-init[\s\S]*enrollment-init[\s\S]*ingress-init/);
  const bootstrapStart = script.indexOf("const metadata = await bootstrap.inspect()");
  const sessionStart = script.indexOf("await member.exchange(token())");
  assert.ok(bootstrapStart > 0 && sessionStart > bootstrapStart);
  const bootstrap = script.slice(bootstrapStart, sessionStart);
  assert.match(bootstrap, /assert\.deepEqual\(await db\.select\(\)\.from\(authSessions\), \[\]\)/);
  assert.match(bootstrap, /assert\.equal\(requests\[0\]\.hasBearer, false\)/);
  assert.match(bootstrap, /assert\.equal\(requests\[0\]\.hasCookie, false\)/);
  assert.match(bootstrap, /issuerSpkiSha256: metadata\.issuerSpkiSha256/);
  assert.ok(script.lastIndexOf('console.log(throughParent') > script.indexOf("await database.cleanup()"));
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
  assert.match(job, /timeout-minutes: 5\s+run: pnpm --filter @paperclipai\/db exec tsx (?:\.\.\/){4}sps-server\/desktop\/scripts\/smoke-native-enrollment-client-core\.mjs --isolated-native-parent-ingress/);
  assert.doesNotMatch(job, /continue-on-error|\|\| true/);
});

test("Main wires Native enrollment through the scoped Member controller without exposing the raw client", async () => {
  const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/native-member-controller.mjs", import.meta.url), "utf8");
  const preload = await readFile(new URL("../src/core-settings-preload.cjs", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../renderer/core-settings.mjs", import.meta.url), "utf8");

  assert.match(main, /import \{ createSpsNativeServerCertificateClient \} from "\.\/native-enrollment-client\.mjs"/);
  assert.match(main, /createSpsNativeMemberController\(\{[\s\S]{0,500}createServerCertificate: createSpsNativeServerCertificateClient/);
  assert.match(controller, /createSpsNativeEnrollmentClient/);
  assert.match(main, /enrollNativeMember: \(input, options\) => ensureNativeMemberController\(\)\.enroll\(input, options\)/);
  assert.match(preload, /enrollNativeMember/);
  assert.match(renderer, /window\.spsCoreSettings\.enrollNativeMember/);
  for (const source of [main, preload, renderer]) {
    assert.doesNotMatch(source, /createSpsNativeEnrollmentClient/);
  }
  assert.doesNotMatch(preload, /native-enrollment-client/);
  assert.doesNotMatch(renderer, /native-enrollment-client/);
});
