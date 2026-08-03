import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, createSign } from "node:crypto";
import test from "node:test";
import {
  createSpsIdentityWorker,
  isLoopbackRedirectUri,
  SPS_DESKTOP_SIGN_IN_TTL_MS,
  verifyGoogleIdToken,
} from "../src/worker.mjs";

const DEVICE_ID = "sps-desktop-device-1234";
const PROFILE = {
  subject: "google-subject",
  email: "person@example.com",
  name: "Person Example",
  picture: null,
};

function hash(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function createSigningEnv() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    GOOGLE_CLIENT_ID: "google-client",
    SPS_IDENTITY_ISSUER: "https://auth.example",
    SPS_IDENTITY_AUDIENCE: "sps-core",
    SPS_IDENTITY_KEY_ID: "identity-test",
    SPS_IDENTITY_PRIVATE_KEY_PEM: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

class FakeD1 {
  constructor(seed = {}) {
    this.tables = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
    this.fail = null;
    this.readBarrier = null;
  }

  failWhen(predicate) {
    this.fail = predicate;
    return this;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const snapshot = new Map([...this.tables].map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (reason) {
      this.tables = snapshot;
      throw reason;
    }
  }

  rows(table) {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table);
  }

  maybeFail(sql, operation) {
    if (this.fail?.(sql, operation)) throw new Error("simulated D1 failure");
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    this.db.maybeFail(this.sql, "first");
    const table = this.sql.match(/FROM (\w+)/i)?.[1];
    const rows = this.db.rows(table);
    const row = rows.find((candidate) => candidate.code_hash === this.values[0]
      || candidate.token_hash === this.values[0]
      || candidate.replay_key === this.values[0]
      || candidate.subject === this.values[0]);
    if (this.db.readBarrier) await this.db.readBarrier();
    return row ? { ...row } : null;
  }

  async run() {
    this.db.maybeFail(this.sql, "run");
    const updateMatch = this.sql.match(/UPDATE (\w+) SET consumed_at = \?, replay_key = \? WHERE (\w+) = \?/i);
    if (updateMatch) {
      const [, table, keyColumn] = updateMatch;
      const [consumedAt, replayKey, key, deviceId, expiresAt] = this.values;
      let changes = 0;
      for (const row of this.db.rows(table)) {
        if (row[keyColumn] === key && row.device_id === deviceId
          && Number(row.expires_at) === Number(expiresAt) && row.consumed_at == null) {
          row.consumed_at = consumedAt;
          row.replay_key = replayKey;
          changes += 1;
        }
      }
      return { success: true, meta: { changes } };
    }
    const deleteMatch = this.sql.match(/DELETE FROM (\w+)/i);
    if (deleteMatch) {
      const table = deleteMatch[1];
      const rows = this.db.rows(table);
      const before = rows.length;
      const [first, second, third] = this.values;
      const kept = rows.filter((row) => {
        if (this.sql.includes("expires_at <= ?")) return !(Number(row.expires_at) <= Number(first));
        if (table === "authorization_codes") {
          return this.sql.includes("AND device_id")
            ? !(row.code_hash === first && row.device_id === second && Number(row.expires_at) === Number(third))
            : row.code_hash !== first;
        }
        if (table === "refresh_tokens") {
          return this.sql.includes("AND device_id")
            ? !(row.token_hash === first && row.device_id === second && Number(row.expires_at) === Number(third))
            : row.token_hash !== first;
        }
        return true;
      });
      this.db.tables.set(table, kept);
      return { success: true, meta: { changes: before - kept.length } };
    }
    const insertMatch = this.sql.match(/INSERT INTO (\w+)/i);
    if (insertMatch) {
      const table = insertMatch[1];
      if (this.sql.includes("SELECT 1 FROM")) {
        const sourceTable = this.sql.match(/SELECT 1 FROM (\w+) WHERE/i)?.[1];
        const sourceKeyColumn = this.sql.match(/WHERE (\w+) = \?/i)?.[1];
        const source = this.db.rows(sourceTable).find((row) => row[sourceKeyColumn] === this.values[5]
          && row.device_id === this.values[6]
          && Number(row.expires_at) === Number(this.values[7])
          && Number(row.consumed_at) === Number(this.values[this.values.length - 2])
          && row.replay_key === this.values[this.values.length - 1]);
        if (!source) return { success: true, meta: { changes: 0 } };
        if (table === "refresh_tokens") {
          this.db.rows(table).push({
            token_hash: this.values[0], subject: this.values[1], device_id: this.values[2],
            expires_at: this.values[3], created_at: this.values[4],
          });
        } else {
          this.db.rows(table).push({
            replay_key: this.values[0], request_hash: this.values[1], response_json: this.values[2],
            expires_at: this.values[3], created_at: this.values[4],
          });
        }
        return { success: true, meta: { changes: 1 } };
      }
      const columns = this.sql.match(/\(([^)]+)\)/)?.[1].split(",").map((value) => value.trim()) ?? [];
      const row = Object.fromEntries(columns.map((column, index) => [column, this.values[index]]));
      const rows = this.db.rows(table);
      const existing = rows.findIndex((candidate) => candidate[columns[0]] === row[columns[0]]);
      if (existing >= 0 && this.sql.includes("ON CONFLICT")) rows[existing] = { ...rows[existing], ...row };
      else rows.push(row);
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 0 } };
  }
}

function request(path, body) {
  return new Request(`https://auth.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function responseBody(response) {
  return response.json();
}

function seedRefresh(db, refreshToken = "refresh-token") {
  db.rows("identity_users").push({ ...PROFILE, created_at: 1, updated_at: 1 });
  db.rows("refresh_tokens").push({
    token_hash: hash(refreshToken),
    subject: PROFILE.subject,
    device_id: DEVICE_ID,
    expires_at: Date.now() + 60_000,
    created_at: Date.now(),
  });
  return refreshToken;
}

test("keeps the central SPS Desktop sign-in request valid for fifteen minutes", () => {
  assert.equal(SPS_DESKTOP_SIGN_IN_TTL_MS, 15 * 60 * 1000);
});

test("accepts only SPS Desktop loopback callbacks", () => {
  assert.equal(isLoopbackRedirectUri("http://127.0.0.1:43129/oauth2/callback"), true);
  assert.equal(isLoopbackRedirectUri("http://localhost:43129/oauth2/callback"), true);
  assert.equal(isLoopbackRedirectUri("https://localhost:43129/oauth2/callback"), false);
  assert.equal(isLoopbackRedirectUri("http://example.com:43129/oauth2/callback"), false);
  assert.equal(isLoopbackRedirectUri("http://127.0.0.1:43129/other"), false);
  assert.equal(isLoopbackRedirectUri("http://127.0.0.1/oauth2/callback"), false);
});

test("rejects malformed desktop device requests before touching identity storage", async () => {
  const worker = createSpsIdentityWorker();
  const response = await worker.fetch(new Request("https://auth.example/v1/desktop/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "one-time-code", code_verifier: "verifier", device_id: "short" }),
  }), {});
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /device ID/i);
});

test("rotates refresh tokens and safely replays the same response for ten minutes", async () => {
  const env = createSigningEnv();
  const db = new FakeD1();
  const worker = createSpsIdentityWorker();
  const oldToken = seedRefresh(db);

  const first = await worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: oldToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(first.status, 200);
  const firstBody = await responseBody(first);
  assert.notEqual(firstBody.refresh_token, oldToken);
  const replayRecord = db.rows("identity_replay_results")[0];
  assert.ok(replayRecord.expires_at > Date.now());
  assert.ok(replayRecord.expires_at <= Date.now() + 10 * 60 * 1000);

  const replay = await worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: oldToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(replay.status, 200);
  assert.deepEqual(await responseBody(replay), firstBody);
});

test("rejects a replay with a different device request while preserving the original response", async () => {
  const env = createSigningEnv();
  const db = new FakeD1();
  const worker = createSpsIdentityWorker();
  const oldToken = seedRefresh(db);
  const first = await worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: oldToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  const firstBody = await responseBody(first);
  const mismatched = await worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: oldToken,
    device_id: "sps-other-device-5678",
  }), { ...env, DB: db });
  assert.equal(mismatched.status, 401);
  assert.match((await responseBody(mismatched)).error, /already used/i);
  const retry = await worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: oldToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.deepEqual(await responseBody(retry), firstBody);
});

test("rejects a revoked refresh token", async () => {
  const env = createSigningEnv();
  const db = new FakeD1();
  const worker = createSpsIdentityWorker();
  const refreshToken = seedRefresh(db);

  const revoked = await worker.fetch(request("/v1/desktop/revoke", { refresh_token: refreshToken }), { ...env, DB: db });
  assert.equal(revoked.status, 204);
  const replay = await worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: refreshToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(replay.status, 401);
});

test("consumes an authorization code once and rejects reuse", async () => {
  const env = createSigningEnv();
  const db = new FakeD1();
  const worker = createSpsIdentityWorker();
  const code = "authorization-code-once";
  const verifier = "desktop-verifier";
  db.rows("authorization_codes").push({
    code_hash: hash(code),
    ...PROFILE,
    device_id: DEVICE_ID,
    code_challenge: hash(verifier),
    expires_at: Date.now() + 60_000,
  });

  const first = await worker.fetch(request("/v1/desktop/token", {
    code,
    code_verifier: verifier,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(first.status, 200);
  const replay = await worker.fetch(request("/v1/desktop/token", {
    code,
    code_verifier: verifier,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(replay.status, 200);
});

test("fails closed when D1 cannot rotate a refresh token", async () => {
  const env = createSigningEnv();
  const db = new FakeD1();
  const worker = createSpsIdentityWorker();
  const refreshToken = seedRefresh(db);
  db.failWhen((sql, operation) => operation === "run" && sql.includes("INSERT INTO identity_replay_results"));

  const response = await worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: refreshToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(response.status, 500);
  assert.match((await responseBody(response)).error, /could not complete/i);
  assert.equal(db.rows("refresh_tokens").filter((row) => row.token_hash === hash(refreshToken) && row.consumed_at == null).length, 1);
  db.failWhen(null);
  const retry = await worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: refreshToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(retry.status, 200);
});

test("allows only one concurrent refresh rotation", async () => {
  const env = createSigningEnv();
  const db = new FakeD1();
  const worker = createSpsIdentityWorker();
  const refreshToken = seedRefresh(db);
  let reads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let bothRead;
  const bothReadPromise = new Promise((resolve) => { bothRead = resolve; });
  db.readBarrier = async () => {
    reads += 1;
    if (reads === 2) bothRead();
    await gate;
  };

  const firstRequest = worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: refreshToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  const secondRequest = worker.fetch(request("/v1/desktop/refresh", {
    refresh_token: refreshToken,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  await bothReadPromise;
  release();
  const responses = await Promise.all([firstRequest, secondRequest]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200]);
});

test("fails closed when D1 cannot consume an authorization code", async () => {
  const env = createSigningEnv();
  const db = new FakeD1();
  const worker = createSpsIdentityWorker();
  const code = "authorization-code-storage-failure";
  const verifier = "desktop-verifier";
  db.rows("authorization_codes").push({
    code_hash: hash(code),
    ...PROFILE,
    device_id: DEVICE_ID,
    code_challenge: hash(verifier),
    expires_at: Date.now() + 60_000,
  });
  db.failWhen((sql, operation) => operation === "run" && sql.includes("INSERT INTO identity_replay_results"));

  const response = await worker.fetch(request("/v1/desktop/token", {
    code,
    code_verifier: verifier,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(response.status, 500);
  assert.match((await responseBody(response)).error, /could not complete/i);
  assert.equal(db.rows("authorization_codes").filter((row) => row.code_hash === hash(code) && row.consumed_at == null).length, 1);
  assert.equal(db.rows("refresh_tokens").length, 0);
  db.failWhen(null);
  const retry = await worker.fetch(request("/v1/desktop/token", {
    code,
    code_verifier: verifier,
    device_id: DEVICE_ID,
  }), { ...env, DB: db });
  assert.equal(retry.status, 200);
});

test("allows only one concurrent authorization-code exchange", async () => {
  const env = createSigningEnv();
  const db = new FakeD1();
  const worker = createSpsIdentityWorker();
  const code = "authorization-code-race";
  const verifier = "desktop-verifier";
  db.rows("authorization_codes").push({
    code_hash: hash(code),
    ...PROFILE,
    device_id: DEVICE_ID,
    code_challenge: hash(verifier),
    expires_at: Date.now() + 60_000,
  });
  let reads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let bothRead;
  const bothReadPromise = new Promise((resolve) => { bothRead = resolve; });
  db.readBarrier = async () => {
    reads += 1;
    if (reads === 2) bothRead();
    await gate;
  };

  const body = { code, code_verifier: verifier, device_id: DEVICE_ID };
  const firstRequest = worker.fetch(request("/v1/desktop/token", body), { ...env, DB: db });
  const secondRequest = worker.fetch(request("/v1/desktop/token", body), { ...env, DB: db });
  await bothReadPromise;
  release();
  const responses = await Promise.all([firstRequest, secondRequest]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200]);
});

test("cleans expired identity records when a new Desktop sign-in starts", async () => {
  const statements = [];
  const worker = createSpsIdentityWorker();
  const response = await worker.fetch(new Request(
    "https://auth.example/v1/desktop/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A43129%2Foauth2%2Fcallback&state=desktop-state&code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&code_challenge_method=S256&device_id=sps-desktop-device-1234",
  ), {
    GOOGLE_CLIENT_ID: "google-client",
    SPS_IDENTITY_ISSUER: "https://auth.example",
    DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind() {
            return { run: async () => ({ success: true }) };
          },
        };
      },
    },
  });

  assert.equal(response.status, 302);
  assert.equal(statements.some((sql) => sql.includes("DELETE FROM oauth_states")), true);
  assert.equal(statements.some((sql) => sql.includes("DELETE FROM authorization_codes")), true);
  assert.equal(statements.some((sql) => sql.includes("DELETE FROM refresh_tokens")), true);
});

test("binds a Google ID token to the central sign-in nonce", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "google-test" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: "google-client",
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: "request-nonce",
    sub: "google-subject",
    email: "person@example.com",
    email_verified: true,
  })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const token = `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;
  const fetchImpl = async () => new Response(JSON.stringify({
    keys: [{ ...publicKey.export({ format: "jwk" }), kid: "google-test" }],
  }), { status: 200 });

  const profile = await verifyGoogleIdToken({
    fetchImpl,
    idToken: token,
    clientId: "google-client",
    nonce: "request-nonce",
  });
  assert.equal(profile.subject, "google-subject");
  await assert.rejects(
    () => verifyGoogleIdToken({ fetchImpl, idToken: token, clientId: "google-client", nonce: "another-request" }),
    /does not match/i,
  );
});
