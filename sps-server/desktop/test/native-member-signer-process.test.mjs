import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberMainSigner } from "../src/native-member-main-signer.mjs";
import { attachSpsNativeMemberSignerChannel } from "../src/native-member-signer-channel.mjs";

async function verifyChild(coreClientUsed) {
  const at = Math.floor(Date.now() / 1000) * 1000;
  const identity = await createSpsNativeHostIdentity({ hostId: randomUUID(), hostnames: ["127.0.0.1"], notBefore: at,
    notAfter: at + 86_400_000, issuerNotAfter: at + 2 * 86_400_000 });
  const signer = createSpsNativeMemberMainSigner({
    getAuthority: () => ({ ownerSubject: "fixture-owner", userDataDirectory: "fixture-data", vaultDirectory: "fixture-vault", generation: 0n }),
    authenticateHost: async () => {}, getStore: () => ({ read: async () => identity }),
  });
  const child = spawn(process.execPath, [fileURLToPath(new URL("./fixtures/native-member-signer-child.mjs", import.meta.url)),
    ...(coreClientUsed ? [new URL("../../../external/sps-core/server/src/services/sps-native-parent-signer.ts", import.meta.url).href] : [])], {
    stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA"].includes(key))),
  });
  const channel = attachSpsNativeMemberSignerChannel(child, signer, { isCurrent: () => child.exitCode == null });
  let output = "", errors = "";
  child.stdout.on("data", bytes => { output += bytes; }); child.stderr.on("data", bytes => { errors += bytes; });
  const completed = once(child, "exit");
  const timer = setTimeout(() => child.kill(), 10_000);
  try {
    const [code] = await completed;
    assert.equal(code, 0, errors); assert.equal(errors, "");
    assert.deepEqual(JSON.parse(output), { realChildIpc: true, coreClientUsed, receivedPublicOnly: true, signedCredentialMatchesChildKey: true });
    for (const secret of [identity.server.privateKeyPem, identity.memberIssuer.privateKeyPem, "fixture-owner", "fixture-vault"])
      assert.ok(!output.includes(secret));
  } finally {
    clearTimeout(timer); channel.dispose();
    if (child.exitCode == null) { child.kill(); await completed.catch(() => {}); }
  }
}
test("a real owned Node child receives only public issuance and validates it against its private local key", { timeout: 15_000 }, async () => {
  await verifyChild(false);
});
test("the actual Core IPC client interoperates with the Main signer in a separate process", { timeout: 15_000 }, async () => {
  await verifyChild(true);
});
