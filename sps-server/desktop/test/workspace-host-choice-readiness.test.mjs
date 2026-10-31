import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = (await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const expression = source.match(/const hostChoiceReadinessExpression = `([\s\S]*?)`;/)?.[1];
assert.ok(expression);
const button = overrides => ({ disabled: false, getAttribute: () => null, getClientRects: () => [{}], closest: () => null, ...overrides });
const ready = (status, element = button()) => runInNewContext(expression, {
  window: { spsDesktop: { getStatus: async () => status } },
  document: { querySelector: selector => { assert.equal(selector, "#create-owner-server"); return element; } },
});
const signedIn = { desktopAccount: { signedIn: true, pending: false }, profile: null };

test("Host choice waits for the real account transition, not matching Server text", async () => {
  assert.equal(await ready({ desktopAccount: { signedIn: false, pending: true }, profile: null }), false);
  assert.equal(await ready({ desktopAccount: { signedIn: true, pending: true }, profile: null }), false);
  assert.equal(await ready({ desktopAccount: { signedIn: true }, profile: null }), false);
  assert.equal(await ready(signedIn), true);
  assert.equal(await ready({ ...signedIn, profile: { connectionKind: "owner-host" } }), false);
});

test("Host choice requires the actual visible idle control without dispatching any creation", async () => {
  for (const element of [null, button({ disabled: true }), button({ getAttribute: () => "true" }),
    button({ getClientRects: () => [] }), button({ closest: () => ({ hidden: true }) })]) {
    assert.equal(await ready(signedIn, element), false);
  }
  assert.doesNotMatch(expression, /createOwnerServer|\.click\(|invoke|setTimeout/);
  assert.ok(source.includes('setupCdp.evaluate(hostChoiceReadinessExpression, true), "the settled signed-in Host choice", 45_000'));
});

test("page readiness awaits an asynchronous false predicate before accepting the next state", async () => {
  const start = source.indexOf("async function waitForPage(");
  const end = source.indexOf("\n}\n", start) + 2;
  assert.ok(start >= 0 && end > start);
  let checks = 0, delays = 0;
  const waitForPage = runInNewContext(`(${source.slice(start, end)})`, {
    Date, describePage: async () => ({ sequence: checks }), delay: async () => { delays += 1; },
  });
  const result = await waitForPage({}, async () => ++checks === 2, "fixture settled state", 1000);
  assert.equal(result.sequence, 1);
  assert.equal(checks, 2);
  assert.equal(delays, 1);
});
