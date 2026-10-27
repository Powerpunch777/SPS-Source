import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import { createSignedSpsNativeNodeRegistration, parseSpsNativeNodeResponse,
  requireSpsNativeNodeRequest, NATIVE_NODE_MAX_REQUEST, NATIVE_NODE_MAX_RESPONSE } from "../src/native-node-protocol.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const NODE = "44444444-4444-4444-8444-444444444444";
const RESOURCE = "55555555-5555-4555-8555-555555555555";
const SIGNED = { timestamp: "2026-10-27T04:00:00.000Z", nonce: "A".repeat(43), signature: "B".repeat(86) };
const request = (operation, nodeId = NODE, resourceId = null, payload = SIGNED) => ({ operation, nodeId, resourceId, payload });

test("validates the exact canonical envelope and operation-specific identifiers", () => {
  const result = requireSpsNativeNodeRequest(request("command-event", NODE, RESOURCE, {
    ...SIGNED, sequence: 1, stream: "stdout", body: "output",
  }));
  assert.deepEqual(result, { operation: "command-event", nodeId: NODE, resourceId: RESOURCE,
    payload: { timestamp: SIGNED.timestamp, nonce: SIGNED.nonce, signature: SIGNED.signature,
      sequence: 1, stream: "stdout", body: "output" } });
  assert.deepEqual(requireSpsNativeNodeRequest({ operation: "register", nodeId: null, resourceId: null,
    payload: { registration: { displayName: "Node", publicKey: "public" }, proof: SIGNED } }).payload.registration,
  { displayName: "Node", publicKey: "public" });
  for (const invalid of [
    { ...request("register"), nodeId: NODE },
    { ...request("heartbeat"), resourceId: RESOURCE },
    { ...request("source-route"), resourceId: null },
    { ...request("claim-command"), payload: { ...SIGNED, arbitrary: true } },
    { ...request("command-event"), extra: true },
    { ...request("heartbeat"), operation: "http-proxy" },
    { ...request("heartbeat"), nodeId: "bad" },
    { ...request("heartbeat"), payload: { timestamp: SIGNED.timestamp, nonce: "short", signature: SIGNED.signature } },
  ]) assert.throws(() => requireSpsNativeNodeRequest(invalid), { code: "native_node_protocol_invalid" });
  const reordered = { nodeId: NODE, operation: "heartbeat", resourceId: null, payload: SIGNED };
  assert.throws(() => requireSpsNativeNodeRequest(reordered), { code: "native_node_protocol_invalid" });
});

test("snapshots payloads without evaluating getters and rejects cycles and oversized bodies", () => {
  let touched = false;
  const payload = { ...SIGNED };
  Object.defineProperty(payload, "secret", { enumerable: true, get() { touched = true; return "x"; } });
  assert.throws(() => requireSpsNativeNodeRequest(request("heartbeat", NODE, null, payload)),
    { code: "native_node_protocol_invalid" });
  assert.equal(touched, false);
  const cyclic = { ...SIGNED }; cyclic.self = cyclic;
  assert.throws(() => requireSpsNativeNodeRequest(request("availability", NODE, null, cyclic)),
    { code: "native_node_protocol_invalid" });
  const tooLarge = { ...SIGNED, blob: "x".repeat(NATIVE_NODE_MAX_REQUEST) };
  assert.throws(() => requireSpsNativeNodeRequest(request("availability", NODE, null, tooLarge)),
    { code: "native_node_protocol_invalid" });
});

test("signs registration proof over canonical registration and actual Native authority tuple", () => {
  const pair = generateKeyPairSync("ed25519");
  const identity = { privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
  const registration = { publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    displayName: "Desk Node", platform: "win32", capabilities: [] };
  const signed = createSignedSpsNativeNodeRegistration({ identity, hostId: HOST, workspaceId: WORKSPACE,
    deviceId: DEVICE, registration, timestamp: "2026-10-27T04:00:00.000Z", nonce: "C".repeat(43) });
  const canonicalRegistration = JSON.stringify({ capabilities: [], displayName: "Desk Node",
    platform: "win32", publicKey: registration.publicKey });
  const digest = createHash("sha256").update(canonicalRegistration).digest("hex");
  const message = `SPS-NATIVE-NODE-REGISTER-V1\n${HOST}\n${WORKSPACE}\n${DEVICE}\n${signed.proof.timestamp}\n${signed.proof.nonce}\n${digest}`;
  assert.equal(verify(null, Buffer.from(message), createPublicKey(identity.privateKeyPem), Buffer.from(signed.proof.signature, "base64")), true);
  assert.equal(createPrivateKey(identity.privateKeyPem).asymmetricKeyType, "ed25519");
  assert.equal(Object.hasOwn(signed, "privateKeyPem"), false);
  assert.throws(() => createSignedSpsNativeNodeRegistration({ identity, hostId: HOST, workspaceId: WORKSPACE,
    deviceId: DEVICE, registration, timestamp: "bad" }), { code: "native_node_protocol_invalid" });
});

test("parses only bounded canonical success envelopes with an exact data field", () => {
  const body = Buffer.from('{"data":null}');
  assert.deepEqual(parseSpsNativeNodeResponse({ statusCode: 200,
    rawHeaders: ["content-type", "application/json; charset=utf-8", "cache-control", "no-store", "content-length", String(body.length)], body }), { data: null });
  for (const envelope of [
    { statusCode: 201, rawHeaders: [], body },
    { statusCode: 200, rawHeaders: ["content-type", "text/html", "cache-control", "no-store", "content-length", String(body.length)], body },
    { statusCode: 200, rawHeaders: ["content-type", "application/json", "cache-control", "no-store", "content-length", String(body.length), "set-cookie", "secret"], body },
    { statusCode: 200, rawHeaders: ["content-type", "application/json", "cache-control", "no-store", "content-length", String(body.length)], body: Buffer.from('{"data":null,"extra":true}') },
  ]) assert.throws(() => parseSpsNativeNodeResponse(envelope), { code: "native_node_protocol_invalid" });
  assert.equal(NATIVE_NODE_MAX_REQUEST, 512 * 1024);
  assert.equal(NATIVE_NODE_MAX_RESPONSE, 1024 * 1024);
});
