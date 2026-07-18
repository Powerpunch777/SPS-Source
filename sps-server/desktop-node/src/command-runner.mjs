import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  appendSpsNodeCommandEvent,
  checkSpsNodeCommandLease,
  completeSpsNodeCommand,
} from "./hub-client.mjs";

const OUTPUT_CHUNK_LIMIT = 48 * 1024;
const COMMAND_LEASE_CHECK_INTERVAL_MS = 2_000;
const FORBIDDEN_ENV_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "CODEX_HOME",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
]);
const SAFE_RUNTIME_ENV_KEYS = new Set([
  "ANTIGRAVITY_MODEL",
  "OPENCODE_DISABLE_PROJECT_CONFIG",
]);

function allowedEnvironment(value) {
  const output = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (typeof entry !== "string" || FORBIDDEN_ENV_KEYS.has(key)) continue;
    if (key.startsWith("PAPERCLIP_") || SAFE_RUNTIME_ENV_KEYS.has(key) || key === "FORCE_COLOR" || key === "TERM") output[key] = entry;
  }
  return output;
}

export async function resolveSpsNodeWorkspace(command, profile) {
  const projectId = typeof command?.projectId === "string" && command.projectId.trim()
    ? command.projectId
    : null;
  // A project-bound command must never fall back to this computer's default
  // folder. Each project is explicitly mapped by the Node owner so a remote
  // Agent cannot accidentally work in another repository.
  const configured = projectId
    ? profile.projectWorkspaces?.[projectId]
    : profile.defaultWorkspacePath;
  if (projectId && (!configured || !configured.trim())) {
    throw new Error(`No local workspace is configured for SPS project ${projectId}. Choose its folder in SPS Desktop before this Agent runs.`);
  }
  if (!configured || !configured.trim()) {
    throw new Error("No local workspace is configured for this SPS project. Set a default workspace folder in SPS Desktop.");
  }
  const workspace = path.resolve(configured.trim());
  const info = await fs.stat(workspace).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Configured workspace is not a directory: ${workspace}`);
  return workspace;
}

function outputChunks(value) {
  const text = String(value ?? "");
  const chunks = [];
  for (let start = 0; start < text.length; start += OUTPUT_CHUNK_LIMIT) {
    chunks.push(text.slice(start, start + OUTPUT_CHUNK_LIMIT));
  }
  return chunks;
}

async function findWindowsCommandCandidates(command) {
  return await new Promise((resolve) => {
    const lookup = spawn("where.exe", [command], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    lookup.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    lookup.once("error", () => resolve([]));
    lookup.once("close", () => {
      resolve(output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
    });
  });
}

export async function resolveSpsNodeExecutable(command, options = {}) {
  if ((options.platform ?? process.platform) !== "win32") return command;
  const extension = path.extname(command).toLowerCase();
  if (extension && extension !== ".cmd" && extension !== ".bat" && extension !== ".ps1") return command;
  const findCandidates = options.findWindowsCommand ?? findWindowsCommandCandidates;
  const candidates = await findCandidates(command);
  const executable = candidates.find((candidate) => /\.(exe|com)$/i.test(candidate));
  if (executable) return executable;
  if (extension === ".cmd" || extension === ".bat" || extension === ".ps1") {
    throw new Error(`SPS Desktop requires an executable for remote Node runs, not a shell wrapper: ${command}`);
  }
  return command;
}

async function fileExists(filePath) {
  return Boolean(await fs.stat(filePath).catch(() => null));
}

async function readTextFile(filePath) {
  return await fs.readFile(filePath, "utf8");
}

async function resolveWindowsNpmNodeInvocation(command, rawArgs, options) {
  const findCandidates = options.findWindowsCommand ?? findWindowsCommandCandidates;
  const candidates = await findCandidates(command);
  const commandName = path.win32.basename(command).replace(/\.(cmd|bat|ps1|exe|com)$/i, "").toLowerCase();
  const npmWrapper = candidates.find(
    (candidate) => path.win32.basename(candidate).toLowerCase() === `${commandName}.cmd`,
  );
  if (!npmWrapper) return null;

  const readFile = options.readFile ?? readTextFile;
  const wrapperSource = String(await readFile(npmWrapper));
  // npm's Windows shim executes node against a script below its own
  // node_modules directory. Extract only that fixed shape, never a shell line.
  const match = wrapperSource.match(/"%dp0%\\(node_modules\\[^\"]+\.(?:c|m)?js)"/i);
  if (!match) {
    throw new Error(`SPS Desktop could not safely resolve the npm wrapper for remote Node runs: ${npmWrapper}`);
  }
  const scriptSuffix = match[1].replace(/\//g, "\\");
  if (!/^node_modules\\/i.test(scriptSuffix) || scriptSuffix.split("\\").includes("..")) {
    throw new Error(`SPS Desktop rejected an unsafe npm wrapper script path: ${npmWrapper}`);
  }
  const nodeScript = path.win32.resolve(path.win32.dirname(npmWrapper), scriptSuffix);
  const exists = options.fileExists ?? fileExists;
  if (!await exists(nodeScript)) {
    throw new Error(`SPS Desktop could not find the npm CLI script referenced by ${npmWrapper}`);
  }
  const nodeCandidates = await findCandidates("node.exe");
  const nodeExecutable = nodeCandidates.find((candidate) => /\.(exe|com)$/i.test(candidate));
  if (!nodeExecutable) {
    throw new Error(`SPS Desktop requires node.exe to run the npm CLI wrapper: ${npmWrapper}`);
  }
  return { executable: nodeExecutable, args: [nodeScript, ...rawArgs] };
}

export async function resolveSpsNodeInvocation(command, args, options = {}) {
  const rawArgs = Array.isArray(args) ? args : [];
  if ((options.platform ?? process.platform) === "win32") {
    const npmInvocation = await resolveWindowsNpmNodeInvocation(command, rawArgs, options);
    if (npmInvocation) return npmInvocation;
  }
  return {
    executable: await resolveSpsNodeExecutable(command, options),
    args: rawArgs,
  };
}

async function terminateProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", () => resolve());
      killer.once("close", () => resolve());
    });
    return;
  }
  child.kill("SIGTERM");
}

export async function executeSpsNodeCommand({ command, hubUrl, nodeId, identity, accessToken, profile }) {
  const workspace = await resolveSpsNodeWorkspace(command, profile);
  // The Hub process may be bound to localhost on its own computer. A member
  // Node must use the Hub URL it connected to, never that host-local address.
  const environment = {
    ...process.env,
    ...allowedEnvironment(command.env),
    PAPERCLIP_API_URL: hubUrl.replace(/\/$/, ""),
  };
  let sequence = Number(command.lastEventSeq ?? 0);
  let outputQueue = Promise.resolve();
  const enqueueOutput = (stream, raw) => {
    for (const body of outputChunks(raw)) {
      if (!body) continue;
      const eventSequence = ++sequence;
      outputQueue = outputQueue.then(() => appendSpsNodeCommandEvent({
        hubUrl,
        nodeId,
        identity,
        accessToken,
        commandId: command.id,
        sequence: eventSequence,
        stream,
        body,
      }));
    }
  };

  const timeoutMs = typeof command.timeoutMs === "number" && command.timeoutMs > 0
    ? command.timeoutMs
    : 0;
  const startedAt = Date.now();
  let timeout = null;
  let child = null;
  let leaseTimer = null;
  let leaseCheckInFlight = false;
  let leaseCancellationError = null;
  try {
    const invocation = await resolveSpsNodeInvocation(command.command, command.args);
    const result = await new Promise((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      child = spawn(invocation.executable, invocation.args, {
        cwd: workspace,
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => enqueueOutput("stdout", chunk.toString("utf8")));
      child.stderr.on("data", (chunk) => enqueueOutput("stderr", chunk.toString("utf8")));
      child.once("error", (error) => settle(reject, error));
      child.once("close", (exitCode, signal) => {
        if (leaseTimer) clearInterval(leaseTimer);
        settle(resolve, { exitCode, signal, timedOut });
      });
      const checkLease = async () => {
        if (leaseCheckInFlight || leaseCancellationError) return;
        leaseCheckInFlight = true;
        try {
          const lease = await checkSpsNodeCommandLease({
            hubUrl,
            nodeId,
            identity,
            accessToken,
            commandId: command.id,
          });
          if (!lease?.active) {
            leaseCancellationError = lease?.error || "SPS Hub cancelled this local command.";
            await terminateProcessTree(child);
          }
        } catch {
          // A brief Hub outage must not kill a local run. The Hub will make the
          // command inactive once it receives a later lease check after a revoke.
        } finally {
          leaseCheckInFlight = false;
        }
      };
      leaseTimer = setInterval(() => { void checkLease(); }, COMMAND_LEASE_CHECK_INTERVAL_MS);
      void checkLease();
      if (typeof command.stdin === "string" && command.stdin.length > 0) child.stdin.end(command.stdin);
      else child.stdin.end();
      if (timeoutMs > 0) {
        timeout = setTimeout(() => {
          timedOut = true;
          // Wait for the process tree to close before reporting completion.
          // Codex and other CLIs can spawn children that continue writing.
          void terminateProcessTree(child).catch(() => child?.kill());
        }, timeoutMs);
      }
    });
    if (timeout) clearTimeout(timeout);
    if (leaseTimer) clearInterval(leaseTimer);
    await outputQueue;
    await completeSpsNodeCommand({
      hubUrl,
      nodeId,
      identity,
      accessToken,
      commandId: command.id,
      completion: {
        status: result.exitCode === 0 && !result.timedOut && !leaseCancellationError ? "succeeded" : "failed",
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        error: leaseCancellationError ?? (result.timedOut ? `Local command exceeded ${timeoutMs}ms.` : null),
      },
    });
    return { ...result, workspace, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    if (leaseTimer) clearInterval(leaseTimer);
    await outputQueue.catch(() => undefined);
    await completeSpsNodeCommand({
      hubUrl,
      nodeId,
      identity,
      accessToken,
      commandId: command.id,
      completion: {
        status: "failed",
        exitCode: null,
        signal: null,
        timedOut: false,
        error: error instanceof Error ? error.message.slice(0, 16_000) : "SPS Desktop command execution failed.",
      },
    }).catch(() => undefined);
    throw error;
  }
}
