import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createE2eIdentityAuthorization } from "../scripts/e2e-identity-authorization.mjs";
import { createSpsIdentityExternalOpener } from "../src/sps-identity-external-opener.mjs";
import { startSpsDesktopIdentitySignIn } from "../src/sps-identity-account.mjs";

test("packaged-fixture authorization completes the real state/PKCE callback without opening a browser", async () => {
  const authorization = createE2eIdentityAuthorization();
  let origin, tokens = 0, browserCalls = 0, pending;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    const url = new URL(request.url, origin);
    if (await authorization.handle(request, response, url, body, origin)) return;
    if (url.pathname === "/v1/desktop/token" && authorization.consumeCode(body)) {
      tokens++;
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 900,
        account: { subject: "fixture-owner", email: "fixture@example.test", name: "Fixture Owner" },
      }));
    } else response.writeHead(400).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const invalid = await fetch(`${origin}/__e2e/capture-authorization`, { method: "POST",
      body: JSON.stringify({ authorizationUrl: "https://example.test/v1/desktop/authorize" }) });
    assert.equal(invalid.status, 400);
    await invalid.text();
    pending = await startSpsDesktopIdentitySignIn({ identityUrl: origin, deviceId: "fixture-device-0123456789", timeoutMs: 5000,
      openExternal: createSpsIdentityExternalOpener({ identityUrl: origin, sourceE2e: true, allowLoopbackIdentity: true,
        openExternal: async () => { browserCalls++; },
      }),
    });
    await authorization.follow(origin);
    assert.equal((await pending.result).subject, "fixture-owner");
    assert.equal(tokens, 1);
    assert.equal(browserCalls, 0);
    assert.equal(authorization.consumeCode({ code: "used", device_id: "fixture-device-0123456789", code_verifier: "wrong" }), false);
  } finally {
    pending?.cancel();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("every packaged browserless fixture drives captured authorization before waiting for login", async () => {
  for (const file of ["smoke-plugin-preview-desktop.mjs", "smoke-host-plugin-lifecycle-desktop.mjs"]) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8");
    assert.match(source, /createE2eIdentityAuthorization/);
    assert.match(source, /await authorization\.handle\(request,/);
    assert.match(source, /authorization\.consumeCode\(body\)/);
    const drive = source.indexOf("await identity.followAuthorization()");
    assert.ok(drive > source.indexOf("#start-sps-account"));
    assert.ok(source.indexOf("identityState.signIns > 0", drive) > drive);
  }
});
