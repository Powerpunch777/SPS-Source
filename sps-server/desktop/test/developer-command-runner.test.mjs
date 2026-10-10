import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createDeveloperCommandEnvironment,
  runSpsDeveloperCommand,
} from "../src/developer-command-runner.mjs";

async function fixture(scriptBody) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-developer-command-"));
  const source = path.join(root, "source");
  const cli = path.join(root, "sdk-cli.mjs");
  await mkdir(source);
  await writeFile(cli, scriptBody, "utf8");
  return { root, source, cli };
}

function result(command, success = true) {
  const hash = "a".repeat(64);
  return {
    schemaVersion: "development-build/v1",
    command,
    success,
    sourceFingerprint: hash,
    manifestSha256: hash,
    workerSha256: hash,
    uiSha256: null,
    startedAt: "2026-07-31T00:00:00.000Z",
    completedAt: "2026-07-31T00:00:01.000Z",
    diagnostics: success ? [] : [{ code: "FAILED", phase: command, message: "Expected failure" }],
  };
}

test("runs only the exact SDK JSON command with a redacted environment", async () => {
  const data = result("build");
  const entry = await fixture(`process.stdout.write(${JSON.stringify(`${JSON.stringify(data)}\n`)});`);
  try {
    const report = await runSpsDeveloperCommand({
      command: "build",
      sourceDirectory: entry.source,
      nodeCommand: process.execPath,
      sdkCliPath: entry.cli,
      environment: { PATH: "safe", ELECTRON_RUN_AS_NODE: "1", OPENAI_API_KEY: "secret", SPS_AUTH_SECRET: "secret" },
    });
    assert.equal(report.success, true);
    assert.equal(report.result.sourceFingerprint, "a".repeat(64));
    assert.deepEqual(createDeveloperCommandEnvironment({
      PATH: "safe",
      ELECTRON_RUN_AS_NODE: "1",
      OPENAI_API_KEY: "secret",
      SPS_AUTH_SECRET: "secret",
    }), { ELECTRON_RUN_AS_NODE: "1", PATH: "safe" });
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});

test("accepts an expected failed gate without leaking raw command output", async () => {
  const data = result("validate", false);
  const entry = await fixture(`process.stdout.write(${JSON.stringify(`${JSON.stringify(data)}\n`)}); process.stderr.write("private raw log"); process.exitCode = 1;`);
  try {
    const report = await runSpsDeveloperCommand({
      command: "validate",
      sourceDirectory: entry.source,
      nodeCommand: process.execPath,
      sdkCliPath: entry.cli,
    });
    assert.equal(report.success, false);
    assert.equal(report.result.diagnostics[0].message, "Expected failure");
    assert.doesNotMatch(JSON.stringify(report), /private raw log/);
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});

test("rejects arbitrary commands, malformed results, and exit/result mismatches", async () => {
  const entry = await fixture('process.stdout.write("{}\\n");');
  try {
    await assert.rejects(() => runSpsDeveloperCommand({
      command: "pack",
      sourceDirectory: entry.source,
      nodeCommand: process.execPath,
      sdkCliPath: entry.cli,
    }), /must be build, validate, or test/);
    await assert.rejects(() => runSpsDeveloperCommand({
      command: "test",
      sourceDirectory: entry.source,
      nodeCommand: process.execPath,
      sdkCliPath: entry.cli,
    }), /invalid result|incompatible result/);

    await writeFile(entry.cli, `process.stdout.write(${JSON.stringify(`${JSON.stringify(result("test", false))}\n`)});`, "utf8");
    await assert.rejects(() => runSpsDeveloperCommand({
      command: "test",
      sourceDirectory: entry.source,
      nodeCommand: process.execPath,
      sdkCliPath: entry.cli,
    }), /exit status did not match/);
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});

test("rejects a symlink source root", async (t) => {
  const entry = await fixture(`process.stdout.write(${JSON.stringify(`${JSON.stringify(result("build"))}\n`)});`);
  const linked = path.join(entry.root, "linked-source");
  try {
    try {
      await symlink(entry.source, linked, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("Symlink creation is unavailable for this Windows account.");
        return;
      }
      throw error;
    }
    await assert.rejects(() => runSpsDeveloperCommand({
      command: "build",
      sourceDirectory: linked,
      nodeCommand: process.execPath,
      sdkCliPath: entry.cli,
    }), /not a symlink or junction/);
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});

test("bounds output and terminates a timed-out command", async () => {
  const entry = await fixture('setTimeout(() => process.stdout.write("{}\\n"), 10_000);');
  try {
    await assert.rejects(() => runSpsDeveloperCommand({
      command: "build",
      sourceDirectory: entry.source,
      nodeCommand: process.execPath,
      sdkCliPath: entry.cli,
      timeoutMs: 50,
    }), /timed out/);

    await writeFile(entry.cli, 'process.stdout.write("x".repeat(300000));', "utf8");
    await assert.rejects(() => runSpsDeveloperCommand({
      command: "build",
      sourceDirectory: entry.source,
      nodeCommand: process.execPath,
      sdkCliPath: entry.cli,
    }), /bounded output limit/);
  } finally {
    await rm(entry.root, { recursive: true, force: true });
  }
});
