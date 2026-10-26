import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorkspaceE2eChildTracker } from "../scripts/workspace-e2e-child-tracker.mjs";

function start(source, stdio = ["ignore", "pipe", "pipe"]) {
  return spawn(process.execPath, ["-e", source], { stdio });
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await once(child, "exit");
}

function counts(emitter, events) {
  return Object.fromEntries(events.map(event => [event, emitter.listenerCount(event)]));
}

async function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await readFile(filePath);
      return true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  return false;
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processExists(pid)) return true;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return !processExists(pid);
}

test("observes real exit and natural EOF for a successful child", async () => {
  const tracker = createWorkspaceE2eChildTracker();
  const child = start("process.stdout.write('out'); process.stderr.write('err')");
  tracker.track(child);
  try {
    await waitForExit(child);
    assert.deepEqual(await tracker.waitForOutputEnd(1000), {
      children: 1, exited: 1, orderly: 1, outputEnded: 2, outputFailed: 0,
    });
  } finally {
    tracker.dispose();
  }
});

test("counts a nonzero exit as exited but not orderly", async () => {
  const tracker = createWorkspaceE2eChildTracker();
  const child = start("process.exit(7)");
  tracker.track(child);
  try {
    await waitForExit(child);
    assert.deepEqual(await tracker.waitForOutputEnd(1000), {
      children: 1, exited: 1, orderly: 0, outputEnded: 2, outputFailed: 0,
    });
  } finally {
    tracker.dispose();
  }
});

test("retains every child across restart attempts", async () => {
  const tracker = createWorkspaceE2eChildTracker();
  try {
    for (let index = 0; index < 3; index += 1) {
      const child = start("process.stdout.write('restart')");
      tracker.track(child);
      await waitForExit(child);
      await tracker.waitForOutputEnd(1000);
    }
    assert.deepEqual(tracker.summarize(), {
      children: 3, exited: 3, orderly: 3, outputEnded: 6, outputFailed: 0,
    });
  } finally {
    tracker.dispose();
  }
});

test("parent exit does not imply inherited output EOF and dispose leaves the leaf alive", async () => {
  const tracker = createWorkspaceE2eChildTracker();
  const directory = await mkdtemp(path.join(os.tmpdir(), "workspace-e2e-child-tracker-"));
  const leafDone = path.join(directory, "leaf-done");
  const leafSource = `setTimeout(()=>{require('node:fs').writeFileSync(${JSON.stringify(leafDone)},'done');process.exit(0)},1000)`;
  const parentSource = `const {spawn}=require('node:child_process'); const leaf=spawn(process.execPath,['-e',${JSON.stringify(leafSource)}],{stdio:['ignore','inherit','inherit'],detached:true,windowsHide:true}); leaf.once('spawn',()=>{process.send({pid:leaf.pid}); setTimeout(()=>process.exit(0),80)}); leaf.once('error',error=>{process.send({error:error.message}); process.exit(1)})`;
  const child = start(
    parentSource,
    ["ignore", "pipe", "pipe", "ipc"],
  );
  tracker.track(child);
  try {
    const [message] = await once(child, "message");
    assert.ok(Number.isInteger(message.pid), message.error || "leaf process did not start");
    const leafPid = message.pid;
    assert.ok(Number.isInteger(leafPid));
    await waitForExit(child);
    const summary = await tracker.waitForOutputEnd(25);
    assert.equal(summary.exited, 1);
    assert.equal(summary.orderly, 1);
    assert.ok(summary.outputEnded < 2, `inherited descriptors must keep at least one stream open: ${JSON.stringify(summary)}`);
    assert.equal(child.stdout.destroyed, false);
    tracker.dispose();
    assert.equal(processExists(leafPid), true, "the detached leaf must still exist immediately after parent cleanup");
    assert.equal(child.stdout.destroyed, true);
    assert.equal(child.stderr.destroyed, true);
    tracker.dispose();
    assert.equal(await waitForFile(leafDone, 2000), true, "detached leaf must finish naturally after tracker disposal");
    assert.equal(await waitForProcessExit(leafPid, 5000), true, "leaf must exit naturally within the bound");
  } finally {
    tracker.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test("dispose preserves live main-process pipes and removes only tracker listeners", async () => {
  const tracker = createWorkspaceE2eChildTracker();
  const child = start("setTimeout(()=>process.stdout.write('done'),120)");
  const events = ["exit", "data", "end", "error", "close"];
  const foreign = () => {};
  child.on("exit", foreign);
  child.stdout.on("data", foreign);
  const childBaseline = counts(child, ["exit"]);
  const stdoutBaseline = counts(child.stdout, events.slice(1));
  try {
    tracker.track(child);
    assert.throws(() => tracker.track({ stdout: null, stderr: null }), TypeError);
    tracker.dispose();
    tracker.dispose();
    assert.equal(child.stdout.destroyed, false, "a live main process must keep its pipe");
    assert.deepEqual(counts(child, ["exit"]), childBaseline);
    assert.deepEqual(counts(child.stdout, events.slice(1)), stdoutBaseline);
  } finally {
    tracker.dispose();
    child.removeListener("exit", foreign);
    child.stdout.removeListener("data", foreign);
    await waitForExit(child);
  }
});

test("close without end fails output, duplicate tracking rejects, and dispose resolves waiters", async () => {
  const tracker = createWorkspaceE2eChildTracker();
  const child = start("setTimeout(()=>{},200)");
  tracker.track(child);
  assert.throws(() => tracker.track(child), /already tracked/);
  const pendingOutput = tracker.waitForOutputEnd(10000);
  try {
    const closed = once(child.stdout, "close");
    child.stdout.destroy();
    await closed;
    const summary = tracker.summarize();
    assert.equal(summary.outputEnded, 0);
    assert.equal(summary.outputFailed, 1);
    tracker.dispose();
    const resolved = await Promise.race([
      pendingOutput,
      new Promise((_, reject) => setTimeout(() => reject(new Error("dispose left output waiter pending")), 100)),
    ]);
    assert.equal(resolved.outputEnded, 0);
    assert.equal(resolved.outputFailed, 1);
  } finally {
    tracker.dispose();
    await waitForExit(child);
  }
});

test("rejects invalid wait bounds and reports missing streams as failures", async () => {
  const tracker = createWorkspaceE2eChildTracker();
  assert.throws(() => tracker.waitForOutputEnd(0), RangeError);
  assert.throws(() => tracker.waitForOutputEnd(10001), RangeError);
  assert.throws(() => tracker.waitForOutputEnd(1.5), RangeError);
  const child = start("process.exit(0)", "ignore");
  tracker.track(child);
  try {
    await waitForExit(child);
    assert.deepEqual(await tracker.waitForOutputEnd(), {
      children: 1, exited: 1, orderly: 1, outputEnded: 0, outputFailed: 2,
    });
  } finally {
    tracker.dispose();
  }
});
