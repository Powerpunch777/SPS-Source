import assert from "node:assert/strict";
import { spawn as nodeSpawn } from "node:child_process";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createWorkspaceE2eFixture } from "../../desktop/scripts/workspace-e2e-fixture.mjs";
import { attachSpsNativeMemberSignerChannel } from "../../desktop/src/native-member-signer-channel.mjs";
import { prepareWindowsHostJob } from "../src/windows-host-job.mjs";

const skipWindows = process.platform !== "win32";
const canaryTimeoutMs = 45_000;
const stopToken = "sps.owner-host.shutdown/v1\n";
const gateModulePath = fileURLToPath(new URL("../../desktop/src/owner-host-job-gate.mjs", import.meta.url));

function commandEnvironment() {
  return {
    SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\Windows",
    WINDIR: process.env.WINDIR ?? "C:\\Windows",
    PATH: process.env.PATH ?? "",
  };
}

async function waitForMessage(child, predicate, label, timeoutMs = 10_000) {
  let timer;
  const message = new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.removeListener("message", onMessage);
      child.removeListener("exit", onExit);
    };
    const onMessage = value => {
      if (!predicate(value)) return;
      cleanup();
      resolve(value);
    };
    const onExit = () => {
      cleanup();
      reject(new Error(`${label} exited before its IPC response.`));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} did not arrive before the canary deadline.`));
    }, timeoutMs);
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
  return message;
}

async function runHostCanary(mode, { controlLoss = false } = {}) {
  const fixture = await createWorkspaceE2eFixture();
  const file = path.join(fixture.directory, "owned-host-canary.mjs");
  const workerFile = path.join(fixture.directory, "owned-host-worker.mjs");
  await writeFile(workerFile, [
    'import { parentPort } from "node:worker_threads";',
    'const gateNames = ["SPS_OWNER_HOST_JOB_PIPE", "SPS_OWNER_HOST_JOB_NONCE", "SPS_OWNER_HOST_JOB_HELPER"];',
    'const gateEnvPresent = Object.keys(process.env).some(key => gateNames.includes(key.toUpperCase()));',
    'const gateArgvPresent = process.execArgv.some((value, index, args) => value === "--import" && args[index + 1]?.includes("owner-host-job-gate.mjs") || value.includes("owner-host-job-gate.mjs"));',
    'parentPort.postMessage({ type: "worker-ran", gateEnvPresent, gateArgvPresent });',
    'setInterval(() => {}, 1000);',
    "",
  ].join("\n"), { encoding: "utf8", flag: "wx" });
  const script = [
    'import { spawn } from "node:child_process";',
    'import { Worker } from "node:worker_threads";',
    'import { createReadStream } from "node:fs";',
    'const mode = process.argv[2];',
    'const gateNames = ["SPS_OWNER_HOST_JOB_PIPE", "SPS_OWNER_HOST_JOB_NONCE", "SPS_OWNER_HOST_JOB_HELPER"];',
    'const gateEnvPresent = Object.keys(process.env).some(key => gateNames.includes(key.toUpperCase()));',
    'const gateArgvPresent = process.execArgv.some((value, index, args) => value === "--import" && args[index + 1]?.includes("owner-host-job-gate.mjs") || value.includes("owner-host-job-gate.mjs"));',
    'const worker = new Worker(new URL("./owned-host-worker.mjs", import.meta.url)); worker.unref();',
    'const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" }); descendant.unref();',
    'process.on("message", message => { if (message?.type === "ping") process.send({ type: "pong", value: message.value }); });',
    'const pipe = createReadStream(null, { fd: 4, autoClose: true, encoding: "utf8" });',
    'let stopInput = ""; pipe.on("data", chunk => { stopInput += chunk; });',
    'pipe.on("end", () => { process.send({ type: "stop-pipe", exact: stopInput === "sps.owner-host.shutdown/v1\\n" }); if (mode !== "hold") process.exit(0); });',
    'const workerReady = await new Promise((resolve, reject) => { worker.once("message", resolve); worker.once("error", reject); worker.once("exit", code => { if (code !== 0) reject(new Error("Owned worker exited before its readiness message.")); }); });',
    'process.send({ type: "fixture-ready", gateEnvPresent, gateArgvPresent, workerReady, descendantPid: descendant.pid, mode });',
    'if (mode === "hold") setInterval(() => {}, 1000);',
    "",
  ].join("\n");
  await writeFile(file, script, { encoding: "utf8", flag: "wx" });

  let controller;
  let child;
  let childClose;
  let helperChild;
  let helperClose;
  let controlSocket;
  let terminationConfirmed = false;
  let cleanupAllowed = false;
  try {
    const internal = controlLoss ? {
      connect(address) {
        controlSocket = net.createConnection(address);
        return controlSocket;
      },
      spawn(...args) {
        helperChild = nodeSpawn(...args);
        helperClose = once(helperChild, "close");
        void helperClose.catch(() => {});
        return helperChild;
      },
    } : {};
    controller = await prepareWindowsHostJob({ gateModulePath }, internal);
    child = controller.spawn(process.execPath, [file, mode], {
      cwd: fixture.directory,
      env: commandEnvironment(),
      stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"],
      windowsHide: true,
    });
    childClose = once(child, "close");
    void childClose.catch(() => {});
    child.stdout.resume();
    child.stderr.resume();

    await child.supervisorReady;
    const ready = await waitForMessage(child, value => value?.type === "fixture-ready", "host fixture readiness");
    assert.equal(ready.mode, mode);
    assert.equal(ready.gateEnvPresent, false, "gate credentials must be removed before Core entry");
    assert.equal(ready.gateArgvPresent, false, "gate preload must be removed before Core entry");
    assert.deepEqual(ready.workerReady, { type: "worker-ran", gateEnvPresent: false, gateArgvPresent: false });
    assert.ok(Number.isInteger(ready.descendantPid) && ready.descendantPid > 0);

    const pong = waitForMessage(child, value => value?.type === "pong", "Owner Host IPC ping/pong");
    child.send({ type: "ping", value: "host-ipc-canary" });
    assert.deepEqual(await pong, { type: "pong", value: "host-ipc-canary" });

    if (controlLoss) {
      assert.ok(controlSocket && helperChild && helperClose, "the exact Main control channel and helper child must be captured");
      controlSocket.destroy();
      const bounded = async (promise, label) => {
        let timer;
        try {
          return await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} was not observed before the canary deadline.`)), 15_000);
          })]);
        } finally { clearTimeout(timer); }
      };
      const [childCode, childSignal] = await bounded(childClose, "exact Core child close");
      const [helperCode, helperSignal] = await bounded(helperClose, "exact helper child close");
      assert.ok(childCode !== null || childSignal !== null, "the admitted Core child must reach a terminal event");
      assert.ok(helperCode !== null || helperSignal !== null, "the captured helper child must reach a terminal event");
      assert.equal(child.hasUnconfirmedOwnedJobTermination(), true, "control loss must remain an unconfirmed result");
      await assert.rejects(child.waitForOwnedJobTermination(), /unconfirmed/i);
      cleanupAllowed = true;
    } else if (mode === "natural") {
      let signerDisposed = false;
      const signerChannel = attachSpsNativeMemberSignerChannel(child, {
        inspect: async () => ({}),
        sign: async () => ({}),
        dispose() { signerDisposed = true; },
      }, { isCurrent: () => true, disconnectOnDispose: false });
      signerChannel.dispose();
      assert.equal(signerDisposed, true, "disposing signer authority must dispose the signer");
      assert.equal(child.connected, true, "disposing signer authority must retain Core IPC for child-close accounting");
      const stopPipe = waitForMessage(child, value => value?.type === "stop-pipe", "Owner Host stop-pipe receipt");
      child.stdio[4].end(stopToken);
      assert.deepEqual(await stopPipe, { type: "stop-pipe", exact: true });
      const [code, signal] = await childClose;
      assert.equal(signal, null);
      assert.equal(code, 0);
      assert.deepEqual(await child.waitForOwnedJobTermination(), { type: "exit", code: 0, activeProcesses: 0 });
    } else {
      assert.deepEqual(await child.terminateOwnedJob(), { type: "cancelled", activeProcesses: 0 });
      const [code, signal] = await childClose;
      assert.equal(signal, null);
      assert.equal(code, 125);
      assert.deepEqual(await child.waitForOwnedJobTermination(), { type: "cancelled", activeProcesses: 0 });
    }
    if (!controlLoss) {
      terminationConfirmed = true;
      assert.equal(child.hasUnconfirmedOwnedJobTermination(), false);
    }
  } finally {
    if (child && !terminationConfirmed) {
      try {
        await child.terminateOwnedJob();
        terminationConfirmed = true;
      } catch { /* Preserve the owned fixture if job emptiness is uncertain. */ }
      if (childClose && terminationConfirmed) {
        let timer;
        try {
          await Promise.race([childClose, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Owner Host canary child close is unconfirmed; fixture preserved.")), 15_000);
          })]);
        } finally { clearTimeout(timer); }
      }
    }
    await fixture.assertCurrent();
    if (terminationConfirmed || cleanupAllowed) await fixture.remove();
  }
}

test("Owner Host natural close preserves IPC/stop pipe and empties the retained descendant job", { skip: skipWindows, timeout: canaryTimeoutMs }, async () => {
  await runHostCanary("natural");
});

test("Owner Host cancellation confirms the retained job and child close", { skip: skipWindows, timeout: canaryTimeoutMs }, async () => {
  await runHostCanary("hold");
});

test("Owner Host control-channel loss closes exact Core/helper children but keeps termination unconfirmed", { skip: skipWindows, timeout: canaryTimeoutMs }, async () => {
  await runHostCanary("hold", { controlLoss: true });
});

test("rejects Owner Host admission when gate creation time does not match the attached process", { skip: skipWindows, timeout: canaryTimeoutMs }, async () => {
  const fixture = await createWorkspaceE2eFixture();
  const gateFile = path.join(fixture.directory, "wrong-creation-time-gate.mjs");
  const entryFile = path.join(fixture.directory, "must-not-enter.mjs");
  const marker = path.join(fixture.directory, "core-entry.marker");
  await writeFile(gateFile, [
    'import { execFileSync } from "node:child_process";',
    'import net from "node:net";',
    'const pipe = process.env.SPS_OWNER_HOST_JOB_PIPE;',
    'const nonce = process.env.SPS_OWNER_HOST_JOB_NONCE;',
    'const helper = process.env.SPS_OWNER_HOST_JOB_HELPER;',
    'const time = execFileSync(helper, ["--process-creation", String(process.pid)], { encoding: "utf8", windowsHide: true, timeout: 5000, maxBuffer: 128, stdio: ["ignore", "pipe", "ignore"], env: { SYSTEMROOT: process.env.SYSTEMROOT ?? "C:\\\\Windows", WINDIR: process.env.WINDIR ?? "C:\\\\Windows", PATH: process.env.PATH ?? "" } }).trim();',
    'const slash = String.fromCharCode(92); const socket = net.createConnection(slash + slash + "." + slash + "pipe" + slash + pipe);',
    'socket.once("connect", () => socket.write(`${JSON.stringify({ type: "host-ready", nonce, pid: process.pid, creationTime: (BigInt(time) + 1n).toString() })}\\n`));',
    'socket.once("data", () => process.exit(2));',
    'socket.once("close", () => process.exit(1));',
    'socket.once("error", () => process.exit(1));',
    'setTimeout(() => process.exit(1), 10_000);',
    'await new Promise(() => {});',
    "",
  ].join("\n"), { encoding: "utf8", flag: "wx" });
  await writeFile(entryFile, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "entered");\n`, { encoding: "utf8", flag: "wx" });

  let controller;
  let child;
  let childClose;
  let helperChild;
  let helperClose;
  let bothClosed = false;
  try {
    controller = await prepareWindowsHostJob({ gateModulePath: gateFile }, {
      spawn(...args) {
        helperChild = nodeSpawn(...args);
        helperClose = once(helperChild, "close");
        void helperClose.catch(() => {});
        return helperChild;
      },
    });
    child = controller.spawn(process.execPath, [entryFile], {
      cwd: fixture.directory,
      env: { ...commandEnvironment(), SPS_HOST_JOB_ENTRY_MARKER: marker },
      stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"],
      windowsHide: true,
    });
    childClose = once(child, "close");
    void childClose.catch(() => {});
    child.stdout.resume();
    child.stderr.resume();

    await assert.rejects(child.supervisorReady, /startup failed/i);
    let timer;
    try {
      await Promise.race([childClose, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Core child did not close after creation-time mismatch.")), 15_000);
      })]);
    } finally { clearTimeout(timer); }
    try {
      await Promise.race([helperClose, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Exact helper child did not close after creation-time mismatch.")), 15_000);
      })]);
    } finally { clearTimeout(timer); }
    bothClosed = true;
    assert.equal(controller.hasUnconfirmedOwnedJobTermination(), true, "the rejected admission must not be reported as an active-zero acknowledgment");
    await assert.rejects(child.waitForOwnedJobTermination(), /unconfirmed/i);
    await assert.rejects(access(marker), error => error?.code === "ENOENT", "Core entry marker must remain absent");
  } finally {
    await fixture.assertCurrent();
    if (bothClosed) await fixture.remove();
  }
});
