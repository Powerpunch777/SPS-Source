import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
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
