// Isolated actual Core factory composition. Never reads a Desktop profile.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.deepEqual(process.argv.slice(2), ["--isolated-native-workspace-channel-child"]);
assert.equal(typeof process.send, "function");
const configuration = await new Promise(resolve => {
  process.once("message", resolve);
  process.send({ kind: "sps.test.native-workspace.configure-ready" });
});
assert.equal(configuration?.kind, "sps.test.native-workspace.configure");
const core = path.resolve(import.meta.dirname, "../../../../external/sps-core");
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
let db, channel, stopping = false, stopPromise;
function stop() {
  if (!stopPromise) stopPromise = (async () => {
    stopping = true;
    try { await channel?.dispose(); }
    finally {
      await db?.$client.end();
      if (process.connected) process.disconnect();
    }
  })();
  return stopPromise;
}
process.on("message", message => {
  if (message?.kind === "sps.test.native-workspace.stop") void stop().catch(() => { process.exitCode = 1; });
});
process.once("disconnect", () => { void stop().catch(() => { process.exitCode = 1; }); });
try {
  const { createDb } = await load("packages/db/src/index.ts");
  const { createSpsIdentityAuth } = await load("server/src/auth/sps-identity.ts");
  const { createSpsNativeWorkspaceChannel } = await load("server/src/services/sps-native-workspace-channel.ts");
  db = createDb(configuration.connectionString);
  const identity = createSpsIdentityAuth(db, {
    authIdentityEnabled: true, authIdentityIssuer: "https://workspace.example.test",
    authIdentityAudience: "sps-core", authIdentityJwksUrl: "https://workspace.example.test/.well-known/jwks.json",
    authPublicBaseUrl: "https://workspace.example.test",
  });
  channel = createSpsNativeWorkspaceChannel({ db, identity, ...configuration.binding,
    assertCurrent() { assert.equal(stopping, false); assert.equal(process.connected, true); },
  });
  await channel.ready;
  process.send({ kind: "sps.test.native-workspace.ready" });
} catch {
  process.exitCode = 1;
  if (process.connected) process.send({ kind: "sps.test.native-workspace.failure" });
  await stop();
}
