import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Windows CI bounds competing test files without dropping any Desktop tests or changing their deadlines", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts.test, "node --test test/*.test.mjs");
  assert.equal(manifest.scripts["test:ci"], "node --test --test-concurrency=4 test/*.test.mjs");
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
