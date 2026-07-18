import { spawn as defaultSpawn } from "node:child_process";
import { createInterface } from "node:readline";

function defaultProcessSpawn(command, args, options) {
  // On this Windows installation, Node cannot launch the npm Codex shim directly
  // (spawn EPERM), while cmd.exe resolves the same command correctly.
  if (process.platform === "win32" && String(command).trim().toLowerCase() === "codex") {
    return defaultSpawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `codex ${args.join(" ")}`], options);
  }
  return defaultSpawn(command, args, options);
}

function makeError(message, data = null) {
  const error = new Error(message);
  error.data = data;
  return error;
}

export class CodexAppServerClient {
  constructor({ command = "codex", args = ["app-server", "--stdio"], cwd, env = null, spawn = defaultProcessSpawn, requestTimeoutMs = 30000, turnIdleTimeoutMs = 300000, onServerRequest = null } = {}) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.spawn = spawn;
    this.requestTimeoutMs = requestTimeoutMs;
    this.turnIdleTimeoutMs = turnIdleTimeoutMs;
    this.onServerRequest = onServerRequest;
    this.child = null;
    this.pending = new Map();
    this.listeners = new Set();
    this.completedTurns = new Map();
    this.completedTurnItems = new Map();
    this.requestId = 1;
    this.starting = null;
  }

  onNotification(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start() {
    if (this.child && !this.child.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.#start();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async #start() {
    const child = this.spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env ?? process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;

    const lineReader = createInterface({ input: child.stdout });
    lineReader.on("line", (line) => this.#handleLine(line));
    child.stderr.on("data", () => {});
    child.once("exit", () => {
      if (this.child === child) this.child = null;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(makeError("Codex app-server exited before responding."));
      }
      this.pending.clear();
      this.completedTurns.clear();
      this.completedTurnItems.clear();
      for (const listener of [...this.listeners]) listener({ method: "server/exited", params: {} });
    });

    await this.request("initialize", {
      clientInfo: {
        name: "paperclip_room_chat",
        title: "SPS Room Chat",
        version: "0.1.0"
      },
      // Room Task tools are negotiated through Codex's experimental dynamicTools API.
      capabilities: { experimentalApi: true }
    });
    this.notify("initialized", {});
  }

  async request(method, params) {
    await this.start();
    const id = this.requestId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(makeError(`Codex app-server request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      this.#send({ id, method, params });
    });
  }

  notify(method, params) {
    this.#send({ method, params });
  }

  async openRoomThread({ threadId, cwd, model, developerInstructions, dynamicTools, sandbox = "danger-full-access", approvalPolicy = "never" }) {
    const common = {
      cwd,
      ...(model ? { model } : {}),
      ...(developerInstructions ? { developerInstructions } : {}),
      sandbox,
      approvalPolicy
    };
    if (threadId) {
      const resumed = await this.request("thread/resume", { threadId, ...common });
      return resumed.thread;
    }
    const started = await this.request("thread/start", {
      ...common,
      dynamicTools
    });
    return started.thread;
  }

  async startTurn({ threadId, text, input = null, onProgress = null, approvalPolicy = "never", sandboxPolicy = { type: "dangerFullAccess" }, effort = null, summary = null }) {
    let turnId = null;
    const pendingProgress = [];
    const reportProgress = (message) => {
      const params = message.params ?? {};
      if (params.threadId !== threadId) return;
      if (!turnId) {
        pendingProgress.push(message);
        return;
      }
      if (params.turnId && params.turnId !== turnId) return;
      onProgress?.(message);
    };
    const unsubscribe = typeof onProgress === "function" ? this.onNotification((message) => {
      const params = message.params ?? {};
      if (params.threadId !== threadId) return;
      if (["turn/started", "item/started", "item/completed", "turn/completed"].includes(message.method)) reportProgress(message);
    }) : null;
    try {
      const started = await this.request("turn/start", {
        threadId,
        input: input ?? [{ type: "text", text }],
        approvalPolicy,
        sandboxPolicy,
        ...(effort ? { effort } : {}),
        ...(summary ? { summary } : {})
      });
      turnId = started?.turn?.id;
      if (!turnId) throw makeError("Codex app-server did not return a turn id.");
      onProgress?.({ method: "turn/started", params: { threadId, turnId } });
      for (const message of pendingProgress) reportProgress(message);
      const completion = this.waitForTurn(threadId, turnId).finally(() => unsubscribe?.());
      return { turnId, completion };
    } catch (error) {
      unsubscribe?.();
      throw error;
    }
  }

  async runTurn(options) {
    const started = await this.startTurn(options);
    return await started.completion;
  }

  async compactThread(threadId) {
    const compacted = this.waitForNotification((message) => {
      return message.method === "item/completed" &&
        message.params?.threadId === threadId &&
        message.params?.item?.type === "contextCompaction";
    });
    await this.request("thread/compact/start", { threadId });
    const itemEvent = await compacted;
    const turnId = itemEvent.params?.turnId;
    if (!turnId) return { compacted: true, turn: null };
    const turn = await this.waitForTurn(threadId, turnId);
    return { compacted: true, turn };
  }

  waitForTurn(threadId, turnId) {
    const key = `${threadId}:${turnId}`;
    const completed = this.completedTurns.get(key);
    if (completed) {
      this.completedTurns.delete(key);
      this.completedTurnItems.delete(key);
      return Promise.resolve(completed);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let idleTimer = null;
      let unsubscribe = () => {};
      const cleanup = () => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = null;
        unsubscribe();
        this.completedTurns.delete(key);
        this.completedTurnItems.delete(key);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const armIdleTimer = () => {
        if (!(this.turnIdleTimeoutMs > 0) || settled) return;
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          fail(makeError(`Codex Room turn stalled for ${this.turnIdleTimeoutMs}ms without progress.`, {
            code: "turn_idle_timeout",
            threadId,
            turnId
          }));
          void this.request("turn/interrupt", { threadId, turnId }).catch(() => this.stop());
        }, this.turnIdleTimeoutMs);
      };
      unsubscribe = this.onNotification((message) => {
        if (message.method === "server/exited") {
          fail(makeError("Codex app-server exited before the Room turn completed."));
          return;
        }
        const params = message.params ?? {};
        if (params.threadId !== threadId) return;
        const eventTurnId = params.turnId ?? params.turn?.id;
        if (eventTurnId && eventTurnId !== turnId) return;
        armIdleTimer();
        if (message.method !== "turn/completed" || params.turn?.id !== turnId) return;
        if (settled) return;
        settled = true;
        const turn = this.#turnWithCompletedItems(params);
        cleanup();
        if (turn.status === "failed") {
          reject(makeError(turn.error?.message || "Codex Room turn failed.", turn.error));
          return;
        }
        resolve(turn);
      });
      armIdleTimer();
    });
  }

  waitForNotification(predicate) {
    return new Promise((resolve) => {
      const unsubscribe = this.onNotification((message) => {
        if (!predicate(message)) return;
        unsubscribe();
        resolve(message);
      });
    });
  }

  stop() {
    this.child?.kill();
    this.child = null;
  }

  #send(message) {
    if (!this.child?.stdin?.writable) throw makeError("Codex app-server is not running.");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "id") && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(makeError(message.error.message || "Codex app-server error.", message.error));
      else pending.resolve(message.result);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "id") && message.method) {
      this.#handleServerRequest(message);
      return;
    }
    if (message.method === "item/completed") {
      this.#recordCompletedItem(message.params);
    }
    if (message.method === "turn/completed") {
      const params = message.params ?? {};
      if (params.threadId && params.turn?.id) {
        this.completedTurns.set(`${params.threadId}:${params.turn.id}`, this.#turnWithCompletedItems(params));
      }
    }
    for (const listener of this.listeners) listener(message);
  }

  async #handleServerRequest(message) {
    try {
      if (!this.onServerRequest) throw makeError(`Unhandled Codex app-server request: ${message.method}`);
      const result = await this.onServerRequest(message);
      this.#send({ id: message.id, result });
    } catch (error) {
      this.#send({
        id: message.id,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  #recordCompletedItem(params) {
    const threadId = params?.threadId;
    const turnId = params?.turnId;
    const item = params?.item;
    if (!threadId || !turnId || !item) return;
    const key = `${threadId}:${turnId}`;
    const items = this.completedTurnItems.get(key) ?? [];
    if (!items.some((existing) => existing?.id && item?.id && existing.id === item.id)) items.push(item);
    this.completedTurnItems.set(key, items);
  }

  #turnWithCompletedItems(params) {
    const turn = params?.turn ?? {};
    const key = `${params?.threadId}:${turn.id}`;
    const inlineItems = Array.isArray(turn.items) ? turn.items : [];
    const completedItems = this.completedTurnItems.get(key) ?? [];
    const items = [...inlineItems];
    for (const item of completedItems) {
      if (!items.some((existing) => existing?.id && item?.id && existing.id === item.id)) items.push(item);
    }
    return { ...turn, items };
  }
}

export function getAgentText(turn) {
  const items = Array.isArray(turn?.items) ? turn.items : [];
  return items
    .filter((item) => item?.type === "agentMessage" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}
