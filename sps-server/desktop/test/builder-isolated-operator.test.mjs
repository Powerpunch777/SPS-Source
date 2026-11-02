import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const exec = promisify(execFile);
const operator = path.resolve(import.meta.dirname, "../scripts/smoke-builder-conditional-state-isolated.mjs");

test("isolated Builder operator fails before fixture/account use without exact live-design opt-in", {
  skip: process.platform !== "win32" && "The operator is Windows-only.", timeout: 15_000,
}, async () => {
  const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "",
    TEMP: os.tmpdir(), TMP: os.tmpdir(), SPS_BUILDER_SOURCE_ROOT: os.tmpdir() };
  const optedIn = { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_DESIGN: "1" };
  for (const [args, env, message] of [
    [["--live-design"], {}, /both explicit opt-ins/],
    [["--live-design"], { SPS_BUILDER_LIVE_CODEX: "1" }, /both explicit opt-ins/],
    [["--live-design"], { SPS_BUILDER_LIVE_DESIGN: "1" }, /both explicit opt-ins/],
    [[], optedIn, /both explicit opt-ins/],
    [["--build-only"], optedIn, /both explicit opt-ins/],
    [["--live-design"], { ...optedIn, OPENAI_API_KEY: "test-not-a-real-key" }, /without API key/],
    [["--live-design"], { ...optedIn, PAPERCLIP_CODEX_PROVIDERS: "test-only" }, /provider substitution/],
    [["--live-design"], { ...optedIn, SPS_BUILDER_LIVE_CANCEL: "1" }, /cancellation probes/],
    [["--live-design"], { ...optedIn, SPS_DESKTOP_E2E_BINARY: "unapproved.exe" }, /installed binaries/],
    [["--live-design", "--build-only"], optedIn, /Only --build-only or --live-design/],
  ]) {
    await assert.rejects(exec(process.execPath, [operator, ...args], {
      env: { ...base, ...env }, windowsHide: true, timeout: 3_000, maxBuffer: 64 * 1024,
    }), error => {
      assert.equal(error.killed, false, "A guard rejection must not be a process timeout.");
      assert.equal(error.code, 1);
      assert.match(error.stderr, message);
      return true;
    });
  }
});
