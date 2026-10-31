import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createServer } from "node:http";

function base64Url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

export function createMockIdentityServer() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = keys.publicKey.export({ format: "jwk" });
  const codes = new Map();
  const refreshTokens = new Set();
  const issued = [];
  const capturedAuthorizationUrls = [];
  let origin = null;

  function accessToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url({ alg: "RS256", kid: "sps-desktop-e2e", typ: "JWT" });
    const payload = base64Url({
      iss: origin,
      aud: "sps-core",
      sub: "sps-desktop-e2e-owner",
      email: "desktop-e2e-owner@example.test",
      name: "SPS Desktop E2E Owner",
      scope: "sps.core.session",
      iat: now,
      nbf: now - 1,
      exp: now + 60 * 60,
    });
    const input = `${header}.${payload}`;
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), keys.privateKey).toString("base64url")}`;
  }

  function tokenResponse() {
    const refreshToken = `refresh-${randomBytes(18).toString("base64url")}`;
    refreshTokens.add(refreshToken);
    const response = {
      access_token: accessToken(),
      refresh_token: refreshToken,
      expires_in: 3600,
      account: {
        subject: "sps-desktop-e2e-owner",
        email: "desktop-e2e-owner@example.test",
        name: "SPS Desktop E2E Owner",
        picture: null,
      },
    };
    issued.push(response);
    return response;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", origin || "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: "sps-desktop-e2e", alg: "RS256", use: "sig" }] }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/desktop/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      const challenge = url.searchParams.get("code_challenge");
      const deviceId = url.searchParams.get("device_id");
      let callback;
      try { callback = new URL(redirectUri); } catch { callback = null; }
      if (!callback || callback.protocol !== "http:" || callback.hostname !== "127.0.0.1"
        || callback.pathname !== "/oauth2/callback" || !callback.port || callback.username || callback.password
        || !/^[A-Za-z0-9_-]{43}$/.test(state || "") || !/^[A-Za-z0-9_-]{43}$/.test(challenge || "")
        || url.searchParams.get("code_challenge_method") !== "S256"
        || !/^[A-Za-z0-9_-]{16,128}$/.test(deviceId || "")) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Missing SPS Desktop redirect state.");
        return;
      }
      const code = `code-${randomBytes(18).toString("base64url")}`;
      codes.set(code, { challenge, deviceId });
      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("state", state);
      response.writeHead(302, { location: redirect.toString(), "cache-control": "no-store" });
      response.end();
      return;
    }
    let body = {};
    if (request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { body = {}; }
    }
    if (request.method === "POST" && url.pathname === "/__e2e/capture-authorization") {
      const authorizationUrl = body?.authorizationUrl;
      let authorization;
      try { authorization = new URL(authorizationUrl); } catch { authorization = null; }
      if (request.socket.remoteAddress !== "127.0.0.1" || !authorization || authorization.origin !== origin
        || authorization.pathname !== "/v1/desktop/authorize" || authorization.username || authorization.password
        || authorization.hash || !authorization.searchParams.has("state")) {
        response.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify({ error: "invalid E2E authorization capture" }));
        return;
      }
      capturedAuthorizationUrls.push(authorization.href);
      response.writeHead(204, { "cache-control": "no-store" }).end();
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/token") {
      const code = codes.get(String(body.code || ""));
      const challenge = typeof body.code_verifier === "string"
        ? createHash("sha256").update(body.code_verifier).digest("base64url") : null;
      if (!code || challenge !== code.challenge || body.device_id !== code.deviceId) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid desktop authorization code" }));
        return;
      }
      codes.delete(String(body.code));
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(tokenResponse()));
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/refresh") {
      if (!refreshTokens.has(String(body.refresh_token || ""))) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid refresh token" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(tokenResponse()));
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/revoke") {
      refreshTokens.delete(String(body.refresh_token || ""));
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  return {
    capturedAuthorizationUrls,
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      assert.ok(address && typeof address === "object", "Mock Identity did not bind a loopback address.");
      origin = `http://127.0.0.1:${address.port}`;
      return { origin, issued };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
