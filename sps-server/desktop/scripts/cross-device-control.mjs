import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { promisify } from "node:util";
import { createCrossDeviceDesktopSession, requireCrossDeviceIdentityOrigin } from "./cross-device-desktop-session.mjs";
import { inspectCrossDeviceCandidate } from "./cross-device-candidate-guards.mjs";
import { createMockIdentityServer } from "./desktop-e2e-identity.mjs";
import { enableSpsTailscaleServe, disableSpsTailscaleServe, hasSpsTailscaleServeHandler } from "../src/team-access.mjs";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";

if (process.platform !== "win32" || process.argv.length !== 3 || process.argv[2] !== OWNED_JOB_CLEANUP_ARGUMENT) {
  throw new Error("Cross-device control requires the owned Windows test launcher.");
}

// PRIVATE operator channel over the existing pinned SSH connection. Its raw
// responses can include test addresses and must never be public release assets.
const exec = promisify(execFile);
let input;
let frameBytes = 0;
let session;
let identity;
let identityOrigin;
let fixtureRoot;
let role;
let started = false;
let team;
let previousId = 0;
let failed = false;
let closed = false;
process.stdin.on("data", chunk => {
  for (const byte of chunk) {
    frameBytes = byte === 10 ? 0 : frameBytes + 1;
    if (frameBytes > 128 * 1024) {
      failed = true;
      input.close();
      process.stdin.pause();
      break;
    }
  }
});
input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const write = value => new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify(value)}\n`,
  error => error ? reject(error) : resolve()));
const wait = async (check, limit = 30_000) => {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Cross-device fixture did not settle within its observation bound.");
};

async function serveStatus() {
  const executable = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Tailscale", "tailscale.exe");
  const { stdout } = await exec(executable, ["serve", "status", "--json"], {
    shell: false, windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024,
  });
  const status = JSON.parse(stdout);
  assert.ok(status && typeof status === "object" && !Array.isArray(status));
  return status;
}

async function finishSignIn(authorization) {
  const url = new URL(authorization);
  assert.equal(url.origin, requireCrossDeviceIdentityOrigin(identityOrigin));
  assert.equal(url.pathname, "/v1/desktop/authorize");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  await wait(async () => {
    const value = await session.setupAction("getStatus");
    return value.desktopAccount.signedIn === true && value.desktopAccount.pending === false;
  });
  return { signedIn: true, mockIdentity: true };
}

async function closeOwnedSession() {
  const errors = [];
  if (session && started && role === "host" && team) {
    try {
      const current = await serveStatus();
      // Empty is already disconnected. Any nonempty configuration must still
      // be the complete snapshot we created, not merely an owned root handler.
      if (Object.keys(current).length !== 0) assert.deepEqual(current, team.serve);
      await session.setupAction("disablePrivateTeamAccess");
      assert.deepEqual(await serveStatus(), {});
      team = undefined;
    } catch (error) { errors.push(error); }
  }
  if (session) {
    await session.stop().then(() => { started = false; }).catch(error => errors.push(error));
  }
  if (identity) await identity.close().catch(error => errors.push(error));
  if (errors.length) throw new Error("Cross-device cleanup is unconfirmed; preserve its owned fixture.");
  closed = true;
  return { closed: true };
}

async function action(request) {
  if (request.action === "close") return closeOwnedSession();
  if (request.action === "initialize") {
    assert.equal(session, undefined);
    assert.ok(request.role === "host" || request.role === "runner");
    await inspectCrossDeviceCandidate({ fixtureRoot: request.fixtureRoot, expected: request.expected });
    role = request.role;
    fixtureRoot = request.fixtureRoot;
    if (role === "host") {
      assert.deepEqual(await serveStatus(), {}, "The notebook test Host must not adopt an existing Serve configuration.");
      identity = createMockIdentityServer();
      identityOrigin = (await identity.start()).origin;
    } else identityOrigin = requireCrossDeviceIdentityOrigin(request.identityOrigin);
    session = await createCrossDeviceDesktopSession({ fixtureRoot, expected: request.expected, role, identityOrigin });
    return { initialized: true, role, identityOrigin, candidate: session.candidate };
  }
  assert.ok(session);
  if (request.action === "start") {
    assert.equal(started, false);
    await session.start();
    started = true;
    return { started: true, role };
  }
  assert.equal(started, true);
  if (request.action === "status") return session.setupAction("getStatus");
  if (request.action === "begin-sign-in") {
    await session.beginSignIn();
    if (role === "runner") return { pending: true };
    const authorization = await wait(() => identity.capturedAuthorizationUrls.shift());
    return finishSignIn(authorization);
  }
  if (request.action === "take-authorization") {
    assert.equal(role, "host");
    return { authorization: await wait(() => identity.capturedAuthorizationUrls.shift()) };
  }
  if (request.action === "finish-sign-in") {
    assert.equal(role, "runner");
    return finishSignIn(request.authorization);
  }
  if (request.action === "create-host") {
    assert.equal(role, "host");
    await session.setupAction("createOwnerServer");
    await session.verifyLoadedRuntime();
    return { hostCreated: true, loadedBaselineMatchesCandidate: true };
  }
  if (request.action === "api") {
    assert.equal(role, "host");
    return session.workspaceApi(request.path, request.options);
  }
  if (request.action === "install-reference") {
    assert.equal(role, "host");
    const directory = path.join(fixtureRoot, "reference-plugin");
    for (const file of ["package.json", "dist/manifest.js", "dist/worker.js"]) {
      const stat = await lstat(path.join(directory, file));
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0);
    }
    const manifest = await readFile(path.join(directory, "dist/manifest.js"), "utf8");
    assert.ok(manifest.includes('"local.runner-recovery-reference"'));
    return session.workspaceApi("/api/plugins/install", { method: "POST", body: { packageName: directory, isLocalPath: true } });
  }
  if (request.action === "enable-team") {
    assert.equal(role, "host");
    assert.equal(team, undefined);
    assert.deepEqual(await serveStatus(), {});
    const before = await session.setupAction("getStatus");
    const inspected = await session.setupAction("inspectTeamAccess");
    const hostname = inspected.tailnet.hostname;
    const ownerHostUrl = before.ownerHost.url;
    // Retain the exact intended route even if the real Main operation fails.
    team = { hostname, ownerHostUrl };
    const result = await session.setupAction("enablePrivateTeamAccess", { companyId: request.companyId });
    assert.equal((await session.setupAction("getStatus")).ownerHost.url, ownerHostUrl);
    assert.ok(before.profile.connectionKind === "owner-host");
    assert.equal(result.teamAccess.enabled, true);
    const serve = await serveStatus();
    assert.equal(hasSpsTailscaleServeHandler({ status: serve, hostname, ownerHostUrl }), true);
    team.serve = serve;
    return { teamAccess: result.teamAccess, loadedBaselineMatchesCandidate: true };
  }
  if (request.action === "connect-runner") {
    assert.equal(role, "runner");
    await session.setupAction("saveProfile", { hubUrl: request.hubUrl, companyId: request.companyId,
      displayName: "Cross-device isolated Runner", authMode: "sps-identity", defaultWorkspacePath: "" });
    const result = await session.setupAction("connectNode");
    return { node: result.node, verified: result.verified, runners: result.runners };
  }
  if (request.action === "pause-network") {
    assert.equal(role, "host");
    assert.ok(team);
    assert.deepEqual(await serveStatus(), team.serve);
    await disableSpsTailscaleServe({ hostname: team.hostname, ownerHostUrl: team.ownerHostUrl });
    assert.deepEqual(await serveStatus(), {});
    return { privateFixtureRouteDisconnected: true };
  }
  if (request.action === "resume-network") {
    assert.equal(role, "host");
    assert.ok(team);
    assert.deepEqual(await serveStatus(), {});
    await enableSpsTailscaleServe({ ownerHostUrl: team.ownerHostUrl });
    assert.deepEqual(await serveStatus(), team.serve);
    return { privateFixtureRouteRestored: true };
  }
  if (request.action === "stop") {
    assert.ok(role !== "host" || !team, "Close the owned sharing route before stopping its test Host.");
    const result = await session.stop();
    started = false;
    return result;
  }
  throw new Error("Unknown cross-device fixture action.");
}

await write({ crossDeviceControlReady: true });
try {
  for await (const line of input) {
    let request;
    try {
      assert.equal(failed, false);
      assert.ok(Buffer.byteLength(line) <= 128 * 1024);
      request = JSON.parse(line);
      assert.ok(Number.isSafeInteger(request.id) && request.id > previousId && request.id <= 100_000);
      previousId = request.id;
      assert.equal(typeof request.action, "string");
      const result = await action(request);
      await write({ crossDeviceControl: true, id: request.id, ok: true, result });
      if (closed) break;
    } catch {
      failed = true;
      await write({ crossDeviceControl: true, id: Number.isSafeInteger(request?.id) ? request.id : null,
        ok: false, error: "cross-device-fixture-action-failed" });
      break;
    }
  }
} finally {
  input.close();
  if (!closed) await closeOwnedSession().catch(() => { failed = true; });
}
await new Promise(resolve => process.stdout.write("", resolve));
process.exit(failed ? 1 : OWNED_JOB_CLEANUP_PENDING_EXIT_CODE);
