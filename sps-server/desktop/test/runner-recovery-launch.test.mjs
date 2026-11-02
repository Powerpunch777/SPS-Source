import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { runnerRecoveryArguments, parseRunnerRecoveryArguments } from "../scripts/runner-recovery-launch.mjs";

const fixture = {
  entry: path.resolve("fixture scripts", "runner.mjs"), root: path.resolve("owned fixture", "runner-a"),
  phase: "claim-loss", executable: path.resolve("owned fixture", "bin", "ollama.exe"),
  endpoint: `http://127.0.0.1:12345/runner-recovery/${"a".repeat(64)}`,
};

test("Runner component launch isolates Chromium early and keeps the URL last", () => {
  const args = runnerRecoveryArguments(fixture);
  assert.equal(args[0], `--user-data-dir=${path.join(fixture.root, "electron-data")}`);
  assert.equal(args.at(-1), fixture.endpoint);
  assert.deepEqual(parseRunnerRecoveryArguments(["electron.exe", ...args], fixture.entry), {
    root: fixture.root, phase: fixture.phase, executable: fixture.executable, endpoint: fixture.endpoint,
  });
});

test("Runner launch parser rejects missing, extra, reordered and foreign user-data arguments", () => {
  const argv = ["electron.exe", ...runnerRecoveryArguments(fixture)];
  for (const malformed of [argv.slice(0, -1), [...argv, "extra"],
    [argv[0], argv[2], argv[1], ...argv.slice(3)],
    [argv[0], "--user-data-dir=other-profile", ...argv.slice(2)],
    [...argv.slice(0, 5), "other-phase", ...argv.slice(6)]]) {
    assert.throws(() => parseRunnerRecoveryArguments(malformed, fixture.entry));
  }
  assert.throws(() => parseRunnerRecoveryArguments(argv, "other-entry.mjs"));
});
