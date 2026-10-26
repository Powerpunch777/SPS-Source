import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const COOKIE_NAME = "sps_native_workspace_launch";
const COOKIE_VALUE = /^[A-Za-z0-9_-]{43}$/;
const MAX_TARGET_BYTES = 2048;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_ASSET_FILES = 4096;
const MAX_ASSET_DEPTH = 8;
const MAX_ASSET_TREE_BYTES = 512 * 1024 * 1024;
const MAX_ACTIVE_REQUESTS = 4;
const MAX_QUEUED_REQUESTS = 12;
const MAX_SOCKETS = 16;
const MAX_QUEUE_WAIT_MS = 5000;
const CLOSE_TIMEOUT_MS = 2000;
const ASSET_EXTENSIONS = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ttf", "font/ttf"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);
const FIXED_FILES = new Map([
  ["/favicon.ico", ["favicon.ico", "image/x-icon"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml; charset=utf-8"]],
  ["/favicon-16x16.png", ["favicon-16x16.png", "image/png"]],
  ["/favicon-32x32.png", ["favicon-32x32.png", "image/png"]],
  ["/apple-touch-icon.png", ["apple-touch-icon.png", "image/png"]],
  ["/site.webmanifest", ["site.webmanifest", "application/manifest+json; charset=utf-8"]],
]);
const ERROR = "The Native Workspace assets are unavailable.";
const unavailable = () => Object.assign(new Error(ERROR), { code: "native_workspace_assets_unavailable" });
const fail = () => { throw unavailable(); };
function withDeadline(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(unavailable()), ms);
      timer.unref?.();
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function fileIdentity(stat) {
  if (typeof stat.dev !== "bigint" || typeof stat.ino !== "bigint" || stat.ino <= 0n
    || typeof stat.size !== "bigint" || typeof stat.mtimeNs !== "bigint" || typeof stat.ctimeNs !== "bigint") fail();
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function sameIdentity(expected, stat) {
  return stat.dev === expected.dev && stat.ino === expected.ino && stat.mode === expected.mode
    && stat.size === expected.size && stat.mtimeNs === expected.mtimeNs && stat.ctimeNs === expected.ctimeNs;
}

const lstatBig = value => lstat(value, { bigint: true });

function safeFileSize(size) {
  if (typeof size !== "bigint" || size < 0n || size > BigInt(MAX_FILE_BYTES)) fail();
  return Number(size);
}

function rawHeaderValues(request, name) {
  const values = [];
  const raw = request.rawHeaders;
  if (!Array.isArray(raw) || raw.length > 64) fail();
  for (let index = 0; index < raw.length; index += 2) {
    if (typeof raw[index] !== "string" || typeof raw[index + 1] !== "string") fail();
    if (raw[index].toLowerCase() === name) values.push(raw[index + 1]);
  }
  return values;
}

function safeSegment(value) {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".."
    && /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(value);
}

function routeTarget(target) {
  if (typeof target !== "string" || target.length === 0 || Buffer.byteLength(target, "utf8") > MAX_TARGET_BYTES
    || !target.startsWith("/") || target.startsWith("//") || /[?#%\\\x00-\x20\x7f]/.test(target)) return null;
  if (target === "/") return { relative: "index.html", contentType: "text/html; charset=utf-8", isIndex: true };
  const fixed = FIXED_FILES.get(target);
  if (fixed) return { relative: fixed[0], contentType: fixed[1], isIndex: false };
  if (!target.startsWith("/assets/")) return null;
  const relativeAsset = target.slice("/assets/".length);
  const segments = relativeAsset.split("/");
  if (!segments.length || segments.some(segment => !safeSegment(segment))) return null;
  const extension = path.posix.extname(segments.at(-1)).toLowerCase();
  const contentType = ASSET_EXTENSIONS.get(extension);
  if (!contentType) return null;
  return { relative: `assets/${segments.join("/")}`, contentType, isIndex: false };
}

function scriptHashes(html) {
  const hashes = new Set();
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  const normalizedHtml = html.replace(/\r\n?/g, "\n");
  while ((match = scripts.exec(normalizedHtml))) {
    if (/(?:^|\s)src(?:\s*=|\s|$)/i.test(match[1])) continue;
    const digest = createHash("sha256").update(match[2], "utf8").digest("base64");
    hashes.add(`'sha256-${digest}'`);
  }
  return [...hashes].sort();
}

function contentSecurityPolicy(hashes) {
  return [
    "default-src 'none'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "media-src 'self'",
  ].join("; ");
}

function writeEmpty(response, statusCode, headers = {}) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(statusCode, {
    "Content-Length": "0",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Connection: "close",
    ...headers,
  });
  response.end();
}

function validFraming(request) {
  const contentLengths = rawHeaderValues(request, "content-length");
  const transferEncodings = rawHeaderValues(request, "transfer-encoding");
  const expects = rawHeaderValues(request, "expect");
  if (contentLengths.length > 1 || transferEncodings.length > 0 || expects.length > 0) return false;
  return contentLengths.length === 0 || contentLengths[0] === "0";
}

/**
 * Serves only a trusted, bundled `ui-dist` tree on a private ephemeral loopback
 * origin. `assertCurrent` must synchronously return undefined while this window
 * is current and throw after its authority is revoked.
 */
export async function createSpsNativeWorkspaceAssets(options) {
  let rootInput;
  let assertCurrent;
  try {
    if (!options || typeof options !== "object" || Array.isArray(options)
      || Object.keys(options).some(key => !["root", "assertCurrent"].includes(key))) throw new Error();
    if (typeof options.root !== "string" || options.root.trim().length === 0
      || typeof options.assertCurrent !== "function") throw new Error();
    rootInput = path.resolve(options.root);
    assertCurrent = options.assertCurrent;
  } catch { fail(); }

  let disposed = false;
  const sockets = new Set();
  const activeHandlers = new Set();
  const requestQueue = [];
  const manifest = new Map();
  const directories = new Map();
  let activeRequests = 0;
  let scannedAssetEntries = 0;
  let totalAssetBytes = 0;
  let rootReal;
  let rootIdentity;
  let server;
  let disposePromise = null;
  let origin;
  let authority;
  let policy;

  async function checkCurrent() {
    if (disposed) fail();
    try {
      const current = assertCurrent();
      if (current !== undefined) {
        let then;
        try { then = current && (typeof current === "object" || typeof current === "function") ? current.then : undefined; }
        catch { fail(); }
        if (typeof then === "function") void Promise.resolve(current).catch(() => {});
        fail();
      }
    } catch { fail(); }
    if (disposed) fail();
    try {
      const now = await lstatBig(rootInput);
      if (!now.isDirectory() || now.isSymbolicLink() || !sameIdentity(rootIdentity, now)) fail();
      const resolved = await realpath(rootInput);
      if (!samePath(resolved, rootReal)) fail();
    } catch { fail(); }
  }

  async function inspectRoot() {
    const rootLstat = await lstatBig(rootInput);
    if (!rootLstat.isDirectory() || rootLstat.isSymbolicLink()) fail();
    rootReal = await realpath(rootInput);
    const rootStat = await lstatBig(rootReal);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail();
    rootIdentity = fileIdentity(rootStat);
    directories.set("", rootIdentity);
    if (!sameIdentity(rootIdentity, rootLstat)) fail();
  }

  async function inspectDirectory(relative, depth) {
    if (depth > MAX_ASSET_DEPTH) fail();
    const absolute = path.join(rootReal, ...relative.split("/").filter(Boolean));
    const entryStat = await lstatBig(absolute);
    if (!entryStat.isDirectory() || entryStat.isSymbolicLink()) fail();
    const resolved = await realpath(absolute);
    const rel = path.relative(rootReal, resolved);
    if (!samePath(resolved, absolute) || rel.startsWith("..") || path.isAbsolute(rel)) fail();
    directories.set(relative, fileIdentity(entryStat));
    const entries = await opendir(absolute);
    try {
      for await (const entry of entries) {
        scannedAssetEntries++;
        if (scannedAssetEntries > MAX_ASSET_FILES || !safeSegment(entry.name)) fail();
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        const childPath = path.join(rootReal, ...childRelative.split("/"));
        const childStat = await lstatBig(childPath);
        if (childStat.isSymbolicLink()) fail();
        if (childStat.isDirectory()) {
          if (!childRelative.startsWith("assets/")) fail();
          await inspectDirectory(childRelative, depth + 1);
          continue;
        }
        if (!childStat.isFile()) fail();
        if (!childRelative.startsWith("assets/")) continue;
        const contentType = ASSET_EXTENSIONS.get(path.posix.extname(entry.name).toLowerCase());
        if (!contentType) continue;
        const id = fileIdentity(childStat);
        const size = safeFileSize(id.size);
        totalAssetBytes += size;
        if (totalAssetBytes > MAX_ASSET_TREE_BYTES || manifest.size >= MAX_ASSET_FILES) fail();
        const canonical = await realpath(childPath);
        const pathInside = path.relative(rootReal, canonical);
        if (!samePath(canonical, childPath) || pathInside.startsWith("..") || path.isAbsolute(pathInside)) fail();
        manifest.set(childRelative, Object.freeze({ identity: id, contentType }));
      }
    } finally {
      await entries.close().catch(() => {});
    }
  }

  async function addFixed(relative, contentType, required = false) {
    const absolute = path.join(rootReal, relative);
    let stat;
    try { stat = await lstatBig(absolute); } catch (error) {
      if (!required && error?.code === "ENOENT") return;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) fail();
    const identity = fileIdentity(stat);
    safeFileSize(identity.size);
    const canonical = await realpath(absolute);
    const pathInside = path.relative(rootReal, canonical);
    if (!samePath(canonical, absolute) || pathInside.startsWith("..") || path.isAbsolute(pathInside)) fail();
    manifest.set(relative, Object.freeze({ identity, contentType }));
  }

  async function assertPathIdentity(relative, expected) {
    await checkCurrent();
    let parent = "";
    for (const segment of relative.split("/").slice(0, -1)) {
      parent = parent ? `${parent}/${segment}` : segment;
      const expectedDir = directories.get(parent);
      if (!expectedDir) fail();
      const dirPath = path.join(rootReal, ...parent.split("/"));
      const stat = await lstatBig(dirPath);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !sameIdentity(expectedDir, stat)) fail();
      const canonicalDir = await realpath(dirPath);
      if (!samePath(canonicalDir, dirPath)) fail();
    }
    const filePath = path.join(rootReal, ...relative.split("/"));
    const pathStat = await lstatBig(filePath);
    if (!pathStat.isFile() || pathStat.isSymbolicLink() || !sameIdentity(expected.identity, pathStat)) fail();
    const canonical = await realpath(filePath);
    const rel = path.relative(rootReal, canonical);
    if (!samePath(canonical, filePath) || rel.startsWith("..") || path.isAbsolute(rel)) fail();
    return filePath;
  }

  async function readSnapshot(relative, expected) {
    const filePath = await assertPathIdentity(relative, expected);
    let handle;
    try {
      const flags = fsConstants.O_RDONLY | (process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW ?? 0);
      handle = await open(filePath, flags);
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || !sameIdentity(expected.identity, before)) fail();
      const fileSize = safeFileSize(before.size);
      const chunks = [];
      let size = 0;
      while (size < fileSize) {
        const buffer = Buffer.alloc(Math.min(64 * 1024, fileSize - size));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, size);
        if (bytesRead <= 0) fail();
        size += bytesRead;
        if (size > MAX_FILE_BYTES) fail();
        chunks.push(buffer.subarray(0, bytesRead));
      }
      const after = await handle.stat({ bigint: true });
      if (!sameIdentity(expected.identity, after)) fail();
      await assertPathIdentity(relative, expected);
      return Buffer.concat(chunks, size);
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  function authorizedRequest(request) {
    const hosts = rawHeaderValues(request, "host");
    const cookies = rawHeaderValues(request, "cookie");
    const origins = rawHeaderValues(request, "origin");
    if (hosts.length !== 1 || hosts[0] !== authority || cookies.length !== 1
      || cookies[0] !== `${COOKIE_NAME}=${launchCookie.value}` || origins.length > 1
      || (origins.length === 1 && origins[0] !== origin)) return false;
    return true;
  }

  async function handle(request, response) {
    try {
      if (request.httpVersionMajor !== 1 || !validFraming(request)) {
        writeEmpty(response, 400);
        request.socket.destroySoon?.();
        return;
      }
      if (!authorizedRequest(request)) {
        writeEmpty(response, 403);
        return;
      }
      try { await checkCurrent(); } catch {
        writeEmpty(response, 403);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        writeEmpty(response, 405, { Allow: "GET, HEAD" });
        return;
      }
      const target = routeTarget(request.url);
      if (!target) {
        writeEmpty(response, 404);
        return;
      }
      const expected = manifest.get(target.relative);
      if (!expected) {
        writeEmpty(response, 404);
        return;
      }
      if (request.method === "HEAD") await assertPathIdentity(target.relative, expected);
      const body = request.method === "HEAD" ? null : await readSnapshot(target.relative, expected);
      try { await checkCurrent(); } catch {
        writeEmpty(response, 403);
        return;
      }
      const headers = {
        "Cache-Control": "no-store",
        "Content-Length": String(expected.identity.size),
        "Content-Security-Policy": policy,
        "Content-Type": target.contentType,
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      };
      response.writeHead(200, headers);
      if (body) response.end(body);
      else response.end();
    } catch {
      writeEmpty(response, 404);
      if (!response.writableEnded) response.destroy();
    }
  }

  function startRequest(request, response) {
    activeRequests++;
    let task;
    task = handle(request, response)
      .catch(() => writeEmpty(response, 404))
      .finally(() => {
        activeHandlers.delete(task);
        activeRequests--;
        pumpRequests();
      });
    activeHandlers.add(task);
  }

  function pumpRequests() {
    while (!disposed && activeRequests < MAX_ACTIVE_REQUESTS && requestQueue.length > 0) {
      const next = requestQueue.shift();
      clearTimeout(next.timer);
      startRequest(next.request, next.response);
    }
  }

  function dispatch(request, response) {
    if (disposed) {
      writeEmpty(response, 503);
      return;
    }
    if (activeRequests < MAX_ACTIVE_REQUESTS) {
      startRequest(request, response);
      return;
    }
    if (requestQueue.length >= MAX_QUEUED_REQUESTS) {
      writeEmpty(response, 503);
      return;
    }
    const queued = { request, response, timer: null };
    queued.timer = setTimeout(() => {
      const index = requestQueue.indexOf(queued);
      if (index < 0) return;
      requestQueue.splice(index, 1);
      writeEmpty(response, 503);
    }, MAX_QUEUE_WAIT_MS);
    queued.timer.unref?.();
    requestQueue.push(queued);
    response.once("close", () => {
      const index = requestQueue.indexOf(queued);
      if (index >= 0) requestQueue.splice(index, 1);
      clearTimeout(queued.timer);
    });
  }

  function onClientError(_error, socket) {
    if (!socket.destroyed) {
      try { socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); }
      catch { socket.destroy(); }
    }
  }

  const launchCookie = Object.freeze({
    name: COOKIE_NAME,
    value: randomBytes(32).toString("base64url"),
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
  if (!COOKIE_VALUE.test(launchCookie.value)) fail();

  function dispose() {
    if (disposePromise) return disposePromise;
    disposed = true;
    for (const socket of sockets) socket.destroy();
    for (const queued of requestQueue) clearTimeout(queued.timer);
    requestQueue.length = 0;
    disposePromise = (async () => {
      let closeFailure = null;
      if (server?.listening) {
        const closePromise = new Promise((resolve, reject) => {
          try { server.close(error => error ? reject(unavailable()) : resolve()); }
          catch { reject(unavailable()); }
        });
        try { await withDeadline(closePromise, CLOSE_TIMEOUT_MS); }
        catch { closeFailure = unavailable(); }
      }
      const handlers = [...activeHandlers];
      try { await withDeadline(Promise.allSettled(handlers), CLOSE_TIMEOUT_MS); }
      catch { closeFailure ??= unavailable(); }
      if (closeFailure) throw closeFailure;
    })();
    return disposePromise;
  }

  try {
    await inspectRoot();
    await checkCurrent();
    await addFixed("index.html", "text/html; charset=utf-8", true);
    for (const [, [relative, contentType]] of FIXED_FILES) {
      await addFixed(relative, contentType);
    }
    try {
      const assetsPath = path.join(rootReal, "assets");
      const assetStat = await lstatBig(assetsPath);
      if (!assetStat.isDirectory() || assetStat.isSymbolicLink()) fail();
      await inspectDirectory("assets", 0);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const index = await readSnapshot("index.html", manifest.get("index.html"));
    policy = contentSecurityPolicy(scriptHashes(new TextDecoder("utf-8", { fatal: true }).decode(index)));
    await checkCurrent();

    const addressPlaceholder = "127.0.0.1";
    server = http.createServer({ maxHeaderSize: 8192 }, dispatch);
    server.maxHeadersCount = 32;
    server.maxConnections = MAX_SOCKETS;
    server.headersTimeout = 5000;
    server.requestTimeout = 8000;
    server.timeout = 10_000;
    server.keepAliveTimeout = 1000;
    server.maxRequestsPerSocket = 100;
    server.on("clientError", onClientError);
    server.on("checkContinue", (request, response) => {
      writeEmpty(response, 417);
      request.socket.destroySoon?.();
    });
    server.on("checkExpectation", (request, response) => {
      writeEmpty(response, 417);
      request.socket.destroySoon?.();
    });
    server.on("error", () => {});
    server.on("connection", socket => {
      if (disposed || sockets.size >= MAX_SOCKETS) {
        socket.destroy();
        return;
      }
      sockets.add(socket);
      socket.setTimeout(10_000, () => socket.destroy());
      socket.once("close", () => sockets.delete(socket));
      socket.on("error", () => {});
    });
    await new Promise((resolve, reject) => {
      const onError = error => { server.removeListener("listening", onListening); reject(error); };
      const onListening = () => { server.removeListener("error", onError); resolve(); };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, addressPlaceholder);
    });
    const address = server.address();
    if (!address || typeof address === "string" || address.address !== addressPlaceholder
      || !Number.isInteger(address.port) || address.port < 1) fail();
    authority = `${addressPlaceholder}:${address.port}`;
    origin = `http://${authority}`;
    await checkCurrent();
  } catch {
    await dispose();
    throw unavailable();
  }

  return Object.freeze({
    origin,
    launchCookie,
    dispose,
  });
}
