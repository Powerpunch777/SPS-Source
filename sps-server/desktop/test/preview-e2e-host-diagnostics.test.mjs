import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, rmdir, symlink, truncate, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ownerHostVaultLayout } from "../src/owner-host-config.mjs";
import { collectPreviewE2eHostDiagnostics } from "../scripts/preview-e2e-host-diagnostics.mjs";

async function fixture(run) {
  const temp = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(temp, "sps-plugin-preview-desktop-e2e-diagnostics-"));
  const identity = await lstat(root, { bigint: true });
  const folder = ownerHostVaultLayout(path.join(root, "user-data", "owner-vault")).logDir, log = path.join(folder, "server.log");
  try {
    await mkdir(folder, { recursive: true });
    await run({ root, folder, log, collect: () => collectPreviewE2eHostDiagnostics({ fixtureRoot: root }) });
  } finally {
    const current = await lstat(root, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino); assert.equal(current.birthtimeNs, identity.birthtimeNs);
    assert.equal(await realpath(root), root); assert.equal(path.dirname(root), temp);
    assert.match(path.basename(root), /^sps-plugin-preview-desktop-e2e-diagnostics-/);
    await rm(root, { recursive: true });
  }
}

test("projects only fixed error categories and a message digest from real pretty/JSON log records", async () => fixture(async ({ log, collect }) => {
  const message = "EACCES permission denied C:\\Users\\customer\\private.txt user@private.test token=very-secret-value";
  await writeFile(log, `[12:00:00] ERROR: unhandled request error ${JSON.stringify({ errorName: "Error", errorMessage: message, url: "/private?token=hidden", reqBody: { secret: "hidden" } })}\n`
    + `${JSON.stringify({ level: 50, err: { type: "PostgresError", code: "23505", message: "duplicate key violates unique constraint", stack: "private stack" } })}\n`);
  const before = await readFile(log);
  const result = await collect();
  assert.deepEqual(result, { status: "captured", errors: [
    { type: "Error", code: null, category: "permission_denied", messageSha256: createHash("sha256").update(message).digest("hex") },
    { type: "PostgresError", code: "23505", category: "database_constraint", messageSha256: createHash("sha256").update("duplicate key violates unique constraint").digest("hex") },
  ] });
  assert.doesNotMatch(JSON.stringify(result), /customer|private|secret|user@|stack|url|reqBody/);
  assert.deepEqual(await readFile(log), before);
  await writeFile(log, `[12:00:00] ERROR: nested error ${JSON.stringify({ err: { type: "Error", code: "ENOENT", message: "no such file" } })}\n`);
  assert.equal((await collect()).errors[0].code, "ENOENT");
}));

test("never projects arbitrary error type/code/message or non-error log metadata", async () => fixture(async ({ log, collect }) => {
  await writeFile(log, [
    JSON.stringify({ level: 30, err: { message: "EACCES should be ignored" } }),
    "not JSON: customer@private.test",
    JSON.stringify({ level: 50, err: { type: "customer@private.test", code: "99ABC", message: "customer@private.test" } }),
    JSON.stringify({ level: 50, errorContext: { name: "TypeError", message: "cannot read properties of undefined", raw: "secret" } }),
  ].join("\n"));
  const result = await collect();
  assert.equal(result.status, "captured"); assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].type, "UnknownError"); assert.equal(result.errors[0].code, null);
  assert.equal(result.errors[0].category, "unclassified"); assert.equal(result.errors[1].category, "javascript_contract");
  assert.doesNotMatch(JSON.stringify(result), /customer|private|secret|undefined/);
}));

test("bounds the read tail and retains at most five structured errors", async () => fixture(async ({ log, collect }) => {
  const records = Array.from({ length: 8 }, () => JSON.stringify({ level: 50, err: { type: "Error", code: "ENOENT", message: "no such file" } }));
  await writeFile(log, `${"x".repeat(70 * 1024)}\n${records.join("\n")}\n`);
  const result = await collect();
  assert.equal(result.status, "captured"); assert.equal(result.errors.length, 5);
  assert.ok(result.errors.every(error => error.code === "ENOENT"));
}));

test("reports no structured errors without returning malformed or oversized messages", async () => fixture(async ({ log, collect }) => {
  await writeFile(log, `invalid {json}\n${JSON.stringify({ level: 50, err: { message: "x".repeat(8193) } })}\n`);
  assert.deepEqual(await collect(), { status: "no_structured_error", errors: [] });
}));

test("fails closed for missing logs, oversized files, invalid UTF-8 and paths outside the fixture", async () => fixture(async ({ root, log, collect }) => {
  assert.deepEqual(await collect(), { status: "unavailable", reason: "invalid_or_missing_path", errors: [] });
  await writeFile(log, ""); await truncate(log, 8 * 1024 * 1024 + 1);
  assert.equal((await collect()).reason, "file_too_large");
  await writeFile(log, Buffer.from([0xff, 0xfe]));
  assert.equal((await collect()).reason, "invalid_utf8");
  for (const fixtureRoot of [undefined, ".", path.join(root, "nested"), os.tmpdir()]) {
    assert.equal((await collectPreviewE2eHostDiagnostics({ fixtureRoot })).reason, "invalid_or_missing_path");
  }
}));

test("reports changed-during-read without exposing filesystem details", async () => fixture(async ({ log, collect }) => {
  await writeFile(log, "x".repeat(128 * 1024));
  const originalOpen = fs.open;
  fs.open = async (...args) => {
    const handle = await originalOpen(...args);
    const originalRead = handle.read.bind(handle);
    let changed = false;
    handle.read = async (...readArgs) => {
      if (!changed) { changed = true; await truncate(log, 0); }
      return originalRead(...readArgs);
    };
    return handle;
  };
  try {
    const result = await collect();
    assert.deepEqual(result, { status: "unavailable", reason: "changed_during_read", errors: [] });
    assert.doesNotMatch(JSON.stringify(result), /fixture|server\.log|private/);
  } finally { fs.open = originalOpen; }
}));

test("collapses I/O exceptions to a fixed reason without copying messages or codes", async () => fixture(async ({ log, collect }) => {
  await writeFile(log, "valid log");
  const originalOpen = fs.open;
  fs.open = async () => { throw Object.assign(new Error("private fixture path token=secret"), { code: "EACCES" }); };
  try {
    const result = await collect();
    assert.deepEqual(result, { status: "unavailable", reason: "io_error", errors: [] });
    assert.doesNotMatch(JSON.stringify(result), /private|fixture|token|secret|EACCES/);
  } finally { fs.open = originalOpen; }
}));

test("distinguishes an unusable bounded tail from an oversized file", async () => fixture(async ({ log, collect }) => {
  await writeFile(log, "x".repeat(70 * 1024));
  assert.deepEqual(await collect(), { status: "unavailable", reason: "tail_unusable", errors: [] });
}));

test("hostile I/O exception metadata cannot escape the safe collector", async () => fixture(async ({ log, collect }) => {
  await writeFile(log, "valid log");
  const originalOpen = fs.open;
  let getterCalls = 0;
  const accessor = Object.defineProperty(new Error("private"), "code", { get() { getterCalls += 1; throw new Error("secret"); } });
  const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("secret"); }, getPrototypeOf() { throw new Error("secret"); } });
  try {
    for (const error of [accessor, hostile]) {
      fs.open = async () => { throw error; };
      assert.deepEqual(await collect(), { status: "unavailable", reason: "io_error", errors: [] });
    }
    assert.equal(getterCalls, 0);
  } finally { fs.open = originalOpen; }
}));

test("rejects linked logs and directory junctions rather than following them", async () => fixture(async ({ root, folder, log, collect }) => {
  const other = path.join(root, "other"); await mkdir(other);
  const target = path.join(other, "server.log"); await writeFile(target, "private fixture");
  await link(target, log);
  assert.equal((await collect()).reason, "unsafe_path");
  await unlink(log);
  await rmdir(folder);
  await symlink(other, folder, process.platform === "win32" ? "junction" : "dir");
  assert.equal((await collect()).reason, "unsafe_path");
  assert.equal(await readFile(target, "utf8"), "private fixture");
  assert.equal(await realpath(log), await realpath(target));
}));
