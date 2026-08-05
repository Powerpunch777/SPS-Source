import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createServeCaptureRecorder,
  sanitizedServeObservation,
  startTailscaleServeObservationServer,
} from "../scripts/tailscale-serve-observation-server.mjs";

test("sanitizes a Serve identity without retaining user or host data", () => {
  const observation = sanitizedServeObservation({
    hostname: "private.tailnet.ts.net",
    source: "tailscale-serve",
    peer: "loopback",
    identity: { userLogin: "private@example.com" },
  });
  assert.deepEqual(observation, {
    accepted: true,
    parsedIdentity: {
      source: "tailscale-serve",
      peer: "loopback",
      identity: { present: true },
    },
  });
  assert.doesNotMatch(JSON.stringify(observation), /private|tailnet|example/);
});

test("keeps a direct request rejected and anonymous", () => {
  assert.deepEqual(sanitizedServeObservation({
    hostname: "private.tailnet.ts.net",
    source: "direct",
    peer: "loopback",
    identity: null,
  }), {
    accepted: false,
    parsedIdentity: { source: "direct", peer: "loopback", identity: null },
  });
});

test("starts only with the exact module bytes and reports an actual 403", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-serve-observation-"));
  const modulePath = path.join(root, "request-hostname.mjs");
  const source = `export function requestHostIdentity(req) { return { hostname: req.header("host"), source: "direct", peer: "loopback", identity: null }; }\n`;
  await writeFile(modulePath, source, "utf8");
  const expectedModuleSha256 = createHash("sha256").update(source).digest("hex");
  const listener = await startTailscaleServeObservationServer({
    modulePath,
    expectedModuleSha256,
    port: 0,
    servePath: "/__sps-observation-test",
  });
  try {
    const response = await fetch(`http://127.0.0.1:${listener.port}/__sps-observation-test`, {
      headers: { host: "private.tailnet.ts.net" },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      accepted: false,
      parsedIdentity: { source: "direct", peer: "loopback", identity: null },
    });
    await assert.rejects(() => startTailscaleServeObservationServer({
      modulePath,
      expectedModuleSha256: "0".repeat(64),
      port: 0,
      servePath: "/__sps-observation-test",
    }), /does not match the release manifest/);
  } finally {
    await new Promise((resolve, reject) => listener.server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("writes the private capture only after observing both real outcomes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-serve-capture-"));
  const outputPath = path.join(root, "capture.json");
  try {
    const record = createServeCaptureRecorder({
      outputPath,
      releaseNonce: "1".repeat(64),
      servePath: "/__sps-observation-test",
      backendPort: 31311,
      hostTailscaleVersion: { short: "1.98.8" },
      memberTailscaleVersion: { short: "1.98.4" },
      runtimeArchiveSha256: "2".repeat(64),
      requestHostnameModuleSha256: "3".repeat(64),
      completedAt: () => "2026-08-05T00:00:00.000Z",
    });
    assert.equal(await record(403, sanitizedServeObservation({ source: "direct", peer: "loopback", identity: null }), "direct"), null);
    await assert.rejects(readFile(outputPath), /ENOENT/);
    await record(200, sanitizedServeObservation({ source: "tailscale-serve", peer: "loopback", identity: { userLogin: "private@example.com" } }), "member");
    const capture = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(capture.releaseNonce, "1".repeat(64));
    assert.equal(capture.memberResponse.httpStatus, 200);
    assert.equal(capture.directSpoofResponse.httpStatus, 403);
    assert.equal(Buffer.from(capture.memberResponse.responseBodyBase64, "base64").toString("utf8"), "member");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
