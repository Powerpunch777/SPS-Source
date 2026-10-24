import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const desktop = path.resolve(import.meta.dirname, "..");
const runner = path.join(desktop, "scripts", "security-poc", "run-appcontainer-canary.mjs");
const helper = path.join(desktop, "scripts", "security-poc", "AppContainerCanary.cs");

test("runner rejects arbitrary modes, commands, and path arguments before execution", () => {
  for (const args of [["--run", "whoami"], ["--inject-timeout", "C:\\Users\\example"], ["--inject-timeout;whoami"]]) {
    const result = spawnSync(process.execPath, [runner, ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Usage:/);
    assert.doesNotMatch(result.stderr, /requires Windows/);
  }
});

test("helper exposes only fixed modes with a random-ID-shaped argument and confined temp paths", async () => {
  const [source, wrapper] = await Promise.all([
    readFile(helper, "utf8"),
    readFile(runner, "utf8")
  ]);
  assert.match(source, /args\.Length != 2 \|\| \(args\[0\] != "--run" && args\[0\] != "--cleanup" && args\[0\] != "--timeout-fixture" && args\[0\] != "--reparse-fixture"\) \|\| !Guid\.TryParseExact\(args\[1\], "N", out guid\)/);
  assert.match(source, /Path\.Combine\(tempRoot, "sps-appcontainer-poc-" \+ id\)/);
  assert.match(source, /Path\.GetDirectoryName\(root\), temp, StringComparison\.OrdinalIgnoreCase\)/);
  assert.match(source, /FileAttributes\.ReparsePoint/);
  assert.match(source, /CheckTree\(root\)/);
  assert.match(wrapper, /\["--cleanup", id\]/);
  assert.match(wrapper, /\["--timeout-fixture", id\]/);
  assert.match(wrapper, /\["--reparse-fixture", id\]/);
  assert.doesNotMatch(wrapper, /shell:\s*true/);
});

test("timeout fixture marker follows fake profile and fixture creation", async () => {
  const source = await readFile(helper, "utf8");
  const method = source.slice(source.indexOf("private static void RunTimeoutFixture"), source.indexOf("public static int Main"));
  assert.ok(method.indexOf("File.WriteAllText") < method.indexOf("CreateAppContainerProfile"));
  assert.ok(method.indexOf("CreateAppContainerProfile") < method.indexOf("timeoutFixtureReady"));
  assert.ok(method.indexOf("timeoutFixtureReady") < method.indexOf("Thread.Sleep(Timeout.Infinite)"));
  assert.match(method, /SPS-FAKE-SECRET-/);
});

test("helper rejects a temporary reparse fixture when directory symbolic-link creation is available", async t => {
  if (process.platform !== "win32") {
    t.skip("The helper requires Windows; no reparse fixture created.");
    return;
  }
  const result = spawnSync(process.execPath, [runner, "--check-reparse"], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.passed, true);
  assert.equal(report.cleanupSucceeded, true);
  assert.equal(report.fixtureResidue, false);
  assert.equal(report.helperBuildResidue, false);
  if (!report.reparseFixtureSupported) {
    t.skip("Temporary directory symbolic-link creation is unavailable; the helper cleaned its fake fixture.");
    return;
  }
  assert.equal(report.reparseRejected, true);
});
