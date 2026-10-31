import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entry = fileURLToPath(new URL("../scripts/cross-device-control.mjs", import.meta.url));
function invoke(input, args = ["--owned-job-cleanup-pending"]) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 5_000);
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    child.stdin.on("error", error => { if (error.code !== "EPIPE") reject(error); });
    child.on("error", reject);
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, timedOut }); });
    child.stdin.end(input);
  });
}

test("cross-device control rejects direct unowned invocation before readiness", async () => {
  const result = await invoke('', []);
  assert.equal(result.code, 1);
  assert.equal(result.timedOut, false);
  assert.doesNotMatch(result.stdout, /crossDeviceControlReady/);
});

test("Host control performs both public setup actions before any Workspace API observation", async () => {
  const source = await readFile(entry, "utf8");
  const renderer = await readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8");
  const start = source.indexOf('if (request.action === "create-host")');
  const end = source.indexOf('if (request.action === "api")', start);
  assert.ok(start >= 0 && end > start);
  const operation = source.slice(start, end);
  assert.match(operation, /assert\.equal\(role, "host"\)/);
  assert.match(operation, /await session\.setupAction\("createOwnerServer"\);\s*await session\.verifyLoadedRuntime\(\);[\s\S]*?await session\.setupAction\("openWorkspace"\)/);
  const rendererStart = renderer.indexOf('$("#create-owner-server").addEventListener');
  const rendererEnd = renderer.indexOf('\n$("#', rendererStart + 1);
  const actualHandler = renderer.slice(rendererStart, rendererEnd < 0 ? undefined : rendererEnd);
  assert.match(actualHandler, /await window\.spsDesktop\.createOwnerServer\(\)/);
  assert.doesNotMatch(actualHandler, /openWorkspace\(/, "Host creation alone must not be mistaken for opening a Workspace");
  assert.match(renderer, /\$\("#owner-open-workspace"\)\.addEventListener\("click",[\s\S]*?await window\.spsDesktop\.openWorkspace\(\)/);
});

test("an empty owned operator session closes without starting an app or listener", { skip: process.platform !== "win32" }, async () => {
  const result = await invoke('{"id":1,"action":"close"}\n');
  assert.equal(result.code, 76, "This is only pending external Job qualification, not a standalone pass.");
  assert.equal(result.signal, null);
  assert.equal(result.timedOut, false);
  assert.equal(result.stderr, "");
  assert.deepEqual(result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)), [
    { crossDeviceControlReady: true }, { crossDeviceControl: true, id: 1, ok: true, result: { closed: true } },
  ]);
});

test("unknown, malformed, invalid-ID or oversized operator frames fail without an app", { skip: process.platform !== "win32" }, async () => {
  for (const input of ['not-json\n', '{"id":1,"action":"unknown"}\n', '{"id":0,"action":"close"}\n',
    '{"id":1,"action":"initialize","role":"host","fixtureRoot":"C:\\\\Users","expected":{}}\n',
    'x'.repeat(131_073)]) {
    const result = await invoke(input);
    assert.equal(result.code, 1);
    assert.equal(result.signal, null);
    assert.equal(result.timedOut, false);
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /C:\\|token|localhost|@/);
    assert.doesNotMatch(result.stdout, /"ok":true/);
  }
});
