import { createPublicKey, verify } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHeartbeatMessage,
  createNodeIdentity,
  startSpsDesktopAuth,
  pollSpsDesktopAuth,
  createSignedHeartbeat,
  listSpsCompanies,
  registerSpsNode,
  scanLocalCapabilities,
  sendSpsNodeHeartbeat,
} from "../src/index.mjs";

test("generates an Ed25519 identity and signs the shared heartbeat message", () => {
  const identity = createNodeIdentity();
  const heartbeat = createSignedHeartbeat({
    identity,
    nodeId: "00000000-0000-4000-8000-000000000001",
    timestamp: "2026-07-18T00:00:00.000Z",
    nonce: "A".repeat(32),
  });
  const verified = verify(
    null,
    Buffer.from(buildHeartbeatMessage({
      nodeId: "00000000-0000-4000-8000-000000000001",
      timestamp: heartbeat.timestamp,
      nonce: heartbeat.nonce,
    }), "utf8"),
    createPublicKey(identity.publicKeyPem),
    Buffer.from(heartbeat.signature, "base64"),
  );
  assert.equal(verified, true);
});

test("publishes only capability names and versions, not executable paths", () => {
  const capabilities = scanLocalCapabilities({
    findCommand: (command) => command === "codex" || command === "ollama",
    readVersion: (command) => `${command} 1.2.3`,
  });
  assert.deepEqual(capabilities, [
    { kind: "codex_cli", label: "Codex CLI", version: "codex 1.2.3" },
    { kind: "ollama", label: "Ollama", version: "ollama 1.2.3" },
  ]);
  assert.equal(JSON.stringify(capabilities).includes("C:\\\\"), false);
});

test("uses the Hub API for registration and signed heartbeats", async () => {
  const identity = createNodeIdentity();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: "node-1", status: "pending" }), { status: 201 });
  };
  await registerSpsNode({
    fetchImpl,
    hubUrl: "https://sps.example.test/",
    companyId: "company-1",
    identity,
    displayName: "Friend PC",
    platform: "Windows",
    appVersion: "0.1.0",
    capabilities: [],
  });
  await sendSpsNodeHeartbeat({
    fetchImpl,
    hubUrl: "https://sps.example.test/",
    nodeId: "node-1",
    identity,
    timestamp: "2026-07-18T00:00:00.000Z",
    nonce: "B".repeat(32),
  });
  assert.equal(requests[0].url, "https://sps.example.test/api/companies/company-1/sps-nodes");
  assert.equal(requests[1].url, "https://sps.example.test/api/sps-nodes/node-1/heartbeat");
  assert.equal(JSON.parse(requests[0].options.body).privateKeyPem, undefined);
  assert.equal(JSON.parse(requests[1].options.body).signature.length > 0, true);
});

test("uses the existing Hub browser-approval challenge for Desktop sign-in", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({
      id: "challenge-1",
      token: "challenge-secret",
      boardApiToken: "board-token",
      approvalUrl: "https://sps.example.test/cli-auth/challenge-1?token=challenge-secret",
      status: "pending",
    }), { status: 201 });
  };
  const auth = await startSpsDesktopAuth({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    companyId: "company-1",
  });
  assert.equal(auth.boardApiToken, "board-token");
  await pollSpsDesktopAuth({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    challengeId: auth.id,
    challengeToken: auth.token,
  });
  assert.equal(requests[0].url, "https://sps.example.test/api/cli-auth/challenges");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    command: "SPS Desktop Node connection",
    clientName: "SPS Desktop",
    requestedAccess: "board",
    requestedCompanyId: "company-1",
  });
  assert.equal(requests[1].url, "https://sps.example.test/api/cli-auth/challenges/challenge-1?token=challenge-secret");
  assert.equal(requests[1].options.method, "GET");
});

test("can authenticate before choosing a company and then list allowed companies", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(url.endsWith("/companies")
      ? [{ id: "company-1", name: "Acme Robotics" }]
      : { id: "challenge-1", token: "challenge-secret", boardApiToken: "board-token" }), {
      status: url.endsWith("/companies") ? 200 : 201,
    });
  };
  await startSpsDesktopAuth({ fetchImpl, hubUrl: "https://sps.example.test" });
  const companies = await listSpsCompanies({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    accessToken: "board-token",
  });
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    command: "SPS Desktop Node connection",
    clientName: "SPS Desktop",
    requestedAccess: "board",
  });
  assert.equal(requests[1].url, "https://sps.example.test/api/companies");
  assert.equal(requests[1].options.headers.authorization, "Bearer board-token");
  assert.deepEqual(companies, [{ id: "company-1", name: "Acme Robotics" }]);
});
