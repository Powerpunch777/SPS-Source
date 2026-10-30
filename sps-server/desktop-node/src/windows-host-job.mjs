import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertWindowsJobSupervisorAvailable } from "./windows-job-supervisor.mjs";

const PIPE_PREFIX = "sps-host-job-";
const MAX_FRAME_BYTES = 4096;
const GATE_ENV = Object.freeze({
  pipe: "SPS_OWNER_HOST_JOB_PIPE",
  nonce: "SPS_OWNER_HOST_JOB_NONCE",
  helper: "SPS_OWNER_HOST_JOB_HELPER",
});

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sameWindowsExitCode(actual, expected) {
  return Number.isInteger(actual) && actual >= -2_147_483_648 && actual <= 0xffff_ffff
    && Number.isInteger(expected) && expected >= 0 && expected <= 0xffff_ffff
    && (actual >>> 0) === (expected >>> 0);
}

function parseFrames(socket, onFrame, onFailure, onClose = () => onFailure()) {
  let pending = Buffer.alloc(0);
  socket.on("data", chunk => {
    if (!Buffer.isBuffer(chunk) || chunk.length > MAX_FRAME_BYTES || pending.length + chunk.length > MAX_FRAME_BYTES) return onFailure();
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const newline = pending.indexOf(10);
      if (newline < 0) break;
      const frame = pending.subarray(0, newline);
      pending = pending.subarray(newline + 1);
      try { onFrame(JSON.parse(frame.toString("utf8"))); } catch { onFailure(); }
    }
  });
  socket.on("error", onFailure);
  socket.on("close", onClose);
}

async function connectPipe(address, connect, signal) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (signal.aborted) throw new Error("Windows Host Job startup failed.");
    let socket;
    try { socket = connect(address); }
    catch (error) { lastError = error; await delay(50); continue; }
    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          socket.off("connect", onConnect);
          socket.off("error", onError);
          signal.removeEventListener("abort", onAbort);
        };
        const onConnect = () => { cleanup(); resolve(); };
        const onError = error => { cleanup(); reject(error); };
        const onAbort = () => { cleanup(); reject(new Error("Windows Host Job startup failed.")); };
        if (signal.aborted) return onAbort();
        socket.once("connect", onConnect);
        socket.once("error", onError);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      return socket;
    } catch (error) {
      lastError = error;
      socket.destroy();
      if (signal.aborted) throw new Error("Windows Host Job startup failed.");
      await delay(50);
    }
  }
  throw lastError ?? new Error("Windows Host Job connection failed.");
}

function validateSpawn(command, args, options, pathApi) {
  if (typeof command !== "string" || !command || command.includes("\0") || !Array.isArray(args)
    || args.some(value => typeof value !== "string" || value.includes("\0"))
    || !options || typeof options !== "object" || Array.isArray(options)
    || typeof options.cwd !== "string" || !pathApi.isAbsolute(options.cwd)
    || !options.env || typeof options.env !== "object" || Array.isArray(options.env)
    || Object.entries(options.env).some(([key, value]) => !key || key.includes("=") || key.includes("\0")
      || typeof value !== "string" || value.includes("\0"))
    || !Array.isArray(options.stdio) || options.stdio[3] !== "ipc" || options.stdio.length < 5) {
    throw new TypeError("Invalid Windows Owner Host process invocation.");
  }
}

export async function prepareWindowsHostJob({ gateModulePath, helperPath }, internal = {}) {
  const emit = event => {
    try { internal.onEvent?.(event); } catch { /* Diagnostics must not change ownership decisions. */ }
  };
  const platform = internal.platform ?? process.platform;
  if (platform !== "win32") throw new Error("Windows Host Job supervision is unavailable on this platform.");
  const pathApi = path.win32;
  if (typeof gateModulePath !== "string" || !pathApi.isAbsolute(gateModulePath)) {
    throw new Error("Windows Host Job gate is unavailable.");
  }
  const helper = helperPath ?? await assertWindowsJobSupervisorAvailable({ platform });
  if (typeof helper !== "string" || !pathApi.isAbsolute(helper)) throw new Error("Windows Host Job helper is unavailable.");
  try {
    const checkAccess = internal.access ?? access;
    await checkAccess(gateModulePath);
    await checkAccess(helper);
  } catch {
    throw new Error("Windows Host Job supervision assets are unavailable.");
  }

  const pipe = `${PIPE_PREFIX}${process.pid}-${randomBytes(24).toString("hex")}`;
  const nonce = randomBytes(32).toString("hex");
  const channelNonce = `${process.pid}:${pipe}:${nonce}`;
  const abort = new AbortController();
  const helperChild = (internal.spawn ?? nodeSpawn)(helper, ["--supervise-host", pipe, String(process.pid), nonce], {
    cwd: pathApi.dirname(helper),
    env: { SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows", WINDIR: process.env.WINDIR ?? "C:\\Windows", PATH: process.env.PATH ?? "" },
    shell: false, windowsHide: true, stdio: ["ignore", "ignore", "ignore"],
  });
  emit("helper-spawned");

  let socket;
  let terminal;
  let helperCloseInfo;
  let failureLatched = false;
  let unconfirmed = false;
  let cancelSent = false;
  let phase = "hello";
  let childAttached = false;
  let ready = false;
  let readyResolve, readyReject, terminalResolve, terminalReject, closeResolve, closeReject, helperProcessCloseResolve;
  let preparedResolve, preparedReject;
  let startupTimer, terminalTimer, killTimer, cancellationTimer;
  const preparedPromise = new Promise((resolve, reject) => { preparedResolve = resolve; preparedReject = reject; });
  const supervisorReady = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const supervisorTerminal = new Promise((resolve, reject) => { terminalResolve = resolve; terminalReject = reject; });
  const helperClosed = new Promise((resolve, reject) => { closeResolve = resolve; closeReject = reject; });
  const helperProcessClosed = new Promise(resolve => { helperProcessCloseResolve = resolve; });
  void supervisorReady.catch(() => {});
  void preparedPromise.catch(() => {});
  void supervisorTerminal.catch(() => {});
  void helperClosed.catch(() => {});

  function killExactHelper() {
    if (!helperChild.killed && helperChild.exitCode === null && helperChild.signalCode === null) {
      try { helperChild.kill(); } catch { /* The result remains unconfirmed. */ }
    }
  }

  function fail() {
    if (failureLatched) return;
    failureLatched = true;
    emit("failure-latched");
    unconfirmed = true;
    abort.abort();
    clearTimeout(cancellationTimer);
    const error = new Error(phase === "hello" || phase === "prepared" ? "Windows Host Job startup failed." : "Windows Host Job termination is unconfirmed.");
    if (!childAttached) {
      preparedReject(error);
      readyReject(error);
    } else if (!terminal) readyReject(new Error("Windows Host Job startup failed."));
    if (!terminal) terminalReject(new Error("Windows Host Job termination is unconfirmed."));
    closeReject(new Error("Windows Host Job termination is unconfirmed."));
    if (socket && !socket.destroyed) socket.destroy();
    if (helperChild.exitCode === null && helperChild.signalCode === null) {
      killTimer = setTimeout(killExactHelper, internal.failureKillGraceMs ?? 1_000);
      killTimer.unref?.();
    }
  }

  function confirmHelperClose() {
    clearTimeout(terminalTimer);
    if (!helperCloseInfo || !terminal) return;
    const expected = terminal.type === "cancelled" ? 125 : terminal.code;
    if (helperCloseInfo.signal !== null || !sameWindowsExitCode(helperCloseInfo.code, expected) || failureLatched) {
      failureLatched = true;
      unconfirmed = true;
      closeReject(new Error("Windows Host Job termination is unconfirmed."));
      return;
    }
    closeResolve(helperCloseInfo);
    emit("helper-close-confirmed");
  }

  function acceptTerminal(message) {
    terminal = message;
    emit(message.type === "cancelled" ? "terminal-cancelled" : "terminal-exit");
    clearTimeout(startupTimer);
    clearTimeout(cancellationTimer);
    if (!ready) readyReject(new Error("Windows Host Job child was not admitted."));
    terminalResolve(message);
    if (helperCloseInfo) return confirmHelperClose();
    terminalTimer = setTimeout(() => fail(), internal.helperCloseTimeoutMs ?? 5_000);
    terminalTimer.unref?.();
  }

  helperChild.once("error", () => fail());
  helperChild.once("close", (code, signal) => {
    clearTimeout(startupTimer);
    clearTimeout(terminalTimer);
    clearTimeout(killTimer);
    helperCloseInfo = { code, signal };
    emit("helper-process-close");
    helperProcessCloseResolve({ code, signal });
    if (terminal) return confirmHelperClose();
    terminalTimer = setTimeout(() => fail(), internal.terminalDrainTimeoutMs ?? 250);
    terminalTimer.unref?.();
  });
  startupTimer = setTimeout(() => fail(), internal.startupTimeoutMs ?? 15_000);
  startupTimer.unref?.();

  let childClosePromise;
  let terminationPromise;
  let disposePromise;
  const controller = {
    supervisorReady,
    supervisorTerminal,
    terminateOwnedJob,
    waitForOwnedJobTermination,
    hasUnconfirmedOwnedJobTermination: () => unconfirmed,
    dispose() {
      if (!disposePromise) disposePromise = failureLatched && !childAttached
        ? disposeFailedPreparation()
        : terminateOwnedJob();
      return disposePromise;
    },
    spawn(command, args, options) {
      if (childAttached || cancelSent || terminationPromise || disposePromise || terminal || failureLatched || phase !== "attach") {
        throw new Error("Windows Host Job is not prepared for a child process.");
      }
      validateSpawn(command, args, options, pathApi);
      const gatePipe = controller._gatePipe;
      const gateNonce = controller._gateNonce;
      const env = { ...options.env };
      for (const name of Object.values(GATE_ENV)) {
        for (const key of Object.keys(env)) if (key.toUpperCase() === name) delete env[key];
      }
      env[GATE_ENV.pipe] = gatePipe;
      env[GATE_ENV.nonce] = gateNonce;
      env[GATE_ENV.helper] = helper;
      const gateUrl = pathToFileURL(gateModulePath).href;
      const child = (internal.spawnChild ?? nodeSpawn)(command, ["--import", gateUrl, ...args], { ...options, env });
      childAttached = true;
      emit("core-spawned");
      childClosePromise = new Promise(resolve => child.once("close", (code, signal) => {
        emit("core-process-close");
        resolve({ code, signal });
      }));
      void childClosePromise.catch(() => {});
      child.supervisorReady = supervisorReady;
      child.supervisorTerminal = supervisorTerminal;
      child.terminateOwnedJob = terminateOwnedJob;
      child.waitForOwnedJobTermination = waitForOwnedJobTermination;
      child.hasUnconfirmedOwnedJobTermination = () => unconfirmed;
      if (!Number.isSafeInteger(child.pid) || child.pid < 1) {
        fail();
        return child;
      }
      try {
        socket.write(`${JSON.stringify({ type: "attach", pid: child.pid })}\n`);
        emit("attach-sent");
      }
      catch { fail(); }
      return child;
    },
  };

  try {
    socket = await connectPipe(`\\\\.\\pipe\\${pipe}`, internal.connect ?? net.createConnection, abort.signal);
    emit("control-pipe-connected");
  } catch {
    fail();
  }
  if (socket) {
    parseFrames(socket, message => {
    if (failureLatched || terminal) return fail();
    if (phase === "hello") {
      if (!exactKeys(message, ["type", "nonce"]) || message.type !== "hello" || message.nonce !== channelNonce) return fail();
      phase = "prepared";
      emit("helper-hello");
      try { socket.write(`${JSON.stringify({ type: "prepare", nonce: channelNonce })}\n`); }
      catch { fail(); }
      return;
    }
    if (phase === "prepared") {
      if (!exactKeys(message, ["type", "gatePipe", "gateNonce"]) || message.type !== "prepared"
        || message.gatePipe !== `${pipe}-gate` || message.gateNonce !== nonce) return fail();
      phase = "attach";
      emit("helper-prepared");
      controller._gatePipe = message.gatePipe;
      controller._gateNonce = message.gateNonce;
      preparedResolve();
      return;
    }
    if (phase === "attach" && message.type === "ready") {
      if (!exactKeys(message, ["type"]) || !childAttached) return fail();
      phase = "running";
      ready = true;
      emit("helper-ready");
      clearTimeout(startupTimer);
      readyResolve();
      return;
    }
    if (phase !== "running" && phase !== "attach") return fail();
    if (message.type === "exit") {
      if (phase !== "running" || !childAttached || !exactKeys(message, ["type", "code", "activeProcesses"]) || message.activeProcesses !== 0
        || !Number.isInteger(message.code) || message.code < 0 || message.code > 0xffff_ffff) return fail();
      acceptTerminal(message);
      return;
    }
    if (message.type === "cancelled") {
      if (!cancelSent || !exactKeys(message, ["type", "activeProcesses"]) || message.activeProcesses !== 0) return fail();
      acceptTerminal(message);
      return;
    }
    if (message.type === "error" && exactKeys(message, ["type", "code", "stage", "category"])
      && message.code === "supervisor-failed"
      && new Set(["host-control-connect", "host-authenticate-client", "host-prepare", "host-create-job", "host-create-gate",
        "host-wait-attach", "host-control-failure", "host-wait-gate", "host-verify-process", "host-assign-job",
        "host-report-ready", "host-wait-process", "host-confirm-job-empty"]).has(message.stage)
      && new Set(["timeout", "access", "security", "io", "argument", "win32", "invalid-data", "other"]).has(message.category)) return fail();
    fail();
    }, fail, () => {
      emit("control-pipe-close");
      if (!terminal) fail();
    });
    socket.on("error", () => { if (!terminal) fail(); });
  }

  async function terminateOwnedJobOnce() {
    if (phase === "hello" || phase === "prepared") await preparedPromise;
    if (terminal) return waitForOwnedJobTermination();
    if (!socket || socket.destroyed) { fail(); throw new Error("Windows Host Job termination is unconfirmed."); }
    const priorPhase = phase;
    if (!childAttached && priorPhase !== "attach") throw new Error("Windows Host Job is not prepared for cancellation.");
    cancelSent = true;
    emit("cancel-sent");
    cancellationTimer = setTimeout(() => fail(), internal.cancellationTimeoutMs ?? 25_000);
    cancellationTimer.unref?.();
    try { socket.write('{"type":"cancel"}\n'); }
    catch { fail(); throw new Error("Windows Host Job termination is unconfirmed."); }
    await supervisorTerminal;
    return waitForOwnedJobTermination();
  }

  async function waitForOwnedJobTermination() {
    const result = terminal ?? await supervisorTerminal;
    await helperClosed;
    if (childClosePromise) {
      let timer;
      try {
        await Promise.race([childClosePromise, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Windows Host Job child exit is unconfirmed.")), internal.childCloseTimeoutMs ?? 15_000);
          timer.unref?.();
        })]);
      } catch {
        unconfirmed = true;
        throw new Error("Windows Host Job child exit is unconfirmed.");
      } finally { clearTimeout(timer); }
    }
    if (unconfirmed) throw new Error("Windows Host Job termination is unconfirmed.");
    return result;
  }

  function terminateOwnedJob() {
    if (!terminationPromise) terminationPromise = terminateOwnedJobOnce();
    return terminationPromise;
  }

  function preparationUnconfirmedError() {
    const error = new Error("Windows Host Job preparation is unconfirmed; the owned helper must be retained.");
    error.code = "owner_host_job_preparation_unconfirmed";
    error.ownedHostJob = controller;
    return error;
  }

  async function disposeFailedPreparation() {
    killExactHelper();
    let timer;
    try {
      await Promise.race([helperProcessClosed, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Windows Host Job helper close is unconfirmed.")), internal.failureCloseTimeoutMs ?? 2_000);
        timer.unref?.();
      })]);
    } catch {
      unconfirmed = true;
      throw preparationUnconfirmedError();
    } finally { clearTimeout(timer); }
    unconfirmed = false;
    return { type: "disposed", activeProcesses: 0 };
  }

  try {
    await preparedPromise;
  } catch {
    let timer;
    let helperClosedNormally = false;
    try {
      await Promise.race([helperProcessClosed, new Promise(resolve => {
        timer = setTimeout(resolve, internal.failureCloseTimeoutMs ?? 2_000);
        timer.unref?.();
      })]);
      helperClosedNormally = helperCloseInfo !== undefined;
    } finally { clearTimeout(timer); }
    if (!helperClosedNormally) {
      unconfirmed = true;
      throw preparationUnconfirmedError();
    }
    throw new Error("Windows Host Job startup failed.");
  }
  return Object.freeze(controller);
}
