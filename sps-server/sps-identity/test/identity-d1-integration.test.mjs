import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { runIdentityStagingSmoke } from "../scripts/smoke-staging.mjs";

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

async function applyMigration(db, migration) {
  const statements = (await fs.readFile(path.join(root, "migrations", migration), "utf8"))
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => db.prepare(statement));
  await bounded(db.batch(statements), `D1 migration ${migration}`);
}

async function createIdentityRuntime({ includeLegacyBackfill = true } = {}) {
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
      SPS_IDENTITY_REPLAY_KEY_VERSION: "v1",
      SPS_IDENTITY_REPLAY_KEY_V1: "identity-miniflare-replay-key-material-32-bytes",
      SPS_IDENTITY_PROTOCOL_VERSION: "2",
      SPS_IDENTITY_ROLLBACK_FLOOR: "bridge-v2",
      SPS_IDENTITY_ROLLOUT_PHASE: "bridge",
      SPS_IDENTITY_SOURCE_REVISION: "test-source-revision",
      SPS_IDENTITY_RELEASE_ID: "identity-miniflare-release",
      CF_VERSION_METADATA: { id: "identity-miniflare-version", tag: "test", timestamp: new Date().toISOString() },
    },
  });
  await bounded(mf.ready, "Miniflare startup");
  const db = await bounded(mf.getD1Database("DB"), "D1 binding");
  const migrations = [
    "0001_identity.sql",
    "0002_atomic_consumption.sql",
    "0003_refresh_reuse_protection.sql",
  ];
  if (includeLegacyBackfill) migrations.push("0004_legacy_refresh_family_roots.sql");
  migrations.push("0005_oauth_evidence_receipts.sql");
  migrations.push("0006_oauth_evidence_revoke_replay.sql");
  for (const migration of migrations) await applyMigration(db, migration);
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

function revokeRequest(refreshToken, idempotencyKey) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken, idempotency_key: idempotencyKey }),
  };
}

test("D1 migration 0003 preserves the previous replay table for Worker rollback", async () => {
  const { mf, db } = await createIdentityRuntime();
  try {
    const legacy = await db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'identity_replay_results'",
    ).first();
    const v2 = await db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'identity_replay_results_v2'",
    ).first();
    assert.match(legacy?.sql ?? "", /response_json/);
    assert.match(v2?.sql ?? "", /response_ciphertext/);
    assert.match(v2?.sql ?? "", /idempotency_key_hash/);
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});

test("D1 backfills a safe family root and preserves an active legacy session", async () => {
  const { mf, db } = await createIdentityRuntime({ includeLegacyBackfill: false });
  try {
    const refreshToken = "legacy-refresh-token-to-backfill";
    const now = Date.now();
    await db.batch([
      db.prepare(
        "INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("legacy-subject", "legacy@example.com", "Legacy", null, now, now),
      db.prepare(
        "INSERT INTO refresh_tokens (token_hash, subject, device_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(hash(refreshToken), "legacy-subject", deviceId, now + 60_000, now),
    ]);

    await applyMigration(db, "0004_legacy_refresh_family_roots.sql");
    const backfilled = await db.prepare("SELECT family_id FROM refresh_tokens WHERE token_hash = ?")
      .bind(hash(refreshToken)).first();
    assert.equal(backfilled?.family_id, `legacy-root:${hash(refreshToken)}`);

    const response = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/refresh",
      refreshRequest(refreshToken, "legacy-refresh-request-key-1234567890"),
    );
    assert.equal(response.status, 200);
    const rotated = await response.json();
    assert.ok(rotated.refresh_token);
    const active = await db.prepare(
      "SELECT family_id FROM refresh_tokens WHERE token_hash = ? AND consumed_at IS NULL",
    ).bind(hash(rotated.refresh_token)).first();
    assert.equal(active?.family_id, `legacy-root:${hash(refreshToken)}`);
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});

test("D1 adopts an unbackfilled active legacy token without logging the user out", async () => {
  const { mf, db } = await createIdentityRuntime();
  try {
    const refreshToken = "legacy-refresh-token-without-family";
    const now = Date.now();
    await db.batch([
      db.prepare(
        "INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("legacy-subject", "legacy@example.com", "Legacy", null, now, now),
      db.prepare(
        "INSERT INTO refresh_tokens (token_hash, subject, device_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(hash(refreshToken), "legacy-subject", deviceId, now + 60_000, now),
    ]);

    const response = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/refresh",
      refreshRequest(refreshToken, "legacy-refresh-request-key-1234567890"),
    );
    assert.equal(response.status, 200);
    const rotated = await response.json();
    const active = await db.prepare(
      "SELECT family_id FROM refresh_tokens WHERE token_hash = ? AND consumed_at IS NULL",
    ).bind(hash(rotated.refresh_token)).first();
    assert.ok(active?.family_id);
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});

test("D1 rejects but does not delete an already-consumed legacy token with unknown lineage", async () => {
  const { mf, db } = await createIdentityRuntime();
  try {
    const refreshToken = "consumed-legacy-refresh-token";
    const now = Date.now();
    await db.batch([
      db.prepare(
        "INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("legacy-consumed-subject", "legacy-consumed@example.com", "Legacy", null, now, now),
      db.prepare(
        "INSERT INTO refresh_tokens (token_hash, subject, device_id, expires_at, created_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(hash(refreshToken), "legacy-consumed-subject", deviceId, now + 60_000, now, now - 1_000),
    ]);

    const response = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/refresh",
      refreshRequest(refreshToken, "consumed-legacy-request-key-1234567890"),
    );
    assert.equal(response.status, 401);
    const failure = await response.json();
    assert.equal(failure.error_code, "legacy_refresh_token");
    const remaining = await db.prepare("SELECT token_hash FROM refresh_tokens WHERE token_hash = ?")
      .bind(hash(refreshToken)).first();
    assert.equal(remaining?.token_hash, hash(refreshToken));
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});

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
      "SELECT response_ciphertext, idempotency_key_hash, consumption_id FROM identity_replay_results_v2 WHERE replay_key = ?",
    ).bind(`authorization-code:${hash(code)}`).first();
    assert.equal(replay?.consumption_id, source.consumption_id);
    assert.ok(replay?.idempotency_key_hash);
    assert.match(replay.response_ciphertext, /^v1\./);
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
      "SELECT response_ciphertext, idempotency_key_hash, consumption_id FROM identity_replay_results_v2 WHERE family_id = ?",
    ).bind(familyId).first();
    assert.ok(replay?.consumption_id);
    assert.ok(replay?.idempotency_key_hash);
    assert.match(replay.response_ciphertext, /^v1\./);
    assert.doesNotMatch(replay.response_ciphertext, new RegExp(bodies[0].refresh_token));

    const misuse = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/refresh",
      refreshRequest(refreshToken, "miniflare-second-request-key-0987654321"),
    );
    assert.equal(misuse.status, 401);
    const misuseBody = await misuse.json();
    assert.match(misuseBody.error, /reuse was detected/i);
    assert.equal(misuseBody.error_code, "refresh_token_reused");

    const remaining = await db.prepare("SELECT token_hash FROM refresh_tokens WHERE family_id = ?").bind(familyId).all();
    assert.equal(remaining.results.length, 0);
    const replayAfterRevoke = await db.prepare(
      "SELECT replay_key FROM identity_replay_results_v2 WHERE family_id = ?",
    ).bind(familyId).all();
    assert.equal(replayAfterRevoke.results.length, 0);
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});

test("D1 atomically revokes and replays one OAuth evidence receipt", async () => {
  const { mf, db } = await createIdentityRuntime();
  try {
    const code = "miniflare-oauth-evidence-code";
    const verifier = "miniflare-evidence-verifier-1234567890";
    const now = Date.now();
    await db.batch([
      db.prepare(
        "INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("evidence-subject", "evidence@example.com", "Evidence", null, now, now),
      db.prepare(
        "INSERT INTO authorization_codes (code_hash, subject, email, name, picture, device_id, code_challenge, expires_at, google_verified_at, oauth_evidence_nonce, oauth_evidence_deployment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        hash(code), "evidence-subject", "evidence@example.com", "Evidence", null, deviceId,
        hash(verifier), now + 60_000, now, "n".repeat(43), "staging-deployment",
      ),
    ]);
    const token = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/token",
      tokenRequest(code, verifier, "miniflare-evidence-token-key-1234567890"),
    );
    assert.equal(token.status, 200);
    const pair = await token.json();
    const idempotencyKey = "miniflare-evidence-revoke-key-1234567890";
    const first = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/revoke",
      revokeRequest(pair.refresh_token, idempotencyKey),
    );
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.match(firstBody.oauth_evidence_receipt, /^[^.]+\.[^.]+\.[^.]+$/);

    const replay = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/revoke",
      revokeRequest(pair.refresh_token, idempotencyKey),
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), firstBody);
    const stored = await db.prepare(
      "SELECT receipt_jwt, idempotency_key_hash FROM oauth_evidence_revoke_results WHERE refresh_token_hash = ?",
    ).bind(hash(pair.refresh_token)).first();
    assert.equal(stored?.receipt_jwt, firstBody.oauth_evidence_receipt);
    assert.equal(stored?.idempotency_key_hash, hash(idempotencyKey));

    const mismatch = await mf.dispatchFetch(
      "https://auth.example/v1/desktop/revoke",
      revokeRequest(pair.refresh_token, "miniflare-evidence-other-key-0987654321"),
    );
    assert.equal(mismatch.status, 409);
    assert.equal((await mismatch.json()).error_code, "revoke_idempotency_mismatch");
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});

test("staging smoke exercises token, retry, reuse, family revoke, and explicit revoke against D1", async () => {
  const { mf, db } = await createIdentityRuntime();
  let writtenEvidence = null;
  try {
    const evidence = await runIdentityStagingSmoke({
      identityUrl: "https://auth-staging.example",
      sourceRevision: "test-source-revision",
      fetchImpl: (url, options) => mf.dispatchFetch(url, options),
      seedAuthorizationCode: async ({ subject, email, name, deviceId: seededDeviceId, codeHash, codeChallenge, expiresAt }) => {
        const now = Date.now();
        await db.batch([
          db.prepare(
            "INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(subject) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = excluded.updated_at",
          ).bind(subject, email, name, null, now, now),
          db.prepare(
            "INSERT INTO authorization_codes (code_hash, subject, email, name, picture, device_id, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ).bind(codeHash, subject, email, name, null, seededDeviceId, codeChallenge, expiresAt),
        ]);
      },
      cleanup: async ({ subject, codeHashes }) => {
        await db.batch([
          ...codeHashes.map((codeHash) => db.prepare(
            "DELETE FROM identity_replay_results_v2 WHERE replay_key = ?",
          ).bind(`authorization-code:${codeHash}`)),
          db.prepare("DELETE FROM authorization_codes WHERE subject = ?").bind(subject),
          db.prepare("DELETE FROM refresh_tokens WHERE subject = ?").bind(subject),
          db.prepare("DELETE FROM identity_users WHERE subject = ?").bind(subject),
        ]);
      },
      writeEvidence: async (value) => { writtenEvidence = value; },
    });
    assert.equal(evidence.status, "passed");
    assert.deepEqual(evidence.checks, {
      health: true,
      token: true,
      tokenRetry: true,
      refresh: true,
      refreshRetry: true,
      reuse: true,
      familyRevoke: true,
      revoke: true,
    });
    assert.deepEqual(writtenEvidence, evidence);
  } finally {
    await bounded(mf.dispose(), "Miniflare disposal", 5_000);
  }
});
