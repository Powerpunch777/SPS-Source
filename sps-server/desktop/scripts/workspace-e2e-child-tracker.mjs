import { ChildProcess } from "node:child_process";

export function createWorkspaceE2eChildTracker() {
  const records = [];
  const waiters = new Set();
  let disposed = false;

  function summarize() {
    let exited = 0;
    let orderly = 0;
    let outputEnded = 0;
    let outputFailed = 0;
    for (const record of records) {
      const childExited = record.exitObserved || record.child.exitCode != null || record.child.signalCode != null;
      const code = record.exitObserved ? record.exitCode : record.child.exitCode;
      const signal = record.exitObserved ? record.signalCode : record.child.signalCode;
      if (childExited) exited += 1;
      if (childExited && code === 0 && signal === null) orderly += 1;
      for (const stream of record.streams) {
        if (stream.ended) outputEnded += 1;
        if (stream.failed) outputFailed += 1;
      }
    }
    return { children: records.length, exited, orderly, outputEnded, outputFailed };
  }

  function outputsSettled() {
    return records.every(record => record.streams.every(stream => stream.ended || stream.failed));
  }

  function settle(waiter) {
    waiters.delete(waiter);
    if (waiter.timer) clearTimeout(waiter.timer);
    waiter.resolve(summarize());
  }

  function notifyWaiters() {
    if (outputsSettled()) for (const waiter of [...waiters]) settle(waiter);
  }

  function listen(record, emitter, event, listener) {
    emitter.on(event, listener);
    record.listeners.push([emitter, event, listener]);
  }

  function isExited(record) {
    return record.exitObserved || record.child.exitCode != null || record.child.signalCode != null;
  }

  function track(child) {
    if (disposed) throw new Error("Workspace E2E child tracker has been disposed.");
    if (!(child instanceof ChildProcess)) throw new TypeError("Expected a Node ChildProcess.");
    if (records.some(record => record.child === child)) throw new Error("ChildProcess is already tracked.");

    const record = { child, exitObserved: false, exitCode: null, signalCode: null, streams: [], listeners: [] };
    records.push(record);
    listen(record, child, "exit", (code, signal) => {
      record.exitObserved = true;
      record.exitCode = code;
      record.signalCode = signal;
      notifyWaiters();
    });

    for (const stream of [child.stdout, child.stderr]) {
      const state = { stream, ended: false, failed: !stream };
      record.streams.push(state);
      if (!stream) continue;
      if (stream.readableEnded) state.ended = true;
      else if (stream.destroyed) state.failed = true;
      else {
        listen(record, stream, "data", () => {});
        listen(record, stream, "end", () => {
          state.ended = true;
          notifyWaiters();
        });
        listen(record, stream, "error", () => {
          state.failed = true;
          notifyWaiters();
        });
        listen(record, stream, "close", () => {
          if (!state.ended) state.failed = true;
          notifyWaiters();
        });
      }
    }
    notifyWaiters();
    return child;
  }

  function waitForOutputEnd(timeoutMs = 5000) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) {
      throw new RangeError("timeoutMs must be an integer from 1 through 10000.");
    }
    if (disposed || outputsSettled()) return Promise.resolve(summarize());
    return new Promise(resolve => {
      const waiter = { resolve, timer: null };
      waiters.add(waiter);
      waiter.timer = setTimeout(() => settle(waiter), timeoutMs);
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const waiter of [...waiters]) settle(waiter);
    for (const record of records) {
      for (const [emitter, event, listener] of record.listeners) emitter.removeListener(event, listener);
      record.listeners.length = 0;
    }
    for (const record of records) {
      if (!isExited(record)) continue;
      for (const state of record.streams) {
        if (state.stream && !state.ended && !state.stream.destroyed) state.stream.destroy();
      }
    }
  }

  return { track, summarize, waitForOutputEnd, dispose };
}
