import { spawn as defaultSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";

function makeError(message) {
  return new Error(message);
}

const AGY_PROVIDER_QUOTA_RE = /(?:resource_exhausted|quota|rate[-\s]?limit|too many requests|\b429\b|billing details|usage limit)/i;

function outputError(exitCode, stdout, stderr) {
  const detail = String(stderr || stdout || "Agy returned no diagnostic output.").trim().replace(/\s+/g, " ").slice(0, 600);
  const error = makeError(`Agy CLI exited with code ${exitCode ?? -1}: ${detail}`);
  if (AGY_PROVIDER_QUOTA_RE.test(`${stdout}\n${stderr}`)) {
    error.code = "provider_quota";
    error.errorFamily = "provider_quota";
  }
  return error;
}

function utf8Buffer(chunk) {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
}

function decodeUtf8(chunks, streamName) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw makeError(`Agy CLI emitted invalid UTF-8 on ${streamName}; the response was not saved to avoid corrupted text.`);
  }
}

export class AgyRoomClient {
  constructor({ command = "agy", argsPrefix = [], cwd, env = process.env, model = null, sandbox = false, extraArgs = [], spawn = defaultSpawn, requestTimeoutMs = 0 } = {}) {
    this.command = command;
    this.argsPrefix = Array.isArray(argsPrefix) ? argsPrefix.filter(Boolean) : [];
    this.cwd = cwd;
    this.env = env;
    this.model = model;
    this.sandbox = sandbox;
    this.extraArgs = Array.isArray(extraArgs) ? extraArgs.filter(Boolean) : [];
    this.spawn = spawn;
    this.requestTimeoutMs = requestTimeoutMs;
    this.children = new Set();
    this.kind = "agy_print";
  }

  startTurn({ prompt }) {
    const turnId = `agy-${randomUUID()}`;
    // Agy reads print-mode input from stdin when --print has no value. Keeping
    // Room context off argv avoids Windows' command-line length limit.
    const args = [...this.argsPrefix, "--print"];
    // A sandboxed Room conversation must not auto-approve file or shell tools.
    // Production Task runners choose their own execution policy elsewhere.
    if (this.sandbox) args.push("--sandbox");
    else args.push("--dangerously-skip-permissions");
    args.push(...this.extraArgs);
    const env = { ...this.env };
    if (this.model && this.model !== "auto") env.ANTIGRAVITY_MODEL = this.model;

    const completion = new Promise((resolve, reject) => {
      let child;
      try {
        child = this.spawn(this.command, args, {
          cwd: this.cwd,
          env,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (error) {
        reject(error);
        return;
      }
      this.children.add(child);
      if (!child.stdin) {
        child.kill();
        this.children.delete(child);
        reject(makeError("Agy CLI stdin is unavailable."));
        return;
      }
      child.stdin.on("error", () => {
        // The process close/error event carries the actionable diagnostic.
      });
      child.stdin.end(String(prompt ?? ""), "utf8");
      const stdoutChunks = [];
      const stderrChunks = [];
      let timedOut = false;
      const timer = this.requestTimeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, this.requestTimeoutMs)
        : null;
      child.stdout?.on("data", (chunk) => { stdoutChunks.push(utf8Buffer(chunk)); });
      child.stderr?.on("data", (chunk) => { stderrChunks.push(utf8Buffer(chunk)); });
      child.once("error", (error) => {
        if (timer) clearTimeout(timer);
        this.children.delete(child);
        reject(error);
      });
      child.once("close", (exitCode) => {
        if (timer) clearTimeout(timer);
        this.children.delete(child);
        if (timedOut) return reject(makeError(`Agy CLI timed out after ${Math.round(this.requestTimeoutMs / 1000)} seconds.`));
        let stdout;
        let stderr;
        try {
          stdout = decodeUtf8(stdoutChunks, "stdout");
          stderr = decodeUtf8(stderrChunks, "stderr");
        } catch (error) {
          return reject(error);
        }
        if (exitCode !== 0) return reject(outputError(exitCode, stdout, stderr));
        const text = stdout.trim();
        if (!text) return reject(makeError("Agy CLI completed without an assistant message."));
        resolve({
          items: [{ id: `message-${turnId}`, type: "agentMessage", text }],
          provider: "agy",
          turnId
        });
      });
    });
    return { turnId, completion };
  }

  stop() {
    for (const child of this.children) child.kill();
    this.children.clear();
  }
}
