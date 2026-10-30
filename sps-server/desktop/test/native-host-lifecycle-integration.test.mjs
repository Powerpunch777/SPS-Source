import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { X509Certificate } from "node:crypto";
import { request as httpsRequest } from "node:https";
import test from "node:test";
import { createSpsNativeHostIngress } from "../src/native-host-ingress.mjs";
import { createSpsNativeParentIngressClient } from "../src/native-parent-ingress-client.mjs";
import { createSpsNativeHostIdentity, inspectSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";

const HOST_ID = "11111111-1111-4111-8111-111111111111";

function post(port, certificate) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: "127.0.0.1", port, path: "/sps-native/v1/identity", method: "POST",
      agent: false, ca: certificate, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": "0", Connection: "close" } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("end", () => resolve({ statusCode: response.statusCode,
        headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.once("error", reject);
    req.end();
  });
}

test("owned Main ingress crosses bounded private IPC without exporting Host private keys", async t => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const identity = await createSpsNativeHostIdentity({ hostId: HOST_ID, hostnames: ["127.0.0.1"],
    notBefore: now - 60_000, notAfter: now + 3_600_000, issuerNotAfter: now + 7_200_000 });
  const child = Object.assign(new EventEmitter(), { connected: true, exitCode: null });
  const sent = [];
  child.send = (message, callback) => {
    sent.push(message);
    callback?.();
    if (message?.kind !== "sps.native.parent-ingress.request") return;
    queueMicrotask(() => {
      const details = inspectSpsNativeHostIdentity(identity);
      const issuerCertificate = new X509Certificate(identity.memberIssuer.certificatePem).raw.toString("base64url");
      child.emit("message", { v: 1, kind: "sps.native.parent-ingress.response", id: message.id, ok: true,
        result: { hostId: identity.hostId, serverSpkiSha256: details.serverSpkiSha256,
          issuerSpkiSha256: details.memberIssuerSpkiSha256, issuerCertificate } });
    });
  };
  const parentClient = createSpsNativeParentIngressClient(child, { isCurrent: () => child.connected && child.exitCode == null });
  const operations = [];
  const ingress = createSpsNativeHostIngress({ getIdentity: () => identity, assertCurrent() {},
    dispatch: (operation, request, options) => { operations.push({ operation, request }); return parentClient.dispatch(operation, request, options); } });
  t.after(async () => { await ingress.dispose(); parentClient.dispose(); });

  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const response = await post(bound.port, identity.server.certificatePem);
  assert.equal(response.statusCode, 200, JSON.stringify({ sent, operations }));
  assert.deepEqual(JSON.parse(response.body), { hostId: HOST_ID,
    serverSpkiSha256: inspectSpsNativeHostIdentity(identity).serverSpkiSha256,
    issuerSpkiSha256: inspectSpsNativeHostIdentity(identity).memberIssuerSpkiSha256,
    issuerCertificate: new X509Certificate(identity.memberIssuer.certificatePem).raw.toString("base64url") });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, "sps.native.parent-ingress.request");
  assert.deepEqual(Object.keys(sent[0].request).sort(), ["body", "transport"]);
  const wireText = JSON.stringify(sent);
  assert.equal(wireText.includes(identity.server.privateKeyPem), false);
  assert.equal(wireText.includes(identity.memberIssuer.privateKeyPem), false);
  assert.equal(wireText.includes("privateKeyPem"), false);

  await ingress.stop();
  await assert.rejects(post(bound.port, identity.server.certificatePem));
});
