import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { desktopCiTestPlan, runDesktopCiTests } from "../scripts/run-desktop-ci-tests.mjs";

test("Windows CI bounds competing test files without dropping any Desktop tests or changing their deadlines", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.test, "node --test test/*.test.mjs");
  assert.equal(manifest.scripts["test:ci"], "node scripts/run-desktop-ci-tests.mjs");
  assert.equal(manifest.scripts["pretest:ci"], manifest.scripts.pretest);
  const workflow = await readFile(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("- name: Test SPS Desktop invite and update flow");
  const end = workflow.indexOf("- name:", start + 10);
  assert.ok(start >= 0 && end > start);
  assert.match(workflow.slice(start, end), /working-directory: sps-server\/desktop\s+run: npm run test:ci/);
  const runner = await readFile(new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url), "utf8");
  assert.match(runner, /mode == "probe-installer-command-exit" \? 45u \* 1000u/);
  assert.match(runner, /: 18u \* 60u \* 1000u;/);
});

test("CI stages include every discovered test exactly once and isolate only the real command-exit file", async () => {
  const names = (await readdir(new URL("./", import.meta.url))).filter(name => name.endsWith(".test.mjs"));
  const plan = desktopCiTestPlan(names);
  assert.deepEqual(plan[0], { name: "owned-command-observation", concurrency: 1,
    files: ["test/installer-command-exit-observation.test.mjs"] });
  assert.equal(plan[1].concurrency, 4);
  assert.deepEqual(plan.flatMap(stage => stage.files).sort(), names.map(name => `test/${name}`).sort());
  assert.equal(new Set(plan.flatMap(stage => stage.files)).size, names.length);
  assert.deepEqual(desktopCiTestPlan([...names].reverse()), plan);
  for (const invalid of [[], ["ordinary.test.mjs"], ["ordinary.test.mjs", "ordinary.test.mjs"],
    ["installer-command-exit-observation.test.mjs", "../escape.test.mjs"],
    ["installer-command-exit-observation.test.mjs", "test/ordinary.test.mjs"]]) {
    assert.throws(() => desktopCiTestPlan(invalid));
  }
});

test("CI runs stages in sequence and never hides a first or second process failure", async () => {
  const names = ["ordinary.test.mjs", "installer-command-exit-observation.test.mjs"];
  for (const [results, expectedCode, expectedCalls] of [
    [[{ code: 0, signal: null }, { code: 0, signal: null }], 0, 2],
    [[{ code: 7, signal: null }], 7, 1],
    [[{ code: 0, signal: null }, { code: 5, signal: null }], 5, 2],
    [[{ code: null, signal: "SIGTERM" }], 1, 1],
  ]) {
    const calls = [];
    const code = await runDesktopCiTests(names, async args => {
      calls.push(args);
      await Promise.resolve();
      return results[calls.length - 1];
    });
    assert.equal(code, expectedCode);
    assert.equal(calls.length, expectedCalls);
    assert.deepEqual(calls[0], ["--test", "--test-concurrency=1", "test/installer-command-exit-observation.test.mjs"]);
    if (calls[1]) assert.deepEqual(calls[1], ["--test", "--test-concurrency=4", "test/ordinary.test.mjs"]);
  }
  await assert.rejects(runDesktopCiTests(names, async () => { throw new Error("fixture spawn failure"); }), /fixture spawn failure/);
  for (const result of [{}, { code: 0 }, { code: -1, signal: null }, { code: NaN, signal: null }]) {
    await assert.rejects(runDesktopCiTests(names, async () => result));
  }
});
