import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { waitForCurrentWorkspaceTarget } from "../scripts/workspace-current-target-readiness.mjs";

const expectedOrigin = "http://127.0.0.1:43127";
const expectedAccountEmail = "current@example.test";
const ready = (email = expectedAccountEmail, signedIn = true) => ({ ready: true, signedIn, email });
const page = (id, url = `${expectedOrigin}/workspace`) => ({
  type: "page", id, url, webSocketDebuggerUrl: `ws://127.0.0.1:43127/devtools/page/${id}`,
});

function fixture({ targets = [], outcomes = {}, mainRunning = true } = {}) {
  let time = 0;
  let currentTargets = targets;
  let running = mainRunning;
  const sessions = new Map();
  const opened = [];
  const evaluated = [];
  const delays = [];
  const getSession = target => {
    if (sessions.has(target.id)) return sessions.get(target.id);
    const state = { closed: false, closeCount: 0, calls: 0 };
    const steps = [...(outcomes[target.id] ?? [])];
    const cdp = {
      evaluate: async expression => {
        assert.match(expression, /document\.readyState/);
        assert.match(expression, /document\.visibilityState/);
        assert.match(expression, /getDesktopAccount/);
        assert.doesNotMatch(expression, /\.click\(|Page\.navigate|location\s*=/);
        evaluated.push(target.id);
        state.calls += 1;
        const step = steps.length ? steps.shift() : ready();
        if (step instanceof Error) throw step;
        if (typeof step === "function") return step(state);
        return step;
      },
      snapshotDiagnostics: () => ({ socketClosed: state.closed }),
      close: async () => { state.closeCount += 1; state.closed = true; },
    };
    const session = { cdp, state, target };
    sessions.set(target.id, session);
    opened.push(target.id);
    return session;
  };
  return {
    opened, evaluated, delays, sessions,
    setTargets(value) { currentTargets = value; },
    setRunning(value) { running = value; },
    async run(options = {}) {
      return waitForCurrentWorkspaceTarget({
        expectedOrigin, expectedAccountEmail,
        listTargets: async () => currentTargets,
        openCdp: async target => getSession(target).cdp,
        mainIsRunning: () => running,
        timeoutMs: 45000,
        now: () => time,
        delay: async ms => { delays.push(ms); time += ms; },
        ...options,
      });
    },
    get time() { return time; },
  };
}

test("retires a hidden current-origin target and accepts the later authorized target", async () => {
  const hidden = page("hidden");
  const wrongOrigin = page("foreign", "http://127.0.0.1:43128/workspace");
  const current = page("current", `${expectedOrigin}/workspace/active`);
  const f = fixture({ targets: [wrongOrigin, hidden, current], outcomes: {
    hidden: [state => { state.closed = true; return { ready: false }; }],
    current: [ready()],
  } });

  const result = await f.run();

  assert.equal(result.target.id, "current");
  assert.equal(result.cdp, f.sessions.get("current").cdp);
  assert.equal(result.retiredTargets, 1);
  assert.deepEqual(f.opened, ["hidden", "current"]);
  assert.deepEqual(f.evaluated, ["hidden", "current"]);
  assert.equal(f.sessions.get("hidden").state.closeCount, 1);
  assert.equal(f.sessions.get("current").state.closeCount, 0);
});

test("keeps polling one hidden session until that same document is ready", async () => {
  const f = fixture({ targets: [page("same")], outcomes: { same: [{ ready: false }, ready()] } });
  const result = await f.run();
  assert.equal(result.target.id, "same");
  assert.deepEqual(f.opened, ["same"]);
  assert.deepEqual(f.evaluated, ["same", "same"]);
  assert.equal(result.retiredTargets, 0);
});

test("never selects another origin and times out on the original bounded clock", async () => {
  const f = fixture({ targets: [page("foreign", "http://127.0.0.1:43128/workspace")] });
  await assert.rejects(f.run({ timeoutMs: 250 }), { message: "Timed out waiting for the current authorized Workspace document." });
  assert.deepEqual(f.opened, []);
  assert.equal(f.time, 250);
});

test("rejects wrong-account or signed-out ready documents without falling back", async t => {
  for (const [name, account] of [["wrong account", ready("other@example.test")], ["signed out", ready(expectedAccountEmail, false)]]) {
    await t.test(name, async () => {
      const f = fixture({ targets: [page("bad"), page("fallback")], outcomes: { bad: [account] } });
      await assert.rejects(f.run(), /unexpected Desktop account/);
      assert.deepEqual(f.opened, ["bad"]);
      assert.equal(f.sessions.get("bad").state.closeCount, 1);
    });
  }
});

test("propagates a live evaluation failure and cleans every unreturned session", async () => {
  const f = fixture({ targets: [page("retired"), page("broken")], outcomes: {
    retired: [state => { state.closed = true; return { ready: false }; }],
    broken: [new Error("private renderer detail")],
  } });
  await assert.rejects(f.run(), { message: "The live Workspace document readiness request failed." });
  assert.deepEqual(f.opened, ["retired", "broken"]);
  assert.equal(f.sessions.get("retired").state.closeCount, 1);
  assert.equal(f.sessions.get("broken").state.closeCount, 1);
});

test("fails immediately when the desktop main process is no longer running", async () => {
  const f = fixture({ targets: [page("unused")], mainRunning: false });
  await assert.rejects(f.run(), /Desktop exited before its authorized Workspace document was ready/);
  assert.deepEqual(f.opened, []);
});

test("retiring a target does not restart or extend the original timeout", async () => {
  const f = fixture({ targets: [page("dead"), page("pending")], outcomes: {
    dead: [state => { state.closed = true; return { ready: false }; }],
    pending: Array.from({ length: 10 }, () => ({ ready: false })),
  } });
  await assert.rejects(f.run({ timeoutMs: 250 }), { message: "Timed out waiting for the current authorized Workspace document." });
  assert.equal(f.time, 250);
  assert.deepEqual(f.opened, ["dead", "pending"]);
  assert.equal(f.sessions.get("dead").state.closeCount, 1);
  assert.equal(f.sessions.get("pending").state.closeCount, 1);
});

test("rejects malformed and duplicate identities and target lists over the bound", async t => {
  const cases = [
    ["malformed identity", [{ ...page("bad id") }]],
    ["duplicate identity", [page("same"), page("same")]],
    ["too many targets", Array.from({ length: 17 }, (_, index) => page(`id${index}`))],
  ];
  for (const [name, targets] of cases) {
    await t.test(name, async () => {
      const f = fixture({ targets });
      await assert.rejects(f.run(), /Invalid Workspace target list|Invalid or duplicate Workspace target identity/);
      assert.deepEqual(f.opened, []);
    });
  }
});

test("preflights duplicate IDs even when the first matching page would be ready", async () => {
  const first = page("same");
  const duplicate = page("same", `${expectedOrigin}/another`);
  const f = fixture({ targets: [first, duplicate] });
  await assert.rejects(f.run(), /Invalid or duplicate Workspace target identity/);
  assert.deepEqual(f.opened, []);
});

test("rejects debugger endpoints with remote hosts, credentials, missing ports, queries, or fragments", async t => {
  const endpoints = [
    ["remote host", "ws://remote.example:43127/devtools/page/endpoint"],
    ["credentials", "ws://user:secret@127.0.0.1:43127/devtools/page/endpoint"],
    ["missing port", "ws://127.0.0.1/devtools/page/endpoint"],
    ["query", "ws://127.0.0.1:43127/devtools/page/endpoint?token=secret"],
    ["fragment", "ws://127.0.0.1:43127/devtools/page/endpoint#fragment"],
  ];
  for (const [name, endpoint] of endpoints) {
    await t.test(name, async () => {
      const target = { ...page("endpoint"), webSocketDebuggerUrl: endpoint };
      const f = fixture({ targets: [target] });
      await assert.rejects(f.run(), /Workspace debugger endpoint is not local|Invalid URL/);
      assert.deepEqual(f.opened, []);
    });
  }
});

test("rejects malformed ready results and does not reopen a closed target", async () => {
  const f = fixture({ targets: [page("closed")], outcomes: {
    closed: [state => { state.closed = true; return { ready: false }; }],
  } });
  await assert.rejects(f.run({ timeoutMs: 150 }), { message: "Timed out waiting for the current authorized Workspace document." });
  assert.deepEqual(f.opened, ["closed"]);

  const malformed = fixture({ targets: [page("malformed"), page("fallback")], outcomes: {
    malformed: [{ ready: true, signedIn: true, email: expectedAccountEmail, extra: "unexpected" }],
  } });
  await assert.rejects(malformed.run(), /Invalid ready Workspace document result/);
  assert.deepEqual(malformed.opened, ["malformed"]);
});

test("actual restart retains Host wait and shares one original document deadline without replaying navigation", async () => {
  const source = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");
  const begin = source.indexOf("restart: async ({ companyPrefix, pluginId }) =>");
  const end = source.indexOf("openRecovery: async", begin);
  const restart = source.slice(begin, end);
  const account = restart.indexOf("window.spsDesktopWorkspace.getDesktopAccount()");
  const close = restart.indexOf("await closeDesktopForRestart()");
  const launch = restart.indexOf("launchDesktop()");
  const hostWait = restart.indexOf('"restarted No-AI Host Workspace", hostReadyTimeoutMs');
  const deadline = restart.indexOf("const documentDeadline = Date.now() + 45_000");
  const ready = restart.indexOf("await waitForCurrentWorkspaceTarget(");
  const navigate = restart.indexOf('workspaceCdp.command("Page.navigate"');
  assert.ok(account >= 0 && close > account && launch > close && hostWait > launch && deadline > hostWait && ready > deadline && navigate > ready);
  assert.equal([...restart.matchAll(/documentDeadline =/g)].length, 1);
  assert.equal([...restart.matchAll(/Page\.navigate/g)].length, 1);
  assert.equal([...restart.matchAll(/Math\.max\(1, documentDeadline - Date\.now\(\)\)/g)].length, 2);
  assert.doesNotMatch(restart, /while\s*\(|for\s*\(|retry|force.*click/i);
});
