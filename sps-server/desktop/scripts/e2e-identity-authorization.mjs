import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createSpsIdentityExternalOpener } from "../src/sps-identity-external-opener.mjs";

// Isolated test Identity only. Never accepts a real provider or returns tokens.
export function createE2eIdentityAuthorization() {
  const codes = new Map();
  const captured = [];
  async function validate(input, origin) {
    let checked = null;
    const opener = createSpsIdentityExternalOpener({ identityUrl: origin, sourceE2e: true,
      allowLoopbackIdentity: true, openExternal: async () => { throw new Error("Only the mock Identity origin is allowed."); },
      fetchImpl: async (_url, options) => { checked = JSON.parse(options.body).authorizationUrl; return { ok: true }; },
    });
    await opener(input);
    if (!checked) throw new Error("Missing mock authorization.");
    return new URL(checked);
  }
  return Object.freeze({
    async handle(request, response, url, body, origin) {
      const capture = request.method === "POST" && url.pathname === "/__e2e/capture-authorization";
      const authorize = request.method === "GET" && url.pathname === "/v1/desktop/authorize";
      if (!capture && !authorize) return false;
      response.setHeader("cache-control", "no-store");
      try {
        if (request.socket.remoteAddress !== "127.0.0.1" || url.search && capture) throw new Error("Invalid mock request.");
        if (capture && (captured.length !== 0 || !body || Object.keys(body).length !== 1 || typeof body.authorizationUrl !== "string")) {
          throw new Error("Invalid mock capture.");
        }
        const authorization = await validate(capture ? body.authorizationUrl : url.href, origin);
        if (capture) {
          captured.push(authorization.href);
          response.writeHead(204).end();
        } else {
          const code = `code-${randomBytes(18).toString("base64url")}`;
          codes.set(code, { challenge: authorization.searchParams.get("code_challenge"), deviceId: authorization.searchParams.get("device_id") });
          const redirect = new URL(authorization.searchParams.get("redirect_uri"));
          redirect.searchParams.set("code", code);
          redirect.searchParams.set("state", authorization.searchParams.get("state"));
          response.writeHead(302, { location: redirect.href }).end();
        }
      } catch { response.writeHead(400).end("Invalid mock authorization."); }
      return true;
    },
    consumeCode(body) {
      const code = codes.get(body?.code);
      if (!code || typeof body.code_verifier !== "string" || body.device_id !== code.deviceId
        || createHash("sha256").update(body.code_verifier).digest("base64url") !== code.challenge) return false;
      codes.delete(body.code);
      return true;
    },
    async follow(origin) {
      const deadline = Date.now() + 30_000;
      while (!captured.length && Date.now() < deadline) await delay(50);
      assert.equal(captured.length, 1, "One mock Identity authorization must be captured without starting a system browser.");
      const authorization = await validate(captured.shift(), origin);
      // Follow only the known mock's fixed redirect and exact Desktop callback;
      // never permit an arbitrary redirect chain from a failed fixture.
      const response = await fetch(authorization, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 302);
      await response.arrayBuffer();
      const location = new URL(response.headers.get("location"));
      const callback = new URL(authorization.searchParams.get("redirect_uri"));
      assert.equal(location.origin, callback.origin);
      assert.equal(location.pathname, callback.pathname);
      assert.equal(location.searchParams.get("state"), authorization.searchParams.get("state"));
      assert.match(location.searchParams.get("code") ?? "", /^code-[A-Za-z0-9_-]{24}$/);
      const result = await fetch(location, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      assert.equal(result.status, 200, "The real Desktop state/PKCE callback must succeed.");
      assert.match(await result.text(), /sign-in complete/i);
    },
  });
}
