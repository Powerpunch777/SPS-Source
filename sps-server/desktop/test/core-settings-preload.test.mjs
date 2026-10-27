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

test("certificate metadata and renewal preload accept only a saved Host selector", async () => {
  const { api, calls } = await loadPreload();
  const hostId = "11111111-1111-4111-8111-111111111111";
  let touched = false;
  const hostile = Object.defineProperty({}, "hostId", { enumerable: true, get() { touched = true; throw new Error("private"); } });
  for (const action of [api.inspectNativeMemberCertificate, api.renewNativeMemberCertificate]) {
    await assert.rejects(action(hostile));
    await assert.rejects(action({ hostId, certificate: "caller-selected" }));
    await assert.rejects(action({ hostId: "../other" }));
    await action({ hostId });
  }
  assert.equal(touched, false);
  assert.deepEqual(calls.map(row => [row[0], JSON.parse(JSON.stringify(row[1]))]), [
    ["desktop:core-settings-inspect-native-member-certificate", { hostId }],
    ["desktop:core-settings-renew-native-member-certificate", { hostId }],
  ]);
});

test("Host certificate maintenance exposes fixed no-argument commands only", async () => {
  const { api, calls } = await loadPreload();
  for (const action of [api.renewNativeIdentity, api.repairNativeIdentityPublication]) {
    await assert.rejects(action(undefined)); await assert.rejects(action({ certificate: "forged" })); await action();
  }
  assert.deepEqual(calls, [["desktop:core-settings-renew-native-identity"], ["desktop:core-settings-repair-native-identity-publication"]]);
});

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
  await assert.rejects(api.listNativeMemberWorkspaces({ hostId: "../secret" }));
  await assert.rejects(api.listNativeMemberWorkspaces({ hostId: "11111111-1111-4111-8111-111111111111", cookie: "secret" }));
  assert.equal(read, false);
  assert.deepEqual(calls, []);
  await api.enrollNativeMember({ invitationCode: "fixture", displayName: "computer" });
  await api.recoverNativeMember({ hostId: "11111111-1111-4111-8111-111111111111" });
  await api.listNativeMemberWorkspaces({ hostId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(calls[0][0], "desktop:core-settings-enroll-native-member");
  assert.equal(calls[1][0], "desktop:core-settings-recover-native-member");
  assert.equal(calls[1][1].hostId, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls[2][0], "desktop:core-settings-list-native-member-workspaces");
  assert.deepEqual({ ...calls[2][1] }, { hostId: "11111111-1111-4111-8111-111111111111" });
});

test("Native Workspace open preload passes only canonical Host and Workspace IDs", async () => {
  const { api, calls } = await loadPreload();
  const hostId = "11111111-1111-4111-8111-111111111111", workspaceId = "22222222-2222-4222-8222-222222222222";
  let getter = false;
  const hostile = Object.defineProperty({ hostId }, "workspaceId", { enumerable: true, get() { getter = true; return workspaceId; } });
  await assert.rejects(api.openNativeMemberWorkspace(hostile));
  await assert.rejects(api.openNativeMemberWorkspace({ hostId, workspaceId, cookie: "secret" }));
  await assert.rejects(api.openNativeMemberWorkspace({ hostId, workspaceId: "../other" }));
  assert.equal(getter, false);
  assert.equal(calls.length, 0);
  await api.openNativeMemberWorkspace({ hostId, workspaceId });
  assert.equal(calls[0][0], "desktop:core-settings-open-native-member-workspace");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), { hostId, workspaceId });
});
