import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { promisify } from "node:util";

const exec = promisify(execFile);
const operator = path.resolve(import.meta.dirname, "../scripts/smoke-builder-conditional-state-isolated.mjs");

test("isolated Builder summary identifies every live scope, including baseline", async () => {
  const source = await readFile(operator, "utf8");
  const summary = source.slice(source.lastIndexOf("console.log(JSON.stringify({ kind:"));
  assert.ok(summary.startsWith("console.log(JSON.stringify({ kind:"));
  for (const mode of [null, "buildOnly", "liveDesign", "liveMemory", "liveQuestion", "liveCtos", "liveBaseline", "liveWorkstreams"]) {
    const scopes = Object.fromEntries(["buildOnly", "liveDesign", "liveMemory", "liveQuestion", "liveCtos", "liveBaseline", "liveWorkstreams"].map(key => [key, key === mode]));
    let result;
    runInNewContext(summary, { ...scopes, revision: "test-sdk", console: { log(value) { result = JSON.parse(value); } } });
    assert.equal(result.liveAi, mode !== null && mode !== "buildOnly");
    assert.equal(result.mode, mode === "liveBaseline" ? "source-app-live-baseline" : mode === "buildOnly" ? "build-only"
      : mode === null ? "source-app" : `source-app-live-${mode.slice(4).toLowerCase()}`);
  }
});

test("isolated Builder operator rejects missing or mixed live-scope opt-ins before fixture/account use", {
  skip: process.platform !== "win32" && "The operator is Windows-only.", timeout: 15_000,
}, async () => {
  const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "",
    TEMP: os.tmpdir(), TMP: os.tmpdir(), SPS_BUILDER_SOURCE_ROOT: os.tmpdir() };
  const optedIn = { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_DESIGN: "1" };
  const ctosOptedIn = { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_CTOS: "1" };
  const baselineOptedIn = { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_BASELINE: "1" };
  const workstreamsOptedIn = { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_WORKSTREAMS: "1" };
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
    [["--live-memory"], {}, /both explicit opt-ins/],
    [["--live-memory"], { SPS_BUILDER_LIVE_CODEX: "1" }, /both explicit opt-ins/],
    [["--live-memory"], { SPS_BUILDER_LIVE_MEMORY: "1" }, /both explicit opt-ins/],
    [[], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_MEMORY: "1" }, /both explicit opt-ins/],
    [["--live-memory"], { ...optedIn, SPS_BUILDER_LIVE_MEMORY: "1" }, /both explicit opt-ins/],
    [["--live-memory"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_MEMORY: "1", OPENAI_API_KEY: "test-only" }, /without API key/],
    [["--live-question"], {}, /both explicit opt-ins/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1" }, /both explicit opt-ins/],
    [["--live-question"], { SPS_BUILDER_LIVE_QUESTION: "1" }, /both explicit opt-ins/],
    [[], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1" }, /both explicit opt-ins/],
    [["--build-only"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1" }, /both explicit opt-ins/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", SPS_BUILDER_LIVE_DESIGN: "1" }, /both explicit opt-ins/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", SPS_BUILDER_LIVE_MEMORY: "1" }, /both explicit opt-ins/],
    [["--live-design"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_DESIGN: "1", SPS_BUILDER_LIVE_QUESTION: "1" }, /both explicit opt-ins/],
    [["--live-memory"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_MEMORY: "1", SPS_BUILDER_LIVE_QUESTION: "1" }, /both explicit opt-ins/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", OPENAI_API_KEY: "test-not-a-real-key" }, /without API key/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", PAPERCLIP_CODEX_PROVIDERS: "test-only" }, /provider substitution/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", SPS_BUILDER_LIVE_CANCEL: "1" }, /cancellation probes/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", SPS_DESKTOP_E2E_BINARY: "unapproved.exe" }, /installed binaries/],
    [["--live-question", "--live-design"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1" }, /Only --build-only or --live-design/],
    [["--live-ctos"], {}, /Live scope requires/],
    [["--live-ctos"], { SPS_BUILDER_LIVE_CODEX: "1" }, /Live scope requires/],
    [["--live-ctos"], { SPS_BUILDER_LIVE_CTOS: "1" }, /Live scope requires/],
    [[], ctosOptedIn, /Live scope requires/],
    [["--build-only"], ctosOptedIn, /Live scope requires/],
    [["--live-ctos"], { SPS_BUILDER_LIVE_CODEX: "true", SPS_BUILDER_LIVE_CTOS: "1" }, /Live scope requires/],
    [["--live-ctos"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_CTOS: "true" }, /Live scope requires/],
    [["--live-ctos"], { ...ctosOptedIn, SPS_BUILDER_LIVE_CANCEL: "1" }, /cancellation probes/],
    [["--live-ctos"], { ...ctosOptedIn, SPS_BUILDER_LIVE_DESIGN: "1" }, /Live scope requires/],
    [["--live-ctos"], { ...ctosOptedIn, SPS_BUILDER_LIVE_MEMORY: "1" }, /Live scope requires/],
    [["--live-ctos"], { ...ctosOptedIn, SPS_BUILDER_LIVE_QUESTION: "1" }, /Live scope requires/],
    [["--live-ctos"], { ...ctosOptedIn, OPENAI_API_KEY: "test-only" }, /Live scope requires/],
    [["--live-ctos"], { ...ctosOptedIn, PAPERCLIP_CODEX_PROVIDERS: "test-only" }, /Live scope requires/],
    [["--live-ctos"], { ...ctosOptedIn, SPS_DESKTOP_E2E_BINARY: "unapproved.exe" }, /installed binaries/],
    [["--live-ctos", "--live-question"], ctosOptedIn, /Only --build-only or --live-design/],
    [["--live-design"], { ...optedIn, SPS_BUILDER_LIVE_CTOS: "1" }, /Live scope requires/],
    [["--live-memory"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_MEMORY: "1", SPS_BUILDER_LIVE_CTOS: "1" }, /Live scope requires/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", SPS_BUILDER_LIVE_CTOS: "1" }, /Live scope requires/],
    [[], { SPS_BUILDER_LIVE_BASELINE: "1" }, /Live scope requires/],
    [[], { SPS_BUILDER_LIVE_BASELINE: "" }, /Live scope requires/],
    [[], baselineOptedIn, /Live scope requires/],
    [["--build-only"], baselineOptedIn, /Live scope requires/],
    [["--build-only"], { SPS_BUILDER_LIVE_BASELINE: "" }, /Live scope requires/],
    [["--live-baseline"], {}, /Live scope requires/],
    [["--live-baseline"], { SPS_BUILDER_LIVE_CODEX: "1" }, /Live scope requires/],
    [["--live-baseline"], { SPS_BUILDER_LIVE_BASELINE: "1" }, /Live scope requires/],
    [["--live-baseline"], { SPS_BUILDER_LIVE_CODEX: "true", SPS_BUILDER_LIVE_BASELINE: "1" }, /Live scope requires/],
    [["--live-baseline"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_BASELINE: "true" }, /Live scope requires/],
    [["--live-baseline"], { ...baselineOptedIn, SPS_BUILDER_LIVE_DESIGN: "1" }, /Live scope requires/],
    [["--live-baseline"], { ...baselineOptedIn, SPS_BUILDER_LIVE_MEMORY: "1" }, /Live scope requires/],
    [["--live-baseline"], { ...baselineOptedIn, SPS_BUILDER_LIVE_QUESTION: "1" }, /Live scope requires/],
    [["--live-baseline"], { ...baselineOptedIn, SPS_BUILDER_LIVE_CTOS: "1" }, /Live scope requires/],
    [["--live-baseline"], { ...baselineOptedIn, SPS_BUILDER_LIVE_CANCEL: "1" }, /cancellation probes/],
    [["--live-baseline"], { ...baselineOptedIn, OPENAI_API_KEY: "test-not-a-real-key" }, /Live scope requires/],
    [["--live-baseline"], { ...baselineOptedIn, PAPERCLIP_CODEX_PROVIDERS: "test-only" }, /Live scope requires/],
    [["--live-baseline"], { ...baselineOptedIn, SPS_DESKTOP_E2E_BINARY: "unapproved.exe" }, /installed binaries/],
    [["--live-baseline", "--live-design"], baselineOptedIn, /Only --build-only or --live-design/],
    [["--live-baseline", "--build-only"], baselineOptedIn, /Only --build-only or --live-design/],
    [["--live-design"], { ...optedIn, SPS_BUILDER_LIVE_BASELINE: "1" }, /Live scope requires/],
    [["--live-memory"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_MEMORY: "1", SPS_BUILDER_LIVE_BASELINE: "1" }, /Live scope requires/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", SPS_BUILDER_LIVE_BASELINE: "1" }, /Live scope requires/],
    [["--live-ctos"], { ...ctosOptedIn, SPS_BUILDER_LIVE_BASELINE: "1" }, /Live scope requires/],
    [["--live-design"], { ...optedIn, SPS_BUILDER_LIVE_BASELINE: "" }, /Live scope requires/],
    [["--live-workstreams"], {}, /Live scope requires/],
    [["--live-workstreams"], { SPS_BUILDER_LIVE_CODEX: "1" }, /Live scope requires/],
    [["--live-workstreams"], { SPS_BUILDER_LIVE_WORKSTREAMS: "1" }, /Live scope requires/],
    [[], workstreamsOptedIn, /Live scope requires/],
    [["--build-only"], workstreamsOptedIn, /Live scope requires/],
    [["--live-workstreams"], { SPS_BUILDER_LIVE_CODEX: "true", SPS_BUILDER_LIVE_WORKSTREAMS: "1" }, /Live scope requires/],
    [["--live-workstreams"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_WORKSTREAMS: "true" }, /Live scope requires/],
    [["--live-workstreams"], { ...workstreamsOptedIn, SPS_BUILDER_LIVE_DESIGN: "1" }, /Live scope requires/],
    [["--live-workstreams"], { ...workstreamsOptedIn, SPS_BUILDER_LIVE_MEMORY: "1" }, /Live scope requires/],
    [["--live-workstreams"], { ...workstreamsOptedIn, SPS_BUILDER_LIVE_QUESTION: "1" }, /Live scope requires/],
    [["--live-workstreams"], { ...workstreamsOptedIn, SPS_BUILDER_LIVE_CTOS: "1" }, /Live scope requires/],
    [["--live-workstreams"], { ...workstreamsOptedIn, SPS_BUILDER_LIVE_BASELINE: "1" }, /Live scope requires/],
    [["--live-workstreams"], { ...workstreamsOptedIn, SPS_BUILDER_LIVE_CANCEL: "1" }, /cancellation probes/],
    [["--live-workstreams"], { ...workstreamsOptedIn, OPENAI_API_KEY: "test-not-a-real-key" }, /Live scope requires/],
    [["--live-workstreams"], { ...workstreamsOptedIn, PAPERCLIP_CODEX_PROVIDERS: "test-only" }, /Live scope requires/],
    [["--live-workstreams"], { ...workstreamsOptedIn, SPS_DESKTOP_E2E_BINARY: "unapproved.exe" }, /installed binaries/],
    [["--live-workstreams", "--build-only"], workstreamsOptedIn, /Only --build-only or --live-design/],
    [["--live-workstreams", "--live-baseline"], workstreamsOptedIn, /Only --build-only or --live-design/],
    [["--live-design"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_DESIGN: "1", SPS_BUILDER_LIVE_WORKSTREAMS: "1" }, /Live scope requires/],
    [["--live-design"], { ...optedIn, SPS_BUILDER_LIVE_WORKSTREAMS: "1" }, /Live scope requires/],
    [["--live-memory"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_MEMORY: "1", SPS_BUILDER_LIVE_WORKSTREAMS: "1" }, /Live scope requires/],
    [["--live-question"], { SPS_BUILDER_LIVE_CODEX: "1", SPS_BUILDER_LIVE_QUESTION: "1", SPS_BUILDER_LIVE_WORKSTREAMS: "1" }, /Live scope requires/],
    [["--live-ctos"], { ...ctosOptedIn, SPS_BUILDER_LIVE_WORKSTREAMS: "1" }, /Live scope requires/],
    [["--live-baseline"], { ...baselineOptedIn, SPS_BUILDER_LIVE_WORKSTREAMS: "1" }, /Live scope requires/],
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
