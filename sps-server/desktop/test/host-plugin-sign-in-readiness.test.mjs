import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const scriptPath = new URL("../scripts/smoke-host-plugin-lifecycle-desktop.mjs", import.meta.url);
const script = (await readFile(scriptPath, "utf8")).replaceAll("\r\n", "\n");
const start = script.indexOf("async function waitForSignInReadiness(");
const end = script.indexOf("\nasync function waitForPluginManager", start);
assert.ok(start >= 0 && end > start, "Sign-in readiness helper boundaries must stay explicit for its contract tests.");
const helperSource = script.slice(start, end);

function createHarness(readinessStates) {
  let clicks = 0;
  let lastState = null;
  const expressions = [];
  const awaitPromises = [];
  const helpers = runInNewContext(`(${`function createSignInHelpers() {
    ${helperSource}
    return { waitForSignInReadiness, startSignInWhenReady };
  }`})()`, {
    Date,
    assert,
    delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    clickText: async (_cdp, selector, label) => {
      assert.equal(lastState, "ready", "the real sign-in action must only run after readiness");
      assert.equal(selector, "#start-sps-account");
      assert.equal(label, "SPS sign-in");
      clicks += 1;
    },
  });
  const cdp = {
    async evaluate(expression, awaitPromise) {
      expressions.push(expression);
      awaitPromises.push(awaitPromise);
      lastState = readinessStates.shift() ?? "loading";
      return lastState;
    },
  };
  return { ...helpers, cdp, expressions, awaitPromises, get clicks() { return clicks; } };
}

test("sign-in waits through not-ready UI and clicks exactly once after readiness", async () => {
  const harness = createHarness(["loading", "ready"]);

  assert.equal(await harness.startSignInWhenReady(harness.cdp), "clicked");
  assert.equal(harness.clicks, 1);
  assert.deepEqual(harness.awaitPromises, [true, true]);
  assert.match(harness.expressions[0], /#start-sps-account/);
  assert.match(harness.expressions[0], /account\?\.signedIn === true && account\.pending === false/);
  assert.match(harness.expressions[0], /account\?\.pending === true/);
  assert.match(harness.expressions[0], /getClientRects\(\)/);
  assert.match(harness.expressions[0], /button\.disabled/);
  assert.match(harness.expressions[0], /aria-busy/);
  assert.match(harness.expressions[0], /getBoundingClientRect/);
});

test("sign-in waits through a pending account transition and does not click an already signed-in account", async () => {
  const harness = createHarness(["pending", "signed-in"]);

  assert.equal(await harness.startSignInWhenReady(harness.cdp), "signed-in");
  assert.equal(harness.clicks, 0);
});

test("sign-in readiness timeout fails without clicking", async () => {
  const harness = createHarness(["loading"]);

  await assert.rejects(
    harness.waitForSignInReadiness(harness.cdp, { timeoutMs: 30, pollMs: 5 }),
    /Timed out waiting for SPS sign-in readiness/,
  );
  assert.equal(harness.clicks, 0);
});
