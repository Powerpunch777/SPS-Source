import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { Worker } from "node:worker_threads";
import { PassThrough } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { prepareWindowsHostJob } from "../src/windows-host-job.mjs";
import { removeOwnerHostJobGatePreload } from "../../desktop/src/owner-host-job-gate.mjs";

class FakeSocket extends EventEmitter {
  destroyed = false;
  writes = [];
  onWrite;
  connect() {
    setImmediate(() => this.emit("connect"));
  }
  write(value) {
    this.writes.push(value);
    this.onWrite(JSON.parse(value));
    return true;
  }
  send(value) {
    if (!this.destroyed) this.emit("data", Buffer.from(`${JSON.stringify(value)}\n`));
  }
  destroy() {
    if (this.destroyed) return this;
    this.destroyed = true;
    setImmediate(() => this.emit("close"));
    return this;
  }
}

function fakeChild(pid = 38124) {
  const child = new EventEmitter();
  Object.assign(child, { pid, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough(), stdio: [] });
  child.kill = () => true;
  return child;
}

async function createHarness({ failHello = false, failPrepared = false, delayReady = false, preparedGatePipe, preparedGateNonce } = {}) {
  let helperArgs;
  let spawned;
  const helper = new EventEmitter();
  Object.assign(helper, { killed: false, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
  helper.kill = () => {
    helper.killed = true;
    setImmediate(() => { helper.exitCode = 137; helper.emit("close", 137, null); });
    return true;
  };
  const socket = new FakeSocket();
  socket.onWrite = message => {
    const pipe = helperArgs[1];
    const nonce = helperArgs[3];
    const channel = `${process.pid}:${pipe}:${nonce}`;
    if (message.type === "prepare") {
      if (failHello) return;
      socket.send({ type: "prepared", gatePipe: preparedGatePipe ?? `${pipe}-gate`, gateNonce: preparedGateNonce ?? nonce });
    } else if (message.type === "attach") {
      spawned.attachPid = message.pid;
      if (!delayReady) socket.send({ type: "ready" });
    } else if (message.type === "cancel") {
      socket.send({ type: "cancelled", activeProcesses: 0 });
      setImmediate(() => {
        if (spawned) {
          spawned.child.exitCode = 125;
          spawned.child.signalCode = null;
          spawned.child.emit("close", 125, null);
        }
        helper.exitCode = 125;
        helper.signalCode = null;
        helper.emit("close", 125, null);
      });
    }
  };
  const controllerPromise = prepareWindowsHostJob({ gateModulePath: "C:\\SPS\\owner-host-job-gate.mjs", helperPath: "C:\\SPS\\SpsWindowsJobSupervisor.exe" }, {
    platform: "win32",
    access: async () => {},
    spawn: (_file, args) => { helperArgs = args; return helper; },
    connect: () => {
      const pipe = helperArgs[1];
      const nonce = helperArgs[3];
      setImmediate(() => {
        socket.emit("connect");
        setImmediate(() => socket.send({ type: failHello ? "not-hello" : "hello", nonce: `${process.pid}:${pipe}:${nonce}` }));
      });
      return socket;
    },
    spawnChild: (command, args, options) => {
      const child = fakeChild();
      spawned = { command, args, options, child };
      return child;
    },
    startupTimeoutMs: 500,
    terminalDrainTimeoutMs: 25,
    childCloseTimeoutMs: 50,
    failureKillGraceMs: 0,
  });
  let controller;
  if (failHello || failPrepared) await assert.rejects(controllerPromise, /Windows Host Job startup failed/);
  else controller = await controllerPromise;
  return { controller, helper, socket,
    sendReady: () => socket.send({ type: "ready" }),
    get helperArgs() { return helperArgs; }, get spawned() { return spawned; } };
}

test("prepares synchronously-spawnable Owner Host with gate import and preserves IPC and stop stdio", async () => {
  const harness = await createHarness();
  const stdio = ["ignore", "pipe", "pipe", "ipc", "pipe"];
  const child = harness.controller.spawn("node", ["owner-host.mjs"], {
    cwd: "C:\\SPS\\runtime", env: { PATH: "C:\\Windows", Existing: "yes" }, stdio, windowsHide: true,
  });
  assert.equal(child, harness.spawned.child);
  assert.equal(harness.spawned.command, "node");
  assert.equal(harness.spawned.args[0], "--import");
  assert.equal(harness.spawned.args[1], "file:///C:/SPS/owner-host-job-gate.mjs");
  assert.deepEqual(harness.spawned.args.slice(2), ["owner-host.mjs"]);
  assert.equal(harness.spawned.options.stdio, stdio);
  assert.equal(harness.spawned.options.env.Existing, "yes");
  assert.equal(harness.spawned.options.env.SPS_OWNER_HOST_JOB_PIPE, `${harness.helperArgs[1]}-gate`);
  assert.equal(harness.spawned.options.env.SPS_OWNER_HOST_JOB_NONCE, harness.helperArgs[3]);
  assert.equal(harness.spawned.options.env.SPS_OWNER_HOST_JOB_HELPER, "C:\\SPS\\SpsWindowsJobSupervisor.exe");
  assert.equal(harness.spawned.attachPid, child.pid);
  await child.supervisorReady;
  const result = await child.terminateOwnedJob();
  assert.deepEqual(result, { type: "cancelled", activeProcesses: 0 });
  assert.deepEqual(await child.waitForOwnedJobTermination(), result);
  assert.equal(child.hasUnconfirmedOwnedJobTermination(), false);
});

test("rejects bad helper authentication before returning a prepared controller", async () => {
  const harness = await createHarness({ failHello: true });
  assert.equal(harness.helper.killed, true);
});

test("retains an unconfirmed helper when the initial control-pipe connection fails", async () => {
  const helper = new EventEmitter();
  Object.assign(helper, { killed: false, exitCode: null, signalCode: null });
  helper.kill = () => { helper.killed = true; return true; };
  const socket = new FakeSocket();
  let failure;
  try {
    await prepareWindowsHostJob({ gateModulePath: "C:\\SPS\\owner-host-job-gate.mjs",
      helperPath: "C:\\SPS\\SpsWindowsJobSupervisor.exe" }, {
    platform: "win32",
    access: async () => {},
    spawn: () => helper,
    connect: () => socket,
    startupTimeoutMs: 10,
    failureKillGraceMs: 0,
    failureCloseTimeoutMs: 25,
    });
  } catch (error) { failure = error; }
  assert.equal(failure?.code, "owner_host_job_preparation_unconfirmed");
  assert.equal(failure?.ownedHostJob.hasUnconfirmedOwnedJobTermination(), true);
  assert.equal(helper.killed, true);
  helper.exitCode = 137;
  helper.emit("close", 137, null);
  assert.deepEqual(await failure.ownedHostJob.dispose(), { type: "disposed", activeProcesses: 0 });
  assert.equal(failure.ownedHostJob.hasUnconfirmedOwnedJobTermination(), false);
});

test("rejects a prepared gate endpoint or nonce not bound to this helper invocation", async () => {
  for (const options of [
    { failPrepared: true, preparedGateNonce: "a".repeat(64) },
    { failPrepared: true, preparedGatePipe: "\\\\.\\pipe\\attacker-gate" },
  ]) {
    const harness = await createHarness(options);
    assert.equal(harness.helper.killed, true);
  }
});

test("disposes a prepared but unspawned Job and confirms its empty helper lifetime", async () => {
  const harness = await createHarness();
  const dispose = harness.controller.dispose();
  assert.throws(() => harness.controller.spawn("node", ["owner-host.mjs"], {
    cwd: "C:\\SPS\\runtime", env: { PATH: "C:\\Windows" }, stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"],
  }), /not prepared for a child process/);
  assert.deepEqual(await dispose, { type: "cancelled", activeProcesses: 0 });
  await assert.rejects(harness.controller.supervisorReady, /child was not admitted/);
  assert.equal(harness.controller.hasUnconfirmedOwnedJobTermination(), false);
});

test("cancellation terminal before gate ready rejects readiness but still joins child and helper close", async () => {
  const harness = await createHarness({ delayReady: true });
  const child = harness.controller.spawn("node", ["owner-host.mjs"], {
    cwd: "C:\\SPS\\runtime", env: { PATH: "C:\\Windows" }, stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"],
  });
  const termination = child.terminateOwnedJob();
  await assert.rejects(child.supervisorReady, /child was not admitted/);
  assert.deepEqual(await termination, { type: "cancelled", activeProcesses: 0 });
  assert.deepEqual(await child.waitForOwnedJobTermination(), { type: "cancelled", activeProcesses: 0 });
  assert.equal(child.hasUnconfirmedOwnedJobTermination(), false);
});

test("removes only the admitted gate preload so Core workers do not inherit deleted gate credentials", () => {
  const argv = ["--import", "tsx/esm", "--import", "file:///C:/SPS/owner-host-job-gate.mjs", "--require", "./bootstrap.cjs"];
  assert.equal(removeOwnerHostJobGatePreload(argv, "file:///C:/SPS/owner-host-job-gate.mjs"), true);
  assert.deepEqual(argv, ["--import", "tsx/esm", "--require", "./bootstrap.cjs"]);
  assert.equal(removeOwnerHostJobGatePreload(argv, "file:///C:/SPS/owner-host-job-gate.mjs"), false);
  const inline = ["--import=file:///C:/SPS/owner-host-job-gate.mjs", "--import=tsx/esm"];
  assert.equal(removeOwnerHostJobGatePreload(inline, "file:///C:/SPS/owner-host-job-gate.mjs"), true);
  assert.deepEqual(inline, ["--import=tsx/esm"]);
});

test("a real file Worker can import the Host gate without re-adopting and removes its cached preload", async () => {
  const gateUrl = pathToFileURL(fileURLToPath(new URL("../../desktop/src/owner-host-job-gate.mjs", import.meta.url))).href;
  const workerEnv = { ...process.env };
  for (const name of ["SPS_OWNER_HOST_JOB_PIPE", "SPS_OWNER_HOST_JOB_NONCE", "SPS_OWNER_HOST_JOB_HELPER"]) {
    for (const key of Object.keys(workerEnv)) if (key.toUpperCase() === name) delete workerEnv[key];
  }
  const worker = new Worker(new URL("./fixtures/owner-host-job-gate-worker.mjs", import.meta.url), {
    env: workerEnv,
    execArgv: ["--trace-warnings", "--import", gateUrl],
  });
  try {
    const [message] = await once(worker, "message");
    assert.equal(message.kind, "worker-ran");
    assert.ok(message.execArgv.includes("--trace-warnings"));
    assert.ok(!message.execArgv.includes("--import"));
    assert.ok(!message.execArgv.includes(gateUrl));
  } finally {
    await worker.terminate();
  }
});
