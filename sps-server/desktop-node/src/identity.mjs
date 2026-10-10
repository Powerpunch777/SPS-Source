import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { buildHeartbeatMessage, buildSignedRequestMessage, canonicalJson } from "./protocol.mjs";

export function createNodeIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const transport = createNodeTransportIdentity();
  return {
    algorithm: "ed25519",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    ...transport,
  };
}

// The Ed25519 identity signs Node requests. Project-share credentials need a
// separate encryption key so the Hub can persist only a Node-sealed envelope.
export function createNodeTransportIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    transportAlgorithm: "rsa-oaep-sha256",
    transportPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    transportPrivateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function createSignedHeartbeat({ identity, nodeId, timestamp = new Date().toISOString(), nonce }) {
  if (!identity?.privateKeyPem) throw new Error("SPS Node identity does not contain a private key");
  const heartbeatNonce = nonce ?? randomBytes(32).toString("base64url");
  const message = buildHeartbeatMessage({
    nodeId,
    timestamp,
    nonce: heartbeatNonce,
  });
  return {
    timestamp,
    nonce: heartbeatNonce,
    signature: sign(null, Buffer.from(message, "utf8"), identity.privateKeyPem).toString("base64"),
  };
}

export function createSignedNodeRequest({
  identity,
  nodeId,
  method,
  path,
  payload = {},
  timestamp = new Date().toISOString(),
  nonce,
}) {
  if (!identity?.privateKeyPem) throw new Error("SPS Node identity does not contain a private key");
  const requestNonce = nonce ?? randomBytes(32).toString("base64url");
  const bodySha256 = createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
  const message = buildSignedRequestMessage({
    nodeId,
    method,
    path,
    timestamp,
    nonce: requestNonce,
    bodySha256,
  });
  return {
    ...payload,
    timestamp,
    nonce: requestNonce,
    signature: sign(null, Buffer.from(message, "utf8"), identity.privateKeyPem).toString("base64"),
  };
}
