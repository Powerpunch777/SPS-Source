import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { appendSpsNodeCommandEvent, completeSpsNodeCommand } from "./hub-client.mjs";

const OUTPUT_CHUNK_LIMIT = 48 * 1024;
const FORBIDDEN_ENV_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "CODEX_HOME",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
]);

function allowedEnvironment(value) {
  const output = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (typeof entry !== "string" || FORBIDDEN_ENV_KEYS.has(key)) continue;
    if (key.startsWith("PAPERCLIP_") || key === "FORCE_COLOR" || key === "TERM") output[key] = entry;
  }
  return output;
}

async function resolveWorkspace(command, profile) {
  const configured = command.projectId && profile.projectWorkspaces?.[command.projectId]
    ? profile.projectWorkspaces[command.projectId]
    : profile.defaultWorkspacePath;
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
  const workspace = await resolveWorkspace(command, profile);
  const environment = { ...process.env, ...allowedEnvironment(command.env) };
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
  try {
    const result = await new Promise((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      child = spawn(command.command, Array.isArray(command.args) ? command.args : [], {
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
        settle(resolve, { exitCode, signal, timedOut });
      });
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
    await outputQueue;
    await completeSpsNodeCommand({
      hubUrl,
      nodeId,
      identity,
      accessToken,
      commandId: command.id,
      completion: {
        status: result.exitCode === 0 && !result.timedOut ? "succeeded" : "failed",
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        error: result.timedOut ? `Local command exceeded ${timeoutMs}ms.` : null,
      },
    });
    return { ...result, workspace, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
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
