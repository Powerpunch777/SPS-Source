import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { shutdownPreviewE2eDesktop } from "../scripts/preview-e2e-shutdown.mjs";
import { previewE2eCleanupDisposition } from "../scripts/preview-e2e-cleanup-contract.mjs";

const source = (await readFile(new URL("../scripts/smoke-host-plugin-lifecycle-desktop.mjs", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const cleanupStart = source.lastIndexOf("} finally {");
const cleanupEnd = source.indexOf("\n}\n\nif (!cleanupDisposition)", cleanupStart);
assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart, "Actual lifecycle cleanup section must remain present.");
const cleanup = source.slice(cleanupStart + "} finally {".length, cleanupEnd);

function runCleanup({ failedSession, identityFailure = false, dataFailure = false, forced = false,
  originalFailure = null, keepFailed = false, delegated = true } = {}) {
  const calls = [];
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const session = name => ({
    command: async () => {
      calls.push("Browser.close");
      child.exitCode = 0;
      child.emit("exit", 0, null);
    },
    close: async () => {
      calls.push(`close:${name}`);
      if (failedSession === name) throw new Error("private CDP failure");
    },
  });
  const sandbox = {
    child, registry: session("registry"), workspace: session("workspace"), setup: session("setup"),
    shutdownPreviewE2eDesktop: forced ? async () => ({ exitConfirmed: true, graceful: false }) : shutdownPreviewE2eDesktop,
    stopTree: async () => { calls.push("force"); },
    previewE2eCleanupDisposition,
    cleanupTimeout: async (operation, label, timeout) => {
      if (label === "temporary data") assert.equal(timeout, 20_000);
      return await operation;
    },
    identity: { close: async () => { calls.push("identity"); if (identityFailure) throw new Error("private Identity failure"); } },
    removeOwnedTemporaryRoot: async () => { calls.push("data"); if (dataFailure) throw new Error("private filesystem failure"); },
    temporaryRoot: "unused-fixture-path",
    succeeded: originalFailure === null,
    acceptanceFailure: originalFailure,
    cleanupDisposition: null,
    ownedJobCleanupPending: delegated,
    process: { env: { SPS_DESKTOP_E2E_KEEP_FAILED: keepFailed ? "1" : "0" } },
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  const operation = vm.runInNewContext(`(async () => {
    try { if (acceptanceFailure) throw acceptanceFailure; }
    finally { ${cleanup} }
    return cleanupDisposition;
  })()`, sandbox, { filename: "actual-host-lifecycle-cleanup.mjs" });
  return { operation, calls };
}

for (const delegated of [true, false]) {
  test(`actual lifecycle cleanup keeps ${delegated ? "launcher" : "standalone"} qualification pending after normal local cleanup`, async () => {
    const { operation, calls } = runCleanup({ delegated });
    const result = await operation;
    assert.equal(result.exitCode, 76);
    assert.equal(result.kind, "owned-job-cleanup-pending");
    assert.deepEqual(calls, ["Browser.close", "close:registry", "close:workspace", "close:setup", "identity", "data"]);
  });
}

for (const [name, options] of [
  ["forced Desktop exit", { forced: true }],
  ["failed CDP closure", { failedSession: "registry" }],
  ["failed Identity closure", { identityFailure: true }],
  ["failed temporary data cleanup", { dataFailure: true }],
]) {
  test(`actual lifecycle cleanup rejects ${name} after joining other resources`, async () => {
    const { operation, calls } = runCleanup(options);
    await assert.rejects(operation, error => /cleanup is incomplete/.test(error.message)
      && !/private/.test(error.message));
    assert.ok(calls.includes("close:registry"));
    assert.ok(calls.includes("close:workspace"));
    assert.ok(calls.includes("close:setup"));
    assert.ok(calls.includes("identity"));
    assert.ok(calls.includes("data"));
  });
}

test("actual lifecycle cleanup preserves the original assertion failure after successful cleanup", async () => {
  const originalFailure = new Error("original functional assertion");
  const { operation, calls } = runCleanup({ originalFailure });
  await assert.rejects(operation, error => error === originalFailure);
  assert.ok(calls.includes("data"));
});

test("actual lifecycle retained failed data cannot qualify and preserves the original cause", async () => {
  const originalFailure = new Error("original functional assertion");
  const { operation, calls } = runCleanup({ originalFailure, keepFailed: true });
  await assert.rejects(operation, error => /cleanup is incomplete/.test(error.message) && error.cause === originalFailure);
  assert.ok(calls.includes("identity"));
  assert.equal(calls.includes("data"), false);
});

const removeStart = source.indexOf("async function removeOwnedTemporaryRoot(");
const removeEnd = source.indexOf("async function cleanupTimeout(", removeStart);
assert.ok(removeStart >= 0 && removeEnd > removeStart);

function ownedRemoval({ metadata = {}, canonical, target } = {}) {
  const temporaryRoot = "C:\\fixture-temp\\sps-host-plugin-lifecycle-e2e-original";
  const identity = { dev: 1n, ino: 2n, birthtimeNs: 3n };
  const removed = [];
  const sandbox = {
    path: path.win32,
    os: { tmpdir: () => "C:\\fixture-temp" },
    temporaryRoot,
    temporaryRootCanonical: temporaryRoot,
    temporaryRootIdentity: identity,
    lstat: async () => ({ ...identity, isDirectory: () => true, isSymbolicLink: () => false, ...metadata }),
    realpath: async value => value === temporaryRoot ? canonical ?? temporaryRoot : value,
    removeRetry: async value => removed.push(value),
    target: target ?? temporaryRoot,
  };
  const operation = vm.runInNewContext(`${source.slice(removeStart, removeEnd)}\nremoveOwnedTemporaryRoot(target);`, sandbox,
    { filename: "actual-host-lifecycle-owned-remove.mjs" });
  return { operation, removed, temporaryRoot };
}

test("actual lifecycle removal accepts only the created canonical directory identity", async () => {
  const { operation, removed, temporaryRoot } = ownedRemoval();
  await operation;
  assert.deepEqual(removed, [temporaryRoot]);
});

for (const [name, options] of [
  ["replacement directory", { metadata: { ino: 99n } }],
  ["recreated directory with recycled inode", { metadata: { birthtimeNs: 99n } }],
  ["linked directory", { metadata: { isSymbolicLink: () => true } }],
  ["canonical path outside the created root", { canonical: "C:\\other-owner\\sps-host-plugin-lifecycle-e2e-original" }],
  ["another valid-looking fixture", { target: "C:\\fixture-temp\\sps-host-plugin-lifecycle-e2e-sibling" }],
]) {
  test(`actual lifecycle removal preserves ${name}`, async () => {
    const { operation, removed } = ownedRemoval(options);
    await assert.rejects(operation, /cleanup target|owned directory|identity|escaped|original/i);
    assert.deepEqual(removed, []);
  });
}
