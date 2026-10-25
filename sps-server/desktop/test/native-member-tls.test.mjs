import "reflect-metadata";
import assert from "node:assert/strict";
import { createPrivateKey, randomBytes, webcrypto, X509Certificate } from "node:crypto";
import { connect as connectTls, createServer } from "node:tls";
import test from "node:test";
import {
  AuthorityKeyIdentifierExtension,
  BasicConstraintsExtension,
  ExtendedKeyUsage,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  SubjectKeyIdentifierExtension,
  X509Certificate as ParsedCertificate,
  X509CertificateGenerator,
} from "@peculiar/x509";
import {
  createSpsNativeMemberKeyRequest,
  issueSpsNativeMemberCertificate,
  publicSpsNativeMemberEnrollmentRequest,
} from "../src/native-member-certificates.mjs";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_HOST_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_KEY_ID = "33333333-3333-4333-8333-333333333333";
const LISTEN_TIMEOUT_MS = 5_000;
const HANDSHAKE_TIMEOUT_MS = 3_000;
const SERVER_HANDSHAKE_TIMEOUT_MS = 4_000;
const TEARDOWN_TIMEOUT_MS = 2_000;
const SIGNING_ALGORITHM = Object.freeze({ name: "ECDSA", hash: "SHA-256" });
const KEY_ALGORITHM = Object.freeze({ name: "ECDSA", namedCurve: "P-256" });

function encodePem(bytes, label) {
  const lines = Buffer.from(bytes).toString("base64").match(/.{1,64}/g);
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

async function createTrustedServerAuthLeaf(hostIdentity, notBefore, notAfter) {
  const issuerPem = hostIdentity.memberIssuer.certificatePem;
  const issuer = new ParsedCertificate(issuerPem);
  const issuerPrivateDer = Buffer.from(createPrivateKey(hostIdentity.memberIssuer.privateKeyPem)
    .export({ type: "pkcs8", format: "der" }));
  let signingKey;
  try {
    signingKey = await webcrypto.subtle.importKey("pkcs8", issuerPrivateDer, KEY_ALGORITHM, false, ["sign"]);
  } finally {
    issuerPrivateDer.fill(0);
  }

  const keys = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ["sign", "verify"]);
  const serial = randomBytes(20);
  serial[0] = (serial[0] & 0x7f) | 1;
  const certificate = await X509CertificateGenerator.create({
    subject: "CN=TLS test serverAuth-only leaf",
    issuer: issuer.subjectName,
    publicKey: keys.publicKey,
    signingKey,
    signingAlgorithm: SIGNING_ALGORITHM,
    serialNumber: serial.toString("hex"),
    notBefore: new Date(notBefore),
    notAfter: new Date(notAfter),
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth], true),
      await SubjectKeyIdentifierExtension.create(keys.publicKey, false, webcrypto),
      await AuthorityKeyIdentifierExtension.create(issuer.publicKey, false, webcrypto),
    ],
  }, webcrypto);
  const privateDer = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", keys.privateKey));
  try {
    return {
      certificatePem: new X509Certificate(Buffer.from(certificate.rawData)).toString(),
      privateKeyPem: encodePem(privateDer, "PRIVATE KEY"),
    };
  } finally {
    privateDer.fill(0);
  }
}

function ownSocket(socket, sockets) {
  sockets.add(socket);
  socket.on("error", () => {});
  socket.once("close", () => sockets.delete(socket));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(reject, new Error("TLS test listener timed out")), LISTEN_TIMEOUT_MS);
    const finish = (complete, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.removeListener("listening", onListening);
      server.removeListener("error", onError);
      complete(value);
    };
    const onListening = () => finish(resolve);
    const onError = error => finish(reject, error);
    server.once("listening", onListening);
    server.once("error", onError);
    try {
      server.listen({ host: "127.0.0.1", port: 0, exclusive: true });
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function closeOwnedServer(server, sockets) {
  for (const socket of sockets) socket.destroy();
  if (!server.listening) return;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      for (const socket of sockets) socket.destroy();
      reject(new Error("TLS test listener teardown timed out"));
    }, TEARDOWN_TIMEOUT_MS);
    server.close(error => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    });
  });
}

function observeServerHandshake(server) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(reject, new Error("TLS server handshake observation timed out")), SERVER_HANDSHAKE_TIMEOUT_MS);
    const finish = (complete, value) => {
      clearTimeout(timer);
      server.removeListener("secureConnection", onSecureConnection);
      server.removeListener("tlsClientError", onTlsClientError);
      complete(value);
    };
    const onSecureConnection = socket => finish(resolve, { accepted: true, socket });
    const onTlsClientError = error => finish(resolve, { accepted: false, error });
    server.once("secureConnection", onSecureConnection);
    server.once("tlsClientError", onTlsClientError);
  });
}

function connectAndHandshake(options, sockets) {
  return new Promise((resolve, reject) => {
    let socket;
    let settled = false;
    const timer = setTimeout(() => {
      socket?.destroy();
      finish(reject, new Error("TLS client handshake timed out"));
    }, HANDSHAKE_TIMEOUT_MS);
    const finish = (complete, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      complete(value);
    };

    try {
      socket = connectTls({
        ...options,
        minVersion: "TLSv1.3",
        maxVersion: "TLSv1.3",
      });
      ownSocket(socket, sockets);
      socket.once("error", error => {
        finish(reject, error);
        socket.destroy();
      });
      socket.once("secureConnect", () => finish(resolve, {
        socket,
        protocol: socket.getProtocol(),
        serverCertificate: socket.getPeerCertificate().raw,
        serverCertificateVerified: socket.authorized,
      }));
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function runServerHandshake(server, options, sockets) {
  const observed = observeServerHandshake(server);
  let client;
  let clientError;
  try {
    client = await connectAndHandshake(options, sockets);
  } catch (error) {
    clientError = error;
  }
  const serverResult = await observed;
  return { client, clientError, serverResult };
}

test("uses a member certificate for a bounded loopback TLS 1.3 client-key-possession check", async t => {
  const notBefore = Math.floor((Date.now() - 60_000) / 1_000) * 1_000;
  const notAfter = notBefore + 3_600_000;
  const hostOptions = {
    hostnames: ["127.0.0.1"], notBefore, notAfter, issuerNotAfter: notBefore + 7_200_000,
  };
  const hostIdentity = await createSpsNativeHostIdentity({ ...hostOptions, hostId: HOST_ID });
  const otherHostIdentity = await createSpsNativeHostIdentity({ ...hostOptions, hostId: OTHER_HOST_ID });
  const wrongEku = await createTrustedServerAuthLeaf(hostIdentity, notBefore, notAfter);
  const keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST_ID, deviceKeyId: DEVICE_KEY_ID });
  const enrollmentRequest = await publicSpsNativeMemberEnrollmentRequest(keyRequest);
  const issuedCertificate = await issueSpsNativeMemberCertificate({
    hostIdentity,
    request: enrollmentRequest,
    notBefore,
    notAfter: notBefore + 1_800_000,
    now: Date.now(),
  });

  const clientCertificate = new X509Certificate(issuedCertificate.certificatePem);
  const memberIssuerCertificate = new X509Certificate(issuedCertificate.issuerCertificatePem);
  const wrongPurposeCertificate = new X509Certificate(otherHostIdentity.server.certificatePem);
  assert.equal(clientCertificate.verify(memberIssuerCertificate.publicKey), true);
  assert.deepEqual(clientCertificate.keyUsage, ["1.3.6.1.5.5.7.3.2"]);
  assert.deepEqual(wrongPurposeCertificate.keyUsage, ["1.3.6.1.5.5.7.3.1"]);
  const trustedWrongEkuCertificate = new X509Certificate(wrongEku.certificatePem);
  assert.equal(trustedWrongEkuCertificate.issuer, memberIssuerCertificate.subject);
  assert.equal(trustedWrongEkuCertificate.verify(memberIssuerCertificate.publicKey), true);
  assert.deepEqual(trustedWrongEkuCertificate.keyUsage, ["1.3.6.1.5.5.7.3.1"]);

  const sockets = new Set();
  const stats = { acceptedClientCertificates: [], applicationBytes: 0 };
  const server = createServer({
    key: hostIdentity.server.privateKeyPem,
    cert: hostIdentity.server.certificatePem,
    ca: hostIdentity.memberIssuer.certificatePem,
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
  });
  server.on("connection", socket => ownSocket(socket, sockets));
  server.on("secureConnection", socket => {
    stats.acceptedClientCertificates.push(socket.getPeerCertificate().raw.toString("hex"));
    socket.on("data", bytes => { stats.applicationBytes += bytes.length; });
  });
  server.on("tlsClientError", () => {});
  t.after(() => closeOwnedServer(server, sockets));
  await listen(server);

  // The Host leaf is trusted only by this individual TLS client configuration.
  const clientOptions = {
    host: "127.0.0.1",
    port: server.address().port,
    ca: hostIdentity.server.certificatePem,
  };
  const good = await runServerHandshake(server, {
    ...clientOptions,
    cert: issuedCertificate.certificatePem,
    key: keyRequest.privateKeyPem,
  }, sockets);
  assert.equal(good.clientError, undefined);
  assert.equal(good.serverResult.accepted, true);
  assert.equal(good.serverResult.socket.authorized, true);
  assert.equal(good.client.protocol, "TLSv1.3");
  assert.equal(good.client.serverCertificateVerified, true);
  assert.deepEqual(good.client.serverCertificate, new X509Certificate(hostIdentity.server.certificatePem).raw);
  good.client.socket.destroy();

  const noCertificate = await runServerHandshake(server, clientOptions, sockets);
  noCertificate.client?.socket.destroy();
  assert.equal(noCertificate.serverResult.accepted, false);

  const wrongIssuer = await runServerHandshake(server, {
    ...clientOptions,
    cert: otherHostIdentity.server.certificatePem,
    key: otherHostIdentity.server.privateKeyPem,
  }, sockets);
  wrongIssuer.client?.socket.destroy();
  assert.equal(wrongIssuer.serverResult.accepted, false);

  const wrongEkuHandshake = await runServerHandshake(server, {
    ...clientOptions,
    cert: wrongEku.certificatePem,
    key: wrongEku.privateKeyPem,
  }, sockets);
  wrongEkuHandshake.client?.socket.destroy();
  assert.equal(wrongEkuHandshake.serverResult.accepted, false);

  await assert.rejects(connectAndHandshake({
    ...clientOptions,
    cert: issuedCertificate.certificatePem,
    key: otherHostIdentity.server.privateKeyPem,
  }, sockets));

  assert.deepEqual(stats.acceptedClientCertificates, [clientCertificate.raw.toString("hex")]);
  assert.equal(stats.applicationBytes, 0);
});
