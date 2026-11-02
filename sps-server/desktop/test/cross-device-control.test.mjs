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

function invokeDuringReadyWrite() {
  const preload = `
    import readline from "node:readline";
    import { syncBuiltinESMExports } from "node:module";
    const create = readline.createInterface;
    const write = process.stdout.write.bind(process.stdout);
    let firstInputSeen = false;
    let releaseReady;
    const observe = value => process.stderr.write(JSON.stringify(value) + "\\n");
    readline.createInterface = options => {
      const input = create(options);
      const iterator = input[Symbol.asyncIterator].bind(input);
      let iteratorCreated = false;
      input[Symbol.asyncIterator] = () => {
        const result = iterator();
        if (!iteratorCreated) observe({ inputIteratorCreated: true });
        iteratorCreated = true;
        return result;
      };
      input.once("line", () => {
        firstInputSeen = true;
        observe({ firstInputHadIterator: iteratorCreated });
        if (releaseReady) { const callback = releaseReady; releaseReady = undefined; setImmediate(callback); }
      });
      return input;
    };
    // Publish ready, but hold its callback until the first input line is consumed.
    process.stdout.write = (chunk, ...args) => {
      if (typeof chunk === "string" && chunk.includes('"crossDeviceControlReady":true')) {
        const callback = args.at(-1);
        if (typeof callback !== "function") throw Error("Unexpected ready write shape.");
        return write(chunk, error => {
          if (error || firstInputSeen) setImmediate(() => callback(error));
          else releaseReady = () => callback();
        });
      }
      return write(chunk, ...args);
    };
    syncBuiltinESMExports();
  `;
  return new Promise(resolve => {
    const child = spawn(process.execPath, ["--import",
      `data:text/javascript;base64,${Buffer.from(preload).toString("base64")}`,
      entry, "--owned-job-cleanup-pending"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    let sent = false, rescueSent = false, timedOut = false, failure;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 5_000);
    child.stdout.setEncoding("utf8").on("data", chunk => {
      stdout += chunk;
      if (!sent && stdout.includes('"crossDeviceControlReady":true')) {
        sent = true;
        child.stdin.write('{"id":1,"action":"close"}\n');
      }
    });
    child.stderr.setEncoding("utf8").on("data", chunk => {
      stderr += chunk;
      if (!rescueSent && stderr.includes('"firstInputHadIterator":false')
        && stderr.includes('"inputIteratorCreated":true')) {
        // The original ordering loses id 1. Close that failed control naturally
        // with id 2; neither its exit nor its receipt can satisfy this regression.
        rescueSent = true;
        child.stdin.write('{"id":2,"action":"close"}\n');
      }
    });
    child.stdin.on("error", error => {
      if (error.code !== "EPIPE") { failure = error; child.kill(); }
    });
    child.once("error", error => { failure = error; });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, failure, rescueSent, stdinEnded: child.stdin.writableEnded });
    });
    // Keep stdin open through actual child close, not merely until its receipt.
  });
}

test("the first control frame survives a ready callback delayed until input, before stdin EOF", {
  skip: process.platform !== "win32",
}, async () => {
  const result = await invokeDuringReadyWrite();
  assert.equal(result.failure, undefined);
  assert.equal(result.timedOut, false);
  assert.equal(result.signal, null);
  assert.equal(result.code, 76, "Natural controller exit still requires external Job qualification.");
  assert.equal(result.stdinEnded, false, "The controller must close naturally without parent stdin EOF.");
  assert.deepEqual(result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line)), [
    { crossDeviceControlReady: true }, { crossDeviceControl: true, id: 1, ok: true, result: { closed: true } },
  ]);
  assert.equal(result.rescueSent, false, "A rescue receipt for id 2 cannot replace the lost first request.");
  assert.deepEqual(result.stderr.trim().split(/\r?\n/).map(line => JSON.parse(line)), [
    { inputIteratorCreated: true }, { firstInputHadIterator: true },
  ]);
});

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

test("Runner control prepares a fresh inert execution folder before connecting", async () => {
  const source = await readFile(entry, "utf8");
  const start = source.indexOf('if (request.action === "connect-runner")');
  const end = source.indexOf('if (request.action === "pause-network")', start);
  assert.ok(start >= 0 && end > start);
  const operation = source.slice(start, end);
  assert.match(operation, /assert\.equal\(role, "runner"\)/);
  assert.match(operation, /const defaultWorkspacePath = await prepareCrossDeviceRunnerWorkspace\(session\.profile\);\s*await session\.setupAction\("saveProfile",/);
  assert.match(operation, /authMode: "sps-identity", defaultWorkspacePath \}\);\s*const result = await session\.setupAction\("connectNode"\)/);
  assert.doesNotMatch(operation, /projectWorkspaces|workspaceSources|cwdHint/);
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
