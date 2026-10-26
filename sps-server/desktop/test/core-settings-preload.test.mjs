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

test("Native Member preload sends bounded data only and never invokes input getters", async () => {
  const { api, calls } = await loadPreload();
  let read = false;
  const malicious = Object.defineProperty({ displayName: "computer" }, "invitationCode", {
    enumerable: true, get() { read = true; throw new Error("secret getter"); },
  });
  await assert.rejects(api.enrollNativeMember(malicious));
  await assert.rejects(api.enrollNativeMember({ invitationCode: "x", displayName: "computer", token: "extra" }));
  await assert.rejects(api.enrollNativeMember({ invitationCode: "x".repeat(8193), displayName: "computer" }));
  await assert.rejects(api.recoverNativeMember({ hostId: "../secret" }));
  assert.equal(read, false);
  assert.deepEqual(calls, []);
  await api.enrollNativeMember({ invitationCode: "fixture", displayName: "computer" });
  await api.recoverNativeMember({ hostId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(calls[0][0], "desktop:core-settings-enroll-native-member");
  assert.equal(calls[1][0], "desktop:core-settings-recover-native-member");
  assert.equal(calls[1][1].hostId, "11111111-1111-4111-8111-111111111111");
});
