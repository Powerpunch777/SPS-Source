import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const script = (await readFile(new URL("../scripts/smoke-host-plugin-lifecycle-desktop.mjs", import.meta.url), "utf8"))
  .replaceAll("\r\n", "\n");
const start = script.indexOf("async function waitForPluginUseControl(");
const end = script.indexOf("\nasync function maybeApproveCapabilityUpdate", start);
assert.ok(start >= 0 && end > start);

function button(name, enabled, overrides = {}) {
  const row = { textContent: `${name} Host: Ready Workspace: ${enabled ? "Enabled" : "Disabled"}` };
  return {
    textContent: enabled ? "Stop using" : "Use in this Workspace",
    isConnected: true,
    disabled: false,
    getClientRects: () => [{}],
    getAttribute: () => null,
    matches: () => false,
    closest: (selector) => selector.startsWith("li,") ? row : null,
    click() { throw new Error("Readiness observation must not click a lifecycle control."); },
    ...overrides,
  };
}

function harness(frames) {
  let time = 0;
  let observations = 0;
  let delays = 0;
  const wait = runInNewContext(`(${script.slice(start, end)})`, {
    Date: { now: () => time },
    async delay(ms) { delays += 1; time += ms; },
  });
  const cdp = {
    async evaluate(expression) {
      const nodes = frames[Math.min(observations++, frames.length - 1)];
      return runInNewContext(expression, {
        document: { querySelectorAll: () => nodes },
        getComputedStyle: () => ({ visibility: "visible", display: "block" }),
      });
    },
  };
  return { wait: (enabled) => wait(cdp, "Selected Plugin", enabled, { timeoutMs: 300, pollMs: 100 }),
    get observations() { return observations; }, get delays() { return delays; } };
}

test("waits for the selected Workspace row to render disabled before one re-enable action", async () => {
  const value = harness([
    [button("Selected Plugin", true), button("Other Plugin", false)],
    [button("Selected Plugin", false, { disabled: true })],
    [button("Selected Plugin", false)],
  ]);
  const state = await value.wait(false);
  assert.equal(state.ready, true);
  assert.equal(state.label, "Use in this Workspace");
  assert.equal(value.observations, 3);
  assert.equal(value.delays, 2);
});

test("requires an enabled control after the active row has rendered", async () => {
  const value = harness([
    [button("Selected Plugin", false)],
    [button("Selected Plugin", true, { getAttribute: (name) => name === "aria-busy" ? "true" : null })],
    [button("Selected Plugin", true)],
  ]);
  assert.equal((await value.wait(true)).label, "Stop using");
  assert.equal(value.observations, 3);
});

test("hidden, disconnected, disabled and ambiguous controls fail instead of mutating state", async () => {
  const unavailable = [
    [button("Other Plugin", false)],
    [button("Selected Plugin", false, { getClientRects: () => [] })],
    [button("Selected Plugin", false, { isConnected: false })],
    [button("Selected Plugin", false, { disabled: true })],
    [button("Selected Plugin", false, { matches: () => true })],
    [button("Selected Plugin", false, { getAttribute: () => "true" })],
    [button("Selected Plugin", false), button("Selected Plugin", false)],
  ];
  for (const nodes of unavailable) {
    const value = harness([nodes]);
    await assert.rejects(value.wait(false), /Timed out waiting for Workspace enable control/);
    assert.equal(value.observations, 3);
  }
});

test("Desktop lifecycle harness waits for rendered controls but retains actual single UI mutations", () => {
  assert.match(script, /waitForPluginUseControl\(workspace, candidateName, true\);\n\s*await clickText\(workspace, \["Stop using"/);
  assert.match(script, /waitForPluginUseControl\(workspace, candidateName, false\);\n\s*await clickText\(workspace, \["Use in this Workspace"/);
  assert.equal((script.match(/"Workspace re-enable",/g) ?? []).length, 1);
});
