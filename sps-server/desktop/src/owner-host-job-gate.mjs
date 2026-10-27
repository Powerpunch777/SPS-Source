import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";
import path from "node:path";
import { isMainThread } from "node:worker_threads";

const ENV_NAMES = Object.freeze({ pipe: "SPS_OWNER_HOST_JOB_PIPE", nonce: "SPS_OWNER_HOST_JOB_NONCE", helper: "SPS_OWNER_HOST_JOB_HELPER" });
const MAX_FRAME_BYTES = 512;

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function removeOwnerHostJobGatePreload(execArgv, gateUrl) {
  if (!Array.isArray(execArgv) || typeof gateUrl !== "string") return false;
  for (let index = 0; index < execArgv.length - 1; index += 1) {
    if (execArgv[index] === "--import" && execArgv[index + 1] === gateUrl) {
      execArgv.splice(index, 2);
      return true;
    }
  }
  const inline = `--import=${gateUrl}`;
  const index = execArgv.indexOf(inline);
  if (index < 0) return false;
  execArgv.splice(index, 1);
  return true;
}

async function connectPipe(address) {
  let lastError;
  const deadline = Date.now() + 15_000;
  for (let attempt = 0; attempt < 100 && Date.now() < deadline; attempt += 1) {
    let socket;
    try { socket = net.createConnection(address); }
    catch (error) { lastError = error; await delay(100); continue; }
    try {
      await new Promise((resolve, reject) => {
        const finish = error => {
          clearTimeout(timer);
          socket.off("connect", onConnect);
          socket.off("error", onError);
          error ? reject(error) : resolve();
        };
        const onConnect = () => finish();
        const onError = error => finish(error);
        const timer = setTimeout(() => finish(new Error("Host Job gate connection timed out.")), Math.max(1, deadline - Date.now()));
        socket.once("connect", onConnect);
        socket.once("error", onError);
      });
      return socket;
    } catch (error) {
      lastError = error;
      socket.destroy();
      await delay(100);
    }
  }
  throw lastError ?? new Error("Host Job gate connection failed.");
}

async function attestGate() {
  const values = {};
  let present = false;
  const gatePreloadPresent = process.execArgv.some((value, index, args) => value === "--import" && args[index + 1] === import.meta.url)
    || process.execArgv.includes(`--import=${import.meta.url}`);
  for (const [key, value] of Object.entries(process.env)) {
    const name = Object.values(ENV_NAMES).find(candidate => candidate.toUpperCase() === key.toUpperCase());
    if (!name) continue;
    present = true;
    values[name] = value;
    delete process.env[key];
  }
  if (!isMainThread) {
    removeOwnerHostJobGatePreload(process.execArgv, import.meta.url);
    return;
  }
  if (!present) {
    if (gatePreloadPresent) throw new Error("Host Job gate configuration is missing.");
    return;
  }
  const pipe = values[ENV_NAMES.pipe];
  const nonce = values[ENV_NAMES.nonce];
  const helper = values[ENV_NAMES.helper];
  if (process.platform !== "win32" || typeof pipe !== "string" || !/^sps-host-job-[0-9]+-[0-9a-f]{48}-gate$/.test(pipe)
    || typeof nonce !== "string" || !/^[0-9a-f]{64}$/.test(nonce)
    || typeof helper !== "string" || !path.win32.isAbsolute(helper)) throw new Error("Host Job gate configuration is invalid.");

  const creationTime = execFileSync(helper, ["--process-creation", String(process.pid)], {
    encoding: "utf8", windowsHide: true, timeout: 5_000, maxBuffer: 128, stdio: ["ignore", "pipe", "ignore"],
    env: {
      SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows",
      WINDIR: process.env.WINDIR ?? "C:\\Windows",
      PATH: process.env.PATH ?? "",
    },
  }).trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(creationTime)) throw new Error("Host Job process identity is unavailable.");

  const socket = await connectPipe(`\\\\.\\pipe\\${pipe}`);
  try {
    await new Promise((resolve, reject) => {
      let pending = Buffer.alloc(0);
      let settled = false;
      const timer = setTimeout(() => finish(new Error("Host Job gate admission timed out.")), 15_000);
      timer.unref?.();
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("close", onClose);
        error ? reject(error) : resolve();
      };
      const onError = () => finish(new Error("Host Job gate connection failed."));
      const onClose = () => finish(new Error("Host Job gate closed before admission."));
      const onData = chunk => {
        if (!Buffer.isBuffer(chunk) || chunk.length > MAX_FRAME_BYTES || pending.length + chunk.length > MAX_FRAME_BYTES) {
          finish(new Error("Host Job gate protocol failed."));
          return;
        }
        pending = Buffer.concat([pending, chunk]);
        const newline = pending.indexOf(10);
        if (newline < 0) return;
        if (newline !== pending.length - 1) return finish(new Error("Host Job gate protocol failed."));
        let message;
        try { message = JSON.parse(pending.subarray(0, newline).toString("utf8")); }
        catch { return finish(new Error("Host Job gate protocol failed.")); }
        if (!exactKeys(message, ["type", "nonce"]) || message.type !== "admitted" || message.nonce !== nonce) {
          return finish(new Error("Host Job gate admission failed."));
        }
        finish();
      };
      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("close", onClose);
      const frame = JSON.stringify({ type: "host-ready", nonce, pid: process.pid, creationTime });
      if (Buffer.byteLength(frame, "utf8") + 1 > MAX_FRAME_BYTES) return finish(new Error("Host Job gate protocol failed."));
      socket.write(`${frame}\n`, error => { if (error) finish(new Error("Host Job gate connection failed.")); });
    });
    removeOwnerHostJobGatePreload(process.execArgv, import.meta.url);
  } finally {
    socket.destroy();
  }
}

try {
  await attestGate();
} catch {
  // This pre-entry gate must never allow Core to run without Job admission.
  process.exit(1);
}
