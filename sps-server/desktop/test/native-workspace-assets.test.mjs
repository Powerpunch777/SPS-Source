import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSpsNativeWorkspaceAssets } from "../src/native-workspace-assets.mjs";

const INLINE_THEME = "window.__spsTheme = 'system';\r\nwindow.__spsThemeReady = true;";
const INDEX = `<!doctype html><html><head><script>${INLINE_THEME}</script></head><body><script type="module" src="/assets/app.js"></script></body></html>`;

async function fixture(t, assertCurrent = () => {}, directoryName = "ui-dist") {
  const parent = await mkdtemp(path.join(os.tmpdir(), "sps-native-assets-"));
  const root = path.join(parent, directoryName);
  await mkdir(path.join(root, "assets", "nested"), { recursive: true });
  await writeFile(path.join(root, "index.html"), INDEX);
  await writeFile(path.join(root, "assets", "app.js"), "globalThis.spsAssets = true;");
  await writeFile(path.join(root, "assets", "nested", "theme.css"), "body { color: black; }");
  await writeFile(path.join(root, "favicon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  await writeFile(path.join(root, "site.webmanifest"), "{\"name\":\"SPS\"}");
  let assets;
  try { assets = await createSpsNativeWorkspaceAssets({ root, assertCurrent }); }
  catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
  t.after(async () => {
    await assets.dispose();
    await rm(parent, { recursive: true, force: true });
  });
  return { parent, root, assets };
}

function send(assets, { method = "GET", target = "/", origin, cookie, rawHeaders, body } = {}) {
  const endpoint = new URL(assets.origin);
  const headers = rawHeaders ?? {
    Host: endpoint.host,
    Cookie: cookie ?? `${assets.launchCookie.name}=${assets.launchCookie.value}`,
    ...(origin === undefined ? {} : { Origin: origin }),
  };
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: endpoint.hostname,
      port: Number(endpoint.port),
      method,
      path: target,
      headers,
      agent: false,
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function headerPairs(assets, entries = []) {
  const endpoint = new URL(assets.origin);
  return [
    "Host", endpoint.host,
    "Cookie", `${assets.launchCookie.name}=${assets.launchCookie.value}`,
    ...entries.flat(),
  ];
}

test("serves only the allowed bundled files with an inline-script CSP hash", async t => {
  const { assets } = await fixture(t);
  assert.match(assets.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.deepEqual(assets.launchCookie, {
    name: "sps_native_workspace_launch",
    value: assets.launchCookie.value,
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  assert.match(assets.launchCookie.value, /^[A-Za-z0-9_-]{43}$/);

  const index = await send(assets);
  assert.equal(index.status, 200);
  assert.equal(index.body.toString("utf8"), INDEX);
  assert.equal(index.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(index.headers["cache-control"], "no-store");
  assert.equal(index.headers["x-content-type-options"], "nosniff");
  const hash = createHash("sha256").update(INLINE_THEME.replace(/\r\n?/g, "\n")).digest("base64");
  const csp = index.headers["content-security-policy"];
  assert.ok(csp.includes(`'sha256-${hash}'`));
  assert.ok(csp.includes("connect-src 'none'"));
  assert.ok(csp.includes("worker-src 'none'"));
  assert.ok(!csp.includes("unsafe-eval"));
  assert.ok(!csp.includes("http://"));
  assert.equal(index.headers["set-cookie"], undefined);
  assert.equal((await send(assets, { target: "/plugin/index.js" })).status, 404);

  const asset = await send(assets, { target: "/assets/app.js", origin: assets.origin });
  assert.equal(asset.status, 200);
  assert.equal(asset.body.toString("utf8"), "globalThis.spsAssets = true;");
  assert.equal(asset.headers["content-type"], "text/javascript; charset=utf-8");
  const nested = await send(assets, { target: "/assets/nested/theme.css" });
  assert.equal(nested.status, 200);
  assert.equal(nested.headers["content-type"], "text/css; charset=utf-8");
  const favicon = await send(assets, { target: "/favicon.svg" });
  assert.equal(favicon.status, 200);
  assert.equal((await send(assets, { target: "/site.webmanifest" })).status, 200);

  const head = await send(assets, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers["content-length"], String(Buffer.byteLength(INDEX)));
});

test("opt-in Plugin assets are bounded same-origin reads with a separate CSP", async t => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "sps-native-plugin-assets-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "ui-dist");
  await mkdir(path.join(root, "assets"), { recursive: true });
  await writeFile(path.join(root, "index.html"), INDEX);
  await writeFile(path.join(root, "assets", "app.js"), "globalThis.host = true;");
  const pluginBytes = Buffer.from("export default function View() {};");
  const requested = [];
  let corruptDigest = false;
  const assets = await createSpsNativeWorkspaceAssets({ root, assertCurrent() {}, plugin: {
    async readAsset(relativePath, signal) { requested.push(relativePath); assert.equal(signal.aborted, false);
      return { path: relativePath, contentType: "text/javascript; charset=utf-8",
        bytes: pluginBytes.toString("base64url"), sha256: corruptDigest ? "0".repeat(64)
          : createHash("sha256").update(pluginBytes).digest("hex") };
    },
  } });
  t.after(() => assets.dispose());

  const index = await send(assets);
  const csp = index.headers["content-security-policy"];
  assert.match(csp, /script-src 'self' blob:/);
  assert.match(csp, /connect-src 'self'/);
  const nonce = /name="sps-native-plugin-nonce" content="([A-Za-z0-9_-]+)"/.exec(index.body.toString())[1];
  assert.ok(csp.includes(`'nonce-${nonce}'`));
  assert.ok(!csp.includes("unsafe-eval"));
  assert.ok(!csp.includes("https://"));
  assert.equal((await send(assets, { target: "/plugin/index.js", origin: assets.origin })).status, 200);
  const script = await send(assets, { target: "/plugin/index.js", origin: assets.origin });
  assert.equal(script.body.toString(), pluginBytes.toString());
  assert.equal(script.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(script.headers["cache-control"], "no-store");
  assert.deepEqual(requested, ["index.js", "index.js"]);
  assert.equal((await send(assets, { target: "/plugin/index.js" })).status, 200);
  assert.equal((await send(assets, { target: "/plugin/index.js", origin: "http://127.0.0.1:1" })).status, 403);
  assert.deepEqual(requested, ["index.js", "index.js", "index.js"]);
  corruptDigest = true;
  assert.equal((await send(assets, { target: "/plugin/index.js", origin: assets.origin })).status, 404);
  assert.deepEqual(requested, ["index.js", "index.js", "index.js", "index.js"]);
  for (const target of ["/plugin/../secret.js", "/plugin/%2e%2e/secret.js", "/plugin/index.js.map", "/plugin/"]) {
    assert.equal((await send(assets, { target })).status, 404, target);
  }
  assert.equal((await send(assets, { target: "/plugin/index.js", cookie: "wrong" })).status, 403);
});

test("serves a Main-selected bundled Core directory named dist", async t => {
  const { root, assets } = await fixture(t, () => {}, "dist");
  assert.equal(path.basename(root), "dist");
  const index = await send(assets);
  assert.equal(index.status, 200);
  assert.equal(index.body.toString("utf8"), INDEX);
});

test("serves a normal parallel browser asset burst through the bounded queue", async t => {
  const { assets } = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 8 }, () => send(assets, { target: "/assets/app.js" })));
  assert.deepEqual(responses.map(response => response.status), Array(8).fill(200));
});

test("requires exact launch cookie, host and optional same-origin header", async t => {
  const { assets } = await fixture(t);
  const cookie = `${assets.launchCookie.name}=${assets.launchCookie.value}`;
  assert.equal((await send(assets, { origin: assets.origin })).status, 200);
  assert.equal((await send(assets, { cookie: `${cookie}; extra=1` })).status, 403);
  assert.equal((await send(assets, { origin: "http://127.0.0.1:1" })).status, 403);
  assert.equal((await send(assets, {
    rawHeaders: headerPairs(assets, [["Cookie", cookie]]),
  })).status, 403);
  assert.equal((await send(assets, {
    rawHeaders: headerPairs(assets, [["Host", "127.0.0.1:1"]]),
  })).status, 403);
  assert.equal((await send(assets, {
    rawHeaders: headerPairs(assets, [["Origin", assets.origin], ["Origin", assets.origin]]),
  })).status, 403);
});

test("rejects non-asset routes, traversal, query strings, methods and request bodies", async t => {
  const { assets } = await fixture(t);
  for (const target of [
    "/api/health",
    "/sw.js",
    "/service-worker.js",
    "/index.html",
    "/nested/route",
    "/assets/../index.html",
    "/assets/%2e%2e/index.html",
    "/assets/%252e%252e/index.html",
    "/assets/app.js?cache=1",
    "/assets/app.js#fragment",
    "/assets/app.js.map",
    "//127.0.0.1/assets/app.js",
  ]) {
    assert.equal((await send(assets, { target })).status, 404, target);
  }
  assert.equal((await send(assets, { method: "POST" })).status, 405);
  assert.equal((await send(assets, {
    rawHeaders: headerPairs(assets, [["Content-Length", "1"]]),
    body: "x",
  })).status, 400);
  assert.equal((await send(assets, {
    rawHeaders: headerPairs(assets, [["Expect", "100-continue"], ["Content-Length", "1"]]),
    body: "x",
  })).status, 417);
});

test("does not follow replaced roots or files and stops serving after disposal", async t => {
  const { parent, root, assets } = await fixture(t);
  const originalAsset = path.join(root, "assets", "app.js");
  await rename(originalAsset, `${originalAsset}.old`);
  await writeFile(originalAsset, "replacement content");
  assert.equal((await send(assets, { target: "/assets/app.js" })).status, 404);

  await rename(root, path.join(parent, "ui-dist-old"));
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "index.html"), "replacement root");
  assert.equal((await send(assets)).status, 403);

  await assets.dispose();
  await assert.rejects(send(assets), /ECONNREFUSED|socket hang up|ECONNRESET/);
});

test("rejects stale current-window requests", async t => {
  let current = true;
  const { assets } = await fixture(t, () => {
    if (!current) throw new Error("stale window");
  });
  current = false;
  assert.equal((await send(assets)).status, 403);
});

test("rejects async current-window authority callbacks and consumes rejections", async t => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "sps-native-assets-async-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "ui-dist");
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "index.html"), INDEX);
  await assert.rejects(createSpsNativeWorkspaceAssets({
    root,
    async assertCurrent() { throw new Error("private authority detail"); },
  }), error => {
    assert.equal(error.code, "native_workspace_assets_unavailable");
    assert.equal(error.message, "The Native Workspace assets are unavailable.");
    return true;
  });
});

test("rejects a symbolic-link asset tree during startup", async t => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "sps-native-assets-link-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, "ui-dist");
  const outside = path.join(parent, "outside");
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(root, "index.html"), INDEX);
  await writeFile(path.join(outside, "secret.js"), "secret");
  try {
    await (await import("node:fs/promises")).symlink(outside, path.join(root, "assets"), "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return t.skip("symlink creation is unavailable");
    throw error;
  }
  await assert.rejects(createSpsNativeWorkspaceAssets({ root, assertCurrent() {} }), error => {
    assert.equal(error.code, "native_workspace_assets_unavailable");
    return true;
  });
});
