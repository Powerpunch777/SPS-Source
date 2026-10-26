import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const preloadPath = new URL("../src/core-settings-preload.cjs", import.meta.url);

async function loadPreload() {
  const source = await readFile(preloadPath, "utf8");
  const calls = [];
  let api;
  const electron = {
    contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, "spsCoreSettings"); api = value; } },
    ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ requested: true }); } },
  };
  vm.runInNewContext(source, {
    require: name => {
      assert.equal(name, "electron");
      return electron;
    },
  });
  return { api, calls };
}

test("Core Settings quit preload accepts no arguments and invokes only its fixed channel", async () => {
  const { api, calls } = await loadPreload();
  let getterRan = false;
  const extraArgument = Object.defineProperty({}, "secret", {
    enumerable: true,
    get() { getterRan = true; throw new Error("argument getter must not run"); },
  });

  await assert.rejects(api.quitDesktop(undefined), /accepts no arguments/);
  await assert.rejects(api.quitDesktop(extraArgument), /accepts no arguments/);
  assert.equal(getterRan, false);
  assert.deepEqual(calls, []);

  assert.deepEqual(await api.quitDesktop(), { requested: true });
  assert.deepEqual(calls, [["desktop:core-settings-quit-desktop"]]);
});
