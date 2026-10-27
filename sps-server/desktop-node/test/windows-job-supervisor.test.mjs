import assert from "node:assert/strict";
import { spawn as nodeSpawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { assertWindowsJobSupervisorAvailable, spawnWindowsJobSupervisor } from "../src/windows-job-supervisor.mjs";
import { createWorkspaceE2eFixture } from "../../desktop/scripts/workspace-e2e-fixture.mjs";

test("Windows command supervision rejects unsupported platforms and invalid invocations", async () => {
  assert.throws(() => spawnWindowsJobSupervisor({}, { platform: "linux" }), /unavailable on this platform/);
  assert.throws(() => spawnWindowsJobSupervisor({ executable: "relative.exe", args: [], cwd: "C:\\", env: {} }, { platform: "win32" }), /Invalid Windows supervised command/);
});

const skipWindows = process.platform !== "win32";
const canaryTimeoutMs = 45_000;

async function createFixture(script, fileName = "owned-fixture.cmd") {
  const fixture = await createWorkspaceE2eFixture();
  const file = path.join(fixture.directory, fileName);
  await writeFile(file, script, { encoding: "utf8", flag: "wx" });
  return { fixture, file };
}

async function waitForCanaryClose(close, label, timeoutMs = 15_000) {
  let timer;
  try {
    return await Promise.race([
      close,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} did not close before the canary deadline.`)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

function commandEnvironment() {
  return {
    SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows",
    WINDIR: process.env.WINDIR ?? "C:\\Windows",
    PATH: process.env.PATH ?? "",
    COMSPEC: process.env.COMSPEC ?? path.join(process.env.SYSTEMROOT ?? "C:\\Windows", "System32", "cmd.exe"),
  };
}

async function runFixture(script, cancel) {
  const { fixture, file } = await createFixture(script);
  let child;
  let close;
  let closeInfo;
  let helperFailureStage;
  try {
    await assertWindowsJobSupervisorAvailable();
    child = spawnWindowsJobSupervisor({ executable: commandEnvironment().COMSPEC, args: ["/d", "/c", file], cwd: fixture.directory, env: commandEnvironment() });
    close = once(child, "close");
    void close.catch(() => {});
    child.stdout.resume();
    child.stderr.on("data", chunk => {
      const match = /Windows command supervision failed \(([a-z-]+),([a-z-]+)\)\./.exec(chunk.toString("utf8"));
      if (match) helperFailureStage = `${match[1]},${match[2]}`;
    });
    child.once("close", (code, signal) => { closeInfo = { code, signal }; });
    child.stderr.resume();
    await child.supervisorReady;
    if (cancel) {
      await child.terminateOwnedJob();
      assert.deepEqual(await child.waitForOwnedJobTermination(), { type: "cancelled", activeProcesses: 0 });
    } else {
      const [code, signal] = await waitForCanaryClose(close, "Command Prompt CLI");
      assert.equal(signal, null);
      assert.equal(code, 0);
      assert.deepEqual(await child.waitForOwnedJobTermination(), { type: "exit", code: 0, activeProcesses: 0 });
    }
    if (cancel) {
      const [code, signal] = await waitForCanaryClose(close, "Node CLI");
      assert.equal(signal, null);
      assert.equal(code, 125);
    }
  } catch (error) {
    error.message += ` (helperExit=${closeInfo?.code ?? "pending"}, helperFailureStage=${helperFailureStage ?? "none"})`;
    throw error;
  } finally {
    if (child && child.exitCode === null) {
      try { await child.terminateOwnedJob(); } catch { /* Preserve the canary failure; helper must close before fixture cleanup. */ }
      if (child.exitCode === null && close) {
        let timer;
        try {
          await Promise.race([
            close,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Owned Windows supervisor did not close; fixture preserved.")), 25_000); }),
          ]);
        } finally { clearTimeout(timer); }
      }
    }
    await fixture.assertCurrent();
    await fixture.remove();
  }
}

function nodeCommandEnvironment() {
  return {
    SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows",
    WINDIR: process.env.WINDIR ?? "C:\\Windows",
    PATH: `${process.env.SYSTEMROOT ?? "C:\\Windows"}\\System32;${process.env.SYSTEMROOT ?? "C:\\Windows"}`,
  };
}

async function runNodeFixture(script, { cancel = false, stdin = "", expectedStdout = "", expectedStderr = "" } = {}) {
  const { fixture, file } = await createFixture(script, "owned-node-cli.mjs");
  let child;
  let close;
  let stdout = "";
  let stderr = "";
  let closeInfo;
  let helperFailureStage;
  try {
    await assertWindowsJobSupervisorAvailable();
    child = spawnWindowsJobSupervisor({
      executable: process.execPath,
      args: [file],
      cwd: fixture.directory,
      env: nodeCommandEnvironment(),
    });
    close = once(child, "close");
    void close.catch(() => {});
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => {
      stderr += chunk;
      const match = /Windows command supervision failed \(([a-z-]+),([a-z-]+)\)\./.exec(chunk);
      if (match) helperFailureStage = `${match[1]},${match[2]}`;
    });
    child.once("close", (code, signal) => { closeInfo = { code, signal }; });
    await child.supervisorReady;
    child.stdin.end(stdin);
    if (cancel) {
      await child.terminateOwnedJob();
      assert.deepEqual(await child.waitForOwnedJobTermination(), { type: "cancelled", activeProcesses: 0 });
      const [code, signal] = await waitForCanaryClose(close, "canceled Node supervisor");
      assert.equal(signal, null);
      assert.equal(code, 125);
    } else {
      const [code, signal] = await waitForCanaryClose(close, "natural Node supervisor");
      assert.equal(signal, null);
      assert.equal(code, 0);
      assert.deepEqual(await child.waitForOwnedJobTermination(), { type: "exit", code: 0, activeProcesses: 0 });
    }
    assert.equal(stdout, expectedStdout);
    assert.equal(stderr, expectedStderr);
  } catch (error) {
    error.message += ` (helperExit=${closeInfo?.code ?? "pending"}, helperFailureStage=${helperFailureStage ?? "none"})`;
    throw error;
  } finally {
    if (child && child.exitCode === null) {
      try { await child.terminateOwnedJob(); } catch { /* Preserve the canary failure; helper must close before fixture cleanup. */ }
      if (child.exitCode === null && close) {
        let timer;
        try {
          await Promise.race([
            close,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Owned Windows supervisor did not close; fixture preserved.")), 25_000); }),
          ]);
        } finally { clearTimeout(timer); }
      }
    }
    await fixture.assertCurrent();
    await fixture.remove();
  }
}

test("natural CLI exit kills its remaining descendant job and confirms zero active processes", { skip: skipWindows, timeout: canaryTimeoutMs }, async () => {
  await runFixture('@echo off\r\nstart "" /b "%COMSPEC%" /d /c "ping -n 30 127.0.0.1 >nul"\r\nexit /b 0\r\n', false);
});

test("cancellation terminates the owned job and acknowledges active-process zero", { skip: skipWindows, timeout: canaryTimeoutMs }, async () => {
  await runFixture('@echo off\r\nping -n 30 127.0.0.1 >nul\r\nexit /b 0\r\n', true);
});

test("Node CLI inherits stdin/stdout/stderr and natural exit confirms active-process zero", { skip: skipWindows, timeout: canaryTimeoutMs }, async () => {
  const script = [
    'import { spawn as nodeSpawn } from "node:child_process";',
    'let input = "";',
    'process.stdin.setEncoding("utf8");',
    'process.stdin.on("data", chunk => { input += chunk; });',
    'process.stdin.on("end", () => { const descendant = nodeSpawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" }); descendant.unref(); process.stdout.write(`node-stdout:${input}\\n`); process.stderr.write("node-stderr:ready\\n"); });',
    "",
  ].join("\n");
  await runNodeFixture(script, { stdin: "unicode-λ-input", expectedStdout: "node-stdout:unicode-λ-input\n", expectedStderr: "node-stderr:ready\n" });
});

test("long-running Node CLI cancellation confirms active-process zero", { skip: skipWindows, timeout: canaryTimeoutMs }, async () => {
  await runNodeFixture('import { spawn as nodeSpawn } from "node:child_process";\nconst descendant = nodeSpawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });\ndescendant.unref();\nsetInterval(() => {}, 1000);\n', { cancel: true });
});
