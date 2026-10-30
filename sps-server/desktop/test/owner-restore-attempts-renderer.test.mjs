import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const rendererPath = new URL("../renderer/renderer.mjs", import.meta.url);
const rendererSource = (await readFile(rendererPath, "utf8")).replaceAll("\r\n", "\n");
const start = rendererSource.indexOf("function renderOwnerRestoreAttempts(status) {");
const end = rendererSource.indexOf("\n}\n\nfunction renderServerChoice", start) + 2;
assert.ok(start >= 0 && end > start, "the focused renderer function boundary must remain explicit");
const functionSource = rendererSource.slice(start, end);

function createElement(tag) {
  const listeners = new Map();
  const element = {
    tag,
    children: [],
    hidden: false,
    className: "",
    type: "",
    textContent: "",
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    async click(type = "click") { return await listeners.get(type)?.(); },
  };
  Object.defineProperty(element, "innerHTML", {
    get() { throw new Error("innerHTML must not be read"); },
    set() { throw new Error("innerHTML must not be written"); },
  });
  return element;
}

function createRenderer() {
  const section = createElement("section");
  const list = createElement("div");
  const elements = new Map([
    ["#owner-restore-attempts-screen", section],
    ["#owner-restore-attempt-list", list],
  ]);
  const bridgeCalls = [];
  const context = {
    $, account: (status) => status?.desktopAccount ?? {}, show: (element, value) => { element.hidden = !value; },
    document: { createElement },
    window: { spsDesktop: { revealOwnerRestoreAttempt: async (id) => { bridgeCalls.push(id); } } },
    run: async (action) => await action(),
    Date, Number,
  };
  function $(selector) { return elements.get(selector) ?? null; }
  const render = runInNewContext(`(() => { ${functionSource}; return renderOwnerRestoreAttempts; })()`, context);
  return { render, section, list, bridgeCalls };
}

test("restore attempts are hidden and cleared when the account is signed out", () => {
  const ui = createRenderer();
  ui.render({ desktopAccount: { signedIn: false }, ownerHost: { restoreAttempts: [{ id: "attempt-1", createdAt: "2026-10-30T00:00:00Z" }] } });
  assert.equal(ui.section.hidden, true);
  assert.equal(ui.list.children.length, 0);
});

test("signed-in recovery rows show dates and reveal only the selected attempt id", async () => {
  const ui = createRenderer();
  const createdAt = "2026-10-30T00:00:00.000Z";
  const subjectCanary = "private-subject-canary";
  const pathCanary = "C:/private/owner-vault.restore-secret";
  ui.render({ desktopAccount: { signedIn: true }, ownerHost: { restoreAttempts: [
    { id: "attempt-opaque-id", createdAt, ownerSubject: subjectCanary, path: pathCanary },
  ] } });

  assert.equal(ui.section.hidden, false);
  assert.equal(ui.list.children.length, 1);
  const [row] = ui.list.children;
  assert.equal(row.children.length, 2);
  assert.match(row.children[0].textContent, /2026/);
  assert.equal(row.children[1].tag, "button");
  assert.equal(row.children[1].textContent, "폴더 위치 보기");
  assert.equal(JSON.stringify({ row, section: ui.section }).includes(subjectCanary), false);
  assert.equal(JSON.stringify({ row, section: ui.section }).includes(pathCanary), false);

  await row.children[1].click();
  assert.deepEqual(ui.bridgeCalls, ["attempt-opaque-id"]);
});

test("empty restore attempt lists remain hidden", () => {
  const ui = createRenderer();
  ui.render({ desktopAccount: { signedIn: true }, ownerHost: { restoreAttempts: [] } });
  assert.equal(ui.section.hidden, true);
  assert.equal(ui.list.children.length, 0);
});
