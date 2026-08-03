import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deviceId = "sps-miniflare-device-1234";

function hash(value) {
  return createHash("sha256").update(value).digest("base64url");
}

async function bounded(promise, label, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function createIdentityRuntime() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const mf = new Miniflare({
    modules: true,
    modulesRoot: root,
    scriptPath: path.join(root, "test", "identity-worker-entry.mjs"),
    compatibilityDate: "2026-07-24",
    d1Databases: { DB: "sps-identity-test" },
    bindings: {
      GOOGLE_CLIENT_ID: "google-client",
      SPS_IDENTITY_ISSUER: "https://auth.example",
      SPS_IDENTITY_AUDIENCE: "sps-core",
      SPS_IDENTITY_KEY_ID: "identity-test",
      SPS_IDENTITY_PRIVATE_KEY_PEM: privateKey.export({ type: "pkcs8", format: "pem" }),
    },
  });
  await bounded(mf.ready, "Miniflare startup");
  const db = await bounded(mf.getD1Database("DB"), "D1 binding");
  for (const migration of [
    "0001_identity.sql",
    "0002_atomic_consumption.sql",
    "0003_refresh_reuse_protection.sql",
  ]) {
    const statements = (await fs.readFile(path.join(root, "migrations", migration), "utf8"))
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => db.prepare(statement));
    await bounded(
      db.batch(statements),
      `D1 migration ${migration}`,
    );
  }
  return { mf, db };
}

function refreshRequest(refreshToken, idempotencyKey) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      device_id: deviceId,
      idempotency_key: idempotencyKey,
    }),
  };
}

function tokenRequest(code, verifier, idempotencyKey) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      device_id: deviceId,
      idempotency_key: idempotencyKey,
    }),
  };
}

test("D1 atomically exchanges one authorization code and binds retries to one nonce", async () => {
  const { mf, db } = await createIdentityRuntime();
  try {
    const code = "miniflare-authorization-code";
    const verifier = "miniflare-pkce-verifier-1234567890";
    const now = Date.now();
    await db.batch([
      db.prepare(
        "INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("miniflare-subject", "person@example.com", "Person", null, now, now),
      db.prepare(
        "INSERT INTO authorization_codes (code_hash, subject, email, name, picture, device_id, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        hash(code),
        "miniflare-subject",
        "person@example.com",
        "Person",
        null,
        deviceId,
        hash(verifier),
        now + 60_000,
      ),
    ]);

    const idempotencyKey = "miniflare-token-request-key-1234567890";
    const responses = await bounded(Promise.all([
      mf.dispatchFetch("https://auth.example/v1/desktop/token", tokenRequest(code, verifier, idempotencyKey)),
      mf.dispatchFetch("https://auth.example/v1/desktop/token", tokenRequest(code, verifier, idempotencyKey)),
    ]), "concurrent D1 authorization exchange");
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(bodies[0], bodies[1]);

    const source = await db.prepare(
      "SELECT consumption_id FROM authorization_codes WHERE code_hash = ?",
    ).bind(hash(code)).first();
    assert.ok(source?.consumption_id);

    const active = await db.prepare(
      "SELECT token_hash, family_id FROM refresh_tokens WHERE consumed_at IS NULL",
    ).all();
    assert.equal(active.results.length, 1);
    assert.equal(active.results[0].token_hash, hash(bodies[0].refresh_token));
    assert.ok(active.results[0].family_id);

    const replay = await db.prepare(
      "SELECT response_ciphertext, idempotency_key_hash, consumption_id FROM identity_replay_results WHERE replay_key = ?",
    ).bind(`authorization-code:${hash(code)}`).first();
    assert.equal(replay?.consumption_id, source.consumption_id);
    assert.ok(replay?.idempotency_key_hash);
    assert.doesNotMatch(replay.response_ciphertext, new RegExp(bodies[0].refresh_token));

    const misuse = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/token",
      tokenRequest(code, verifier, "miniflare-other-token-request-0987654321"),
    );
    assert.equal(misuse.status, 401);
    assert.match((await misuse.json()).error, /already used/i);
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});

test("D1 atomically rotates one token, encrypts replay data, and revokes reuse", async () => {
  const { mf, db } = await createIdentityRuntime();
  try {
    const refreshToken = "miniflare-refresh-token";
    const familyId = "miniflare-family";
    const now = Date.now();
    await db.batch([
      db.prepare(
        "INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("miniflare-subject", "person@example.com", "Person", null, now, now),
      db.prepare(
        "INSERT INTO refresh_tokens (token_hash, subject, device_id, expires_at, created_at, family_id) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(hash(refreshToken), "miniflare-subject", deviceId, now + 60_000, now, familyId),
    ]);

    const idempotencyKey = "miniflare-idempotency-key-1234567890";
    const responses = await bounded(Promise.all([
      mf.dispatchFetch("https://auth.example/v1/desktop/refresh", refreshRequest(refreshToken, idempotencyKey)),
      mf.dispatchFetch("https://auth.example/v1/desktop/refresh", refreshRequest(refreshToken, idempotencyKey)),
    ]), "concurrent D1 refresh");
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(bodies[0], bodies[1]);

    const active = await db.prepare(
      "SELECT token_hash, family_id FROM refresh_tokens WHERE family_id = ? AND consumed_at IS NULL",
    ).bind(familyId).all();
    assert.equal(active.results.length, 1);
    assert.equal(active.results[0].token_hash, hash(bodies[0].refresh_token));

    const replay = await db.prepare(
      "SELECT response_ciphertext, idempotency_key_hash, consumption_id FROM identity_replay_results WHERE family_id = ?",
    ).bind(familyId).first();
    assert.ok(replay?.consumption_id);
    assert.ok(replay?.idempotency_key_hash);
    assert.doesNotMatch(replay.response_ciphertext, new RegExp(bodies[0].refresh_token));

    const misuse = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/refresh",
      refreshRequest(refreshToken, "miniflare-second-request-key-0987654321"),
    );
    assert.equal(misuse.status, 401);
    assert.match((await misuse.json()).error, /reuse was detected/i);

    const remaining = await db.prepare("SELECT token_hash FROM refresh_tokens WHERE family_id = ?").bind(familyId).all();
    assert.equal(remaining.results.length, 0);
    const replayAfterRevoke = await db.prepare(
      "SELECT replay_key FROM identity_replay_results WHERE family_id = ?",
    ).bind(familyId).all();
    assert.equal(replayAfterRevoke.results.length, 0);
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});
