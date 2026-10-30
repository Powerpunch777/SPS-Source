import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const scriptPath = new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url);
const script = (await readFile(scriptPath, "utf8")).replaceAll("\r\n", "\n");
const start = script.indexOf("async function openCdp(target) {");
const end = script.indexOf("\n}\n\nfunction recoveryPhase", start) + 2;
assert.ok(start >= 0 && end > start, "CDP helper boundaries must stay explicit for the focused contract test.");
const openCdpSource = script.slice(start, end);

function createHarness() {
  let lastSocket;
  let nextTimer = 0;
  const timers = new Map();
  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.closed = false;
      lastSocket = this;
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    dispatch(type, event = {}) {
      for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    }
    listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
    send(payload) { this.onSend?.(JSON.parse(payload)); }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.dispatch("close");
    }
  }
  const openCdp = runInNewContext(`(${openCdpSource})`, {
    WebSocket: MockWebSocket,
    setTimeout(callback, delayMs) {
      const id = ++nextTimer;
      timers.set(id, { callback, delayMs });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    openCdp,
    get socket() { return lastSocket; },
    fireTimer(delayMs) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delayMs === delayMs);
      assert.ok(entry, `expected a pending ${delayMs}ms timer`);
      const [id, timer] = entry;
      timers.delete(id);
      timer.callback();
    },
  };
}

async function openHarness(harness) {
  const opening = harness.openCdp({ webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/test" });
  harness.socket.dispatch("open");
  return await opening;
}

test("CDP command resolves the matching response and removes its message listener", async () => {
  const harness = createHarness();
  const cdp = await openHarness(harness);
  harness.socket.onSend = ({ id }) => harness.socket.dispatch("message", { data: JSON.stringify({ id, result: { value: 7 } }) });

  assert.equal((await cdp.command("Runtime.enable")).value, 7);
  assert.equal(harness.socket.listenerCount("message"), 0);
  await cdp.close();
});

test("CDP command timeout clears pending listeners and closes the owned socket", async () => {
  const harness = createHarness();
  const cdp = await openHarness(harness);
  const command = cdp.command("Runtime.evaluate");

  assert.equal(harness.socket.listenerCount("message"), 1);
  harness.fireTimer(10_000);
  await assert.rejects(command, /Runtime\.evaluate timed out after 10000ms/);
  assert.equal(harness.socket.listenerCount("message"), 0);
  assert.equal(harness.socket.closed, true);
  await cdp.close();
});

test("socket close rejects every pending CDP command and clears its listeners", async () => {
  const harness = createHarness();
  const cdp = await openHarness(harness);
  const first = cdp.command("Runtime.evaluate");
  const second = cdp.command("Page.getFrameTree");

  harness.socket.close();
  await assert.rejects(first, /CDP socket closed before the response arrived/);
  await assert.rejects(second, /CDP socket closed before the response arrived/);
  assert.equal(harness.socket.listenerCount("message"), 0);
  await cdp.close();
});

test("malformed CDP JSON rejects the call and closes the session", async () => {
  for (const invalidMessage of ["{", "null", "[]", "1"]) {
    const harness = createHarness();
    const cdp = await openHarness(harness);
    const command = cdp.command("Runtime.evaluate");

    harness.socket.dispatch("message", { data: invalidMessage });
    await assert.rejects(command, /malformed JSON response/);
    assert.equal(harness.socket.listenerCount("message"), 0);
    assert.equal(harness.socket.closed, true);
    await cdp.close();
  }
});

test("socket close before open rejects promptly and leaves no open timer", async () => {
  const harness = createHarness();
  const opening = harness.openCdp({ webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/test" });

  harness.socket.close();
  await assert.rejects(opening, /CDP socket failed before opening/);
  assert.equal(harness.socket.listenerCount("open"), 0);
});

test("bounded CDP diagnostics preserve click phases and context destruction after timeout without sensitive payloads", async () => {
  const harness = createHarness();
  const cdp = await openHarness(harness);
  const command = cdp.evaluate("pending click expression", true);
  const canary = "sensitive-cdp-payload-canary";
  const emit = (message) => harness.socket.dispatch("message", { data: JSON.stringify(message) });

  emit({ method: "Runtime.consoleAPICalled", params: { args: [
    { type: "string", value: "__sps_e2e_click_phase__" }, { type: "string", value: "locating" },
    { type: "string", value: canary },
  ] } });
  emit({ method: "Runtime.consoleAPICalled", params: { args: [
    { type: "string", value: "__sps_e2e_click_phase__" }, { type: "string", value: "scrolling" },
    { type: "string", value: canary },
  ] } });
  emit({ method: "Runtime.consoleAPICalled", params: { args: [
    { type: "string", value: canary }, { type: "string", value: "dispatching" },
  ] } });
  emit({
    method: "Runtime.executionContextDestroyed",
    params: { executionContextId: 98765, origin: canary, name: canary, expression: canary, result: { value: canary } },
    expression: canary,
    result: { value: canary },
  });

  harness.fireTimer(10_000);
  await assert.rejects(command, /Runtime\.evaluate timed out after 10000ms/);
  assert.equal(harness.socket.closed, true);
  assert.equal(harness.socket.listenerCount("message"), 0);

  const snapshot = cdp.snapshotDiagnostics();
  const phases = snapshot.recent.filter((entry) => entry.kind === "click").map((entry) => entry.phase);
  assert.equal(phases.length, 2);
  assert.equal(phases[0], "locating");
  assert.equal(phases[1], "scrolling");
  assert.ok(snapshot.recent.some((entry) => entry.kind === "lifecycle" && entry.event === "Runtime.executionContextDestroyed"));
  assert.ok(snapshot.recent.some((entry) => entry.kind === "timeout" && entry.method === "Runtime.evaluate"));
  assert.equal(snapshot.socketClosed, true);
  assert.equal(JSON.stringify(snapshot).includes(canary), false);
  await cdp.close();
});

test("CDP diagnostics stay bounded and snapshots do not expose mutable internal state", async () => {
  const harness = createHarness();
  const cdp = await openHarness(harness);
  const pending = cdp.command("Runtime.evaluate");
  const canary = "lifecycle-private-canary";
  for (let index = 0; index < 100; index += 1) {
    harness.socket.dispatch("message", { data: JSON.stringify({
      method: "Runtime.executionContextCreated",
      params: { origin: canary, name: canary, executionContextId: index, expression: canary, result: { value: canary } },
    }) });
  }

  const first = cdp.snapshotDiagnostics();
  assert.equal(first.recent.length, 40);
  assert.equal(JSON.stringify(first).includes(canary), false);
  first.recent[0].event = "mutated snapshot";
  first.recent.push({ kind: "injected" });
  const second = cdp.snapshotDiagnostics();
  assert.equal(second.recent.length, 40);
  assert.notEqual(second.recent[0].event, "mutated snapshot");
  assert.equal(second.recent.some((entry) => entry.kind === "injected"), false);
  await cdp.close();
  await assert.rejects(pending, /CDP socket closed before the response arrived/);
});
