// Isolated integration child only. Product Core mounts these same factories in
// its prepared, directly owned startup path. Never read a real SPS profile.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.deepEqual(process.argv.slice(2), ["--isolated-native-parent-ingress-child"]);
assert.equal(typeof process.send, "function");
const configuration = await new Promise((resolve, reject) => {
  process.once("message", message => {
    if (message?.kind !== "sps.test.native-parent.configure") {
      reject(new Error("Unexpected isolated child bootstrap message."));
      return;
    }
    resolve(message);
  });
  process.send({ kind: "sps.test.native-parent.configure-ready" });
});
assert.equal(configuration?.kind, "sps.test.native-parent.configure");
const core = path.resolve(import.meta.dirname, "../../../../external/sps-core");
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
let db, enrollment, ingress, stopping = false, stage = "imports-db";
const reportStage = value => {
  stage = value;
  if (process.connected) process.send({ kind: "sps.test.native-parent.progress", stage: value });
};
globalThis.fetch = async input => {
  assert.equal(String(input), `${configuration.issuer}/.well-known/jwks.json`);
  return new Response(JSON.stringify({ keys: [configuration.publicJwk] }));
};
async function stop() {
  if (stopping) return;
  stopping = true;
  ingress?.dispose();
  enrollment?.dispose();
  await db?.$client.end();
  if (process.connected) process.disconnect();
}
process.on("message", message => {
  if (message?.kind === "sps.test.native-parent.stop") void stop().catch(() => { process.exitCode = 1; });
});
process.once("disconnect", () => { void stop().catch(() => { process.exitCode = 1; }); });
try {
  reportStage("imports-db");
  const { createDb } = await load("packages/db/src/index.ts");
  reportStage("imports-identity");
  const { createSpsIdentityAuth } = await load("server/src/auth/sps-identity.ts");
  reportStage("imports-enrollment");
  const { createSpsNativeParentEnrollmentService } = await load("server/src/services/sps-native-parent-enrollment.ts");
  reportStage("imports-ingress");
  const { createSpsNativeParentIngress } = await load("server/src/services/sps-native-parent-ingress.ts");
  reportStage("identity-init");
  db = createDb(configuration.connectionString);
  const identity = createSpsIdentityAuth(db, { authIdentityEnabled: true,
    authIdentityIssuer: configuration.issuer, authIdentityAudience: "sps-core",
    authIdentityJwksUrl: `${configuration.issuer}/.well-known/jwks.json`, authPublicBaseUrl: "https://native.example.test" });
  reportStage("enrollment-init");
  enrollment = await createSpsNativeParentEnrollmentService(db, {
    pairingPolicy: { maxTtlMs: 3_600_000, maxAttempts: 5, maxActiveInvites: 10 },
    certificateLifetimeMs: 30 * 60_000, signingTimeoutMs: 5000, maxConcurrentSignings: 2,
  });
  reportStage("ingress-init");
  ingress = createSpsNativeParentIngress(identity, enrollment, {
    assertCurrent() { assert.equal(stopping, false); },
  });
  process.send({ kind: "sps.test.native-parent.ready", identity: enrollment.identity });
} catch {
  if (process.connected) process.send({ kind: "sps.test.native-parent.failure", stage });
  process.exitCode = 1;
  await stop();
}
