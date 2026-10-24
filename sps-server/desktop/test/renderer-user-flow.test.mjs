import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function rendererFixture(status, overrides = {}) {
  const source = await readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8");
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: false, disabled: false, value: "", textContent: "", handlers: {},
      classList: { toggle() {} }, replaceChildren() {}, removeAttribute() {}, setAttribute() {}, focus() {},
      addEventListener(name, listener) { this.handlers[name] = listener; },
    });
    return elements.get(selector);
  };
  const calls = [];
  const desktop = {
    getStatus: async () => status,
    readyForJoinLink: async () => null,
    onJoinLink() {}, onDesktopAccountChanged() {},
    useOwnerHost: async () => calls.push("retry"),
    signOutSpsAccount: async () => calls.push("sign-out"),
    openWorkspace: async () => calls.push("open"),
    restoreOwnerServer: async () => null,
    manageHostProjectSource: async () => null,
    ...overrides,
  };
  const execute = new Function("window", "document", "setInterval", "clearInterval", "queueMicrotask",
    `return (async () => { ${source}\n return {render}; })()`);
  await execute({ spsDesktop: desktop }, { querySelector: element, body: element("body") }, () => 1, () => {}, queueMicrotask);
  return { element, calls };
}

const stopped = {
  desktopAccount: { signedIn: true }, profile: { connectionKind: "owner-host" },
  ownerHost: { state: "stopped" }, teamAccess: { enabled: false },
};

test("stopped Host exposes retry, status check and account recovery", async () => {
  const { element, calls } = await rendererFixture(stopped);
  assert.match(element("#workspace-title").textContent, /중지/);
  assert.equal(element("#retry-owner-host").hidden, false);
  assert.equal(element("#refresh-server-status").hidden, false);
  assert.equal(element("#workspace-switch-account").hidden, false);
  await element("#retry-owner-host").handlers.click();
  assert.deepEqual(calls, ["retry"]);
  await element("#workspace-switch-account").handlers.click();
  assert.deepEqual(calls, ["retry", "sign-out"]);
});

test("starting and private-team Hosts do not expose unsupported restart actions", async () => {
  for (const status of [
    { ...stopped, ownerHost: { state: "starting" } },
    { ...stopped, teamAccess: { enabled: true } },
  ]) {
    const { element } = await rendererFixture(status);
    assert.equal(element("#retry-owner-host").hidden, true);
    assert.equal(element("#refresh-server-status").hidden, false);
  }
});

test("cancelled restore clears the stale in-progress notice without claiming success", async () => {
  const { element } = await rendererFixture({ desktopAccount: { signedIn: true } });
  await element("#restore-owner-server").handlers.click();
  assert.match(element("#notice").textContent, /취소/);
  assert.doesNotMatch(element("#notice").textContent, /복원했습니다/);
});

test("cancelled Source dialog does not announce an access change", async () => {
  const { element } = await rendererFixture({ desktopAccount: { signedIn: true } });
  await element("#project-folder-list").handlers.click({
    target: { closest: () => ({ dataset: { projectId: "project", action: "share" } }) },
  });
  assert.match(element("#notice").textContent, /cancelled/);
  assert.doesNotMatch(element("#notice").textContent, /updated/);
});

test("Host creation reports completion only after activation acknowledgement", async () => {
  let finish;
  const activation = new Promise(resolve => { finish = resolve; });
  const { element } = await rendererFixture({ desktopAccount: { signedIn: true } }, { createOwnerServer: () => activation });
  const pending = element("#create-owner-server").handlers.click();
  assert.equal(element("#create-owner-server").disabled, true);
  assert.doesNotMatch(element("#notice").textContent, /준비가 완료/);
  finish(); await pending;
  assert.equal(element("#create-owner-server").disabled, false);
  assert.match(element("#notice").textContent, /준비가 완료/);
});
