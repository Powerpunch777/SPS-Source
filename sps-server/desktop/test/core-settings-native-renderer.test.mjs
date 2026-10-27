import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const rendererUrl = new URL("../renderer/core-settings.mjs", import.meta.url);
const htmlUrl = new URL("../renderer/core-settings.html", import.meta.url);
const [rendererSource, htmlSource] = await Promise.all([
  readFile(rendererUrl, "utf8"),
  readFile(htmlUrl, "utf8"),
]);

class ElementFixture {
  constructor(id, dataset = {}) {
    this.id = id;
    this.dataset = dataset;
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.children = [];
    this._textContent = "";
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      toggle: (name, force) => {
        if (force ?? !this.classes.has(name)) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ target: this });
  }

  setAttribute(name, value) { this.attributes.set(name, value); }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  append(...children) { this._textContent = ""; this.children.push(...children); }
}

function validNative(overrides = {}) {
  return { state: "not_prepared", lanEnabled: false, canPrepare: true, ...overrides };
}

function coreStatus(overrides = {}) {
  return {
    host: { state: "running", lastError: null },
    recovery: { pluginsDisabled: false, storageError: null },
    canManageHost: true,
    nativeConnectivity: validNative(),
    ...overrides,
  };
}

function createRenderer({ getStatus = async () => coreStatus(), prepareNativeIdentity = async () => coreStatus(), api = {} } = {}) {
  const elements = new Map();
  for (const [, id] of htmlSource.matchAll(/\bid="([^"]+)"/g)) elements.set(id, new ElementFixture(id));
  const actionButtons = ["open-workspace", "check-updates", "restart-host", "export-host", "inspect-transfer"]
    .map(action => new ElementFixture(`action-${action}`, { action }));
  const document = {
    createElement: tag => new ElementFixture(tag),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new ElementFixture(id));
      return elements.get(id);
    },
    querySelectorAll(selector) {
      assert.equal(selector, "button[data-action]");
      return actionButtons;
    },
  };
  const windowListeners = new Map();
  const window = {
    spsCoreSettings: { getStatus, prepareNativeIdentity, ...api },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  runInNewContext(rendererSource, { window, document }, { filename: rendererUrl.pathname });
  return { elements, actionButtons };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
}

function element(ctx, id) { return ctx.elements.get(id); }

const listenerHost = "11111111-1111-4111-8111-111111111111";
const listening = { state: "listening", hostId: listenerHost, bindAddress: "192.168.1.10", port: 43123 };
function preparedHost(nativeListener = { state: "off" }) {
  return coreStatus({ nativeConnectivity: validNative({ state: "identity_prepared", canPrepare: false,
    serverSpkiSha256: "a".repeat(64), serverNotAfter: 1_900_000_000_000, memberIssuerNotAfter: 1_950_000_000_000 }), nativeListener });
}

test("Host certificate renewal requires explicit click, due metadata and stopped listening", async () => {
  let calls = 0;
  const due = { ...preparedHost(), nativeConnectivity: { ...preparedHost().nativeConnectivity,
    serverRenewalAvailableAt: Date.now() - 60_000 } };
  const ctx = createRenderer({ getStatus: async () => due, api: {
    renewNativeIdentity: async () => { calls++; return preparedHost(listening); },
  } });
  await settle(); assert.equal(calls, 0);
  assert.equal(element(ctx, "renew-native-identity").disabled, false);
  element(ctx, "renew-native-identity").dispatch("click"); await settle();
  assert.equal(calls, 1); assert.equal(element(ctx, "renew-native-identity").disabled, true);
  element(ctx, "renew-native-identity").dispatch("click"); await settle(); assert.equal(calls, 1);
});

test("Host registration stays off until an explicit click and renders start and stop results", async () => {
  const calls = [];
  const ctx = createRenderer({ getStatus: async () => preparedHost(), api: {
    startNativeHostListener: async input => { calls.push({ ...input }); return preparedHost(listening); },
    stopNativeHostListener: async () => { calls.push("stop"); return preparedHost(); },
  } });
  await settle();
  assert.deepEqual(calls, []);
  assert.match(element(ctx, "native-listener-state").textContent, /^Off/);
  element(ctx, "native-listener-address").value = listening.bindAddress;
  element(ctx, "native-listener-port").value = "43123";
  element(ctx, "native-listener-address").dispatch("input");
  assert.equal(element(ctx, "start-native-listener").disabled, false);
  element(ctx, "start-native-listener").dispatch("click");
  await settle();
  assert.deepEqual(calls, [{ bindAddress: listening.bindAddress, port: 43123 }]);
  assert.match(element(ctx, "native-listener-state").textContent, /192\.168\.1\.10:43123/);
  assert.equal(element(ctx, "native-listener-address").disabled, true);
  assert.equal(element(ctx, "copy-native-invitation").disabled, false);
  element(ctx, "stop-native-listener").dispatch("click");
  await settle();
  assert.deepEqual(calls.at(-1), "stop");
  assert.match(element(ctx, "native-listener-state").textContent, /^Off/);
  assert.equal(element(ctx, "copy-native-invitation").disabled, true);
});

test("invalid Host listener observations never enable copy or claim to be listening", async () => {
  for (const nativeListener of [undefined, { state: "listening" }, { ...listening, port: -1 },
    { ...listening, hostId: "invalid" }, { ...listening, privateKey: "private-marker" }]) {
    const ctx = createRenderer({ getStatus: async () => preparedHost(nativeListener) });
    await settle();
    assert.equal(element(ctx, "copy-native-invitation").disabled, true);
    assert.equal(element(ctx, "stop-native-listener").disabled, true);
    assert.doesNotMatch(element(ctx, "native-listener-state").textContent, /Registration listening/);
  }
});

test("Host invitation copy requires an explicit click and displays only a strict public acknowledgement", async () => {
  let copies = 0;
  const ctx = createRenderer({ getStatus: async () => preparedHost(listening), api: {
    copyNativeHostInvitation: async () => { copies++; return { copied: true, expiresAt: "2030-01-01T00:00:00.000Z" }; },
  } });
  await settle();
  assert.equal(copies, 0);
  element(ctx, "copy-native-invitation").dispatch("click");
  await settle();
  assert.equal(copies, 1);
  assert.match(element(ctx, "native-member-result").textContent, /Invitation copied/);
  const malformed = createRenderer({ getStatus: async () => preparedHost(listening), api: {
    copyNativeHostInvitation: async () => ({ copied: true, expiresAt: "2030-01-01T00:00:00.000Z", invitationCode: "private-marker" }),
  } });
  await settle();
  element(malformed, "copy-native-invitation").dispatch("click");
  await settle();
  assert.match(element(malformed, "action-notice").textContent, /failed/);
  assert.doesNotMatch(element(malformed, "native-member-result").textContent, /private-marker|Invitation copied/);
});

test("Member registration needs a signed-in account, explicit input and click, with no automatic network request", async () => {
  const calls = [];
  const ctx = createRenderer({ getStatus: async () => coreStatus({ canManageHost: false, canManageNativeMember: true }),
    api: { enrollNativeMember: async input => { calls.push({ ...input }); return { hostId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222", status: "pending" }; } },
  });
  await settle();
  assert.deepEqual(calls, []);
  assert.equal(element(ctx, "register-native-member").disabled, true);
  element(ctx, "native-member-invitation").value = "fixture-invitation-secret";
  element(ctx, "native-member-name").value = "Member computer";
  element(ctx, "native-member-name").dispatch("input");
  assert.equal(element(ctx, "register-native-member").disabled, false);
  element(ctx, "register-native-member").dispatch("click");
  assert.equal(element(ctx, "native-member-invitation").value, "");
  await settle();
  assert.deepEqual(calls, [{ invitationCode: "fixture-invitation-secret", displayName: "Member computer" }]);
  assert.match(element(ctx, "native-member-result").textContent, /Pending approval/);
  assert.doesNotMatch(element(ctx, "native-member-result").textContent, /secret/);
});

test("Member failure never renders provider credentials or repeats enrollment", async () => {
  let attempts = 0;
  const ctx = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }),
    api: { enrollNativeMember: async () => { attempts++; throw new Error("private-key-fixture-token"); } },
  });
  await settle();
  element(ctx, "native-member-invitation").value = "fixture-secret";
  element(ctx, "native-member-name").value = "Member";
  element(ctx, "native-member-name").dispatch("input");
  element(ctx, "register-native-member").dispatch("click");
  await settle(); await settle();
  assert.equal(attempts, 1);
  assert.equal(element(ctx, "native-member-invitation").value, "");
  assert.match(element(ctx, "native-member-result").textContent, /Existing credentials were kept/);
  assert.doesNotMatch(element(ctx, "native-member-result").textContent, /fixture-token|private-key/);
});

test("saved Member registration queries are explicit and never use an invitation", async () => {
  const calls = [];
  const hostId = "11111111-1111-4111-8111-111111111111";
  const ctx = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }),
    api: { listNativeRegistrations: async () => { calls.push("list"); return [{ hostId }]; },
      recoverNativeMember: async input => { calls.push({ ...input }); return { hostId, deviceId: hostId, status: "revoked" }; } },
  });
  await settle();
  assert.deepEqual(calls, []);
  element(ctx, "refresh-native-registrations").dispatch("click");
  await settle();
  const row = element(ctx, "native-registrations-list").children[0];
  assert.ok(row);
  row.children[1].children[0].dispatch("click");
  await settle();
  assert.deepEqual(calls, ["list", { hostId }]);
  assert.match(element(ctx, "native-member-result").textContent, /Revoked/);
});

test("certificate details are explicit, validate metadata, and distinguish current from expired state", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  const notBefore = new Date(Date.now() - 86_400_000).toISOString();
  const notAfter = new Date(Date.now() + 86_400_000).toISOString();
  const renewalAvailableAt = new Date(Date.now() + 12 * 60 * 60_000).toISOString();
  const calls = [];
  const ctx = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }],
    inspectNativeMemberCertificate: async input => { calls.push({ ...input }); return { hostId, state: "current", certificateNotBefore: notBefore,
      certificateNotAfter: notAfter, renewalAvailableAt }; },
  } });
  await settle();
  assert.deepEqual(calls, []);
  element(ctx, "refresh-native-registrations").dispatch("click"); await settle();
  const row = element(ctx, "native-registrations-list").children[0];
  const details = row.children[1].children[2];
  assert.equal(details.textContent, "Certificate details");
  details.dispatch("click"); await settle();
  assert.deepEqual(calls, [{ hostId }]);
  assert.match(element(ctx, "native-member-result").textContent, new RegExp(notAfter));
  assert.match(element(ctx, "native-member-result").textContent, new RegExp(renewalAvailableAt));

  const expired = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }],
    inspectNativeMemberCertificate: async () => ({ hostId, state: "expired", certificateNotBefore: notBefore,
      certificateNotAfter: new Date(Date.now() - 60_000).toISOString(), renewalAvailableAt: null }),
  } });
  await settle();
  element(expired, "refresh-native-registrations").dispatch("click"); await settle();
  const expiredRow = element(expired, "native-registrations-list").children[0];
  expiredRow.children[1].children[2].dispatch("click"); await settle();
  assert.match(element(expired, "native-member-result").textContent, /cannot be renewed using expired credentials/);
  assert.match(element(expired, "native-member-result").textContent, /Existing keys were kept/);
});

test("certificate renewal runs only after an explicit click and renders approved expiry without credential data", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111", deviceId = "22222222-2222-4222-8222-222222222222";
  const certificateNotAfter = new Date(Date.now() + 90 * 86_400_000).toISOString();
  const calls = [];
  const ctx = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }],
    renewNativeMemberCertificate: async input => { calls.push({ ...input }); return { hostId, deviceId, status: "approved", certificateNotAfter }; },
  } });
  await settle();
  assert.deepEqual(calls, []);
  element(ctx, "refresh-native-registrations").dispatch("click"); await settle();
  const row = element(ctx, "native-registrations-list").children[0];
  const renew = row.children[1].children[3];
  assert.equal(renew.textContent, "Renew certificate");
  assert.deepEqual(calls, []);
  renew.dispatch("click"); await settle();
  assert.deepEqual(calls, [{ hostId }]);
  assert.match(element(ctx, "native-member-result").textContent, new RegExp(certificateNotAfter));
  assert.match(element(ctx, "native-member-result").textContent, /original device key and trust were kept/);
  assert.doesNotMatch(element(ctx, "native-member-result").textContent, /certificatePem|privateKey|CSR|secret/);
});

test("saved Host Workspace discovery requires Show Workspaces and renders exact text safely", async () => {
  const calls = [];
  const hostId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  const workspaceIds = [workspaceId, "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];
  const names = ["<img src=x onerror=alert(1)>", "   ", `line\nbreak\t\u0000${"x".repeat(301)}`];
  const ctx = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }],
    listNativeMemberWorkspaces: async input => { calls.push({ ...input }); return names.map((name, index) => ({ id: workspaceIds[index], name })); },
  } });
  await settle();
  assert.deepEqual(calls, []);
  element(ctx, "refresh-native-registrations").dispatch("click");
  await settle();
  const row = element(ctx, "native-registrations-list").children[0];
  const show = row.children[1].children[4];
  assert.equal(show.textContent, "Show Workspaces");
  assert.equal(row.children[2].children.length, 0);
  assert.deepEqual(calls, []);
  show.dispatch("click");
  await settle();
  assert.deepEqual(calls, [{ hostId }]);
  assert.deepEqual(row.children[2].children.filter(child => child.id === "p").map(child => child.textContent),
    names.map((name, index) => `${name} · ${workspaceIds[index]}`));
  assert.ok(row.children[2].children.every(child => child.innerHTML === undefined));
});

test("opening a discovered Workspace requires a separate explicit click and only sends IDs", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111", workspaceId = "22222222-2222-4222-8222-222222222222";
  const calls = [];
  const ctx = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }],
    listNativeMemberWorkspaces: async () => [{ id: workspaceId, name: "Team" }],
    openNativeMemberWorkspace: async input => { calls.push({ ...input }); return { opened: true }; },
  } });
  await settle();
  element(ctx, "refresh-native-registrations").dispatch("click"); await settle();
  const row = element(ctx, "native-registrations-list").children[0];
  row.children[1].children[4].dispatch("click"); await settle();
  assert.deepEqual(calls, []);
  const button = row.children[2].children[1];
  assert.equal(button.textContent, "Open Workspace");
  button.dispatch("click"); await settle();
  assert.deepEqual(calls, [{ hostId, workspaceId }]);
  assert.equal(element(ctx, "native-member-result").textContent, "Workspace opened in its own window.");
});

test("Workspace discovery shows generic empty/error states and ignores late results after refresh", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  const empty = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }], listNativeMemberWorkspaces: async () => [],
  } });
  await settle();
  element(empty, "refresh-native-registrations").dispatch("click"); await settle();
  const emptyRow = element(empty, "native-registrations-list").children[0];
  emptyRow.children[1].children[4].dispatch("click"); await settle();
  assert.equal(emptyRow.children[2].textContent, "No available Workspaces for this Host.");

  const failed = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }], listNativeMemberWorkspaces: async () => { throw new Error("private cookie"); },
  } });
  await settle();
  element(failed, "refresh-native-registrations").dispatch("click"); await settle();
  const failedRow = element(failed, "native-registrations-list").children[0];
  failedRow.children[1].children[4].dispatch("click"); await settle();
  assert.equal(failedRow.children[2].textContent, "Saved Workspaces are unavailable. Check the connection and retry.");
  assert.doesNotMatch(failedRow.children[2].textContent, /cookie|private/);

  let release;
  const late = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }],
    listNativeMemberWorkspaces: async () => new Promise(resolve => { release = resolve; }),
  } });
  await settle();
  element(late, "refresh-native-registrations").dispatch("click"); await settle();
  const oldRow = element(late, "native-registrations-list").children[0];
  oldRow.children[1].children[4].dispatch("click");
  await settle();
  element(late, "refresh-native-registrations").disabled = false;
  element(late, "refresh-native-registrations").dispatch("click");
  await settle();
  release([{ id: "22222222-2222-4222-8222-222222222222", name: "Late workspace" }]);
  await settle();
  const newRow = element(late, "native-registrations-list").children[0];
  assert.equal(newRow.children[2].textContent, "");
  assert.equal(oldRow.children[2].textContent, "");
});

test("a status refresh clears previously displayed member Workspace names and IDs", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  let workspaceCalls = 0;
  const ctx = createRenderer({ getStatus: async () => coreStatus({ canManageNativeMember: true }), api: {
    listNativeRegistrations: async () => [{ hostId }],
    listNativeMemberWorkspaces: async () => { workspaceCalls += 1; return [{ id: workspaceId, name: "Private Team Name" }]; },
  } });
  await settle();
  assert.equal(element(ctx, "refresh-native-registrations").disabled, false);
  element(ctx, "refresh-native-registrations").dispatch("click"); await settle();
  assert.equal(element(ctx, "native-registrations-list").children.length, 1);
  const row = element(ctx, "native-registrations-list").children[0];
  row.children[1].children[4].dispatch("click"); await settle();
  assert.equal(workspaceCalls, 1);
  assert.equal(row.children[2].children.length, 2);
  assert.equal(row.children[2].children[0].textContent, `Private Team Name · ${workspaceId}`);
  element(ctx, "retry-status").dispatch("click"); await settle();
  assert.equal(element(ctx, "native-registrations-list").children.length, 0);
  assert.equal(row.children[2].children.length, 0);
  assert.equal(row.children[2].textContent, "");
});

test("Native LAN starts unavailable when native DTO is missing and never prepares on load", async () => {
  let statusCalls = 0;
  let prepareCalls = 0;
  const ctx = createRenderer({
    getStatus: async () => { statusCalls += 1; return coreStatus({ nativeConnectivity: undefined }); },
    prepareNativeIdentity: async () => { prepareCalls += 1; return coreStatus(); },
  });
  await settle();

  assert.equal(statusCalls, 1);
  assert.equal(prepareCalls, 0);
  assert.equal(element(ctx, "native-identity-form").hidden, true);
  assert.equal(element(ctx, "native-identity-state").textContent, "Unavailable");
  assert.equal(element(ctx, "prepare-native-identity").disabled, true);
  assert.match(htmlSource, /LAN access<\/dt>\s*<dd id="native-listener-state">Off · not active<\/dd>/);
  assert.match(htmlSource, /Native LAN \(in development\)/);
  assert.match(htmlSource, /Native device registration is off until you enable it/);
});

test("missing or malformed native DTOs fail closed as unavailable", async () => {
  const malformedDtos = [
    null,
    { state: "preparing", lanEnabled: false, canPrepare: true },
    { state: "not_prepared", lanEnabled: true, canPrepare: true },
    { state: "not_prepared", lanEnabled: false, canPrepare: "true" },
    validNative({ state: "identity_prepared", serverSpkiSha256: "<img src=x>", serverNotAfter: Date.now() }),
    validNative({ memberIssuerNotAfter: "2030-01-01" }),
  ];

  for (const nativeConnectivity of malformedDtos) {
    const ctx = createRenderer({ getStatus: async () => coreStatus({ nativeConnectivity }) });
    await settle();
    assert.equal(element(ctx, "native-identity-state").textContent, "Unavailable");
    assert.equal(element(ctx, "prepare-native-identity").disabled, true);
    assert.equal(element(ctx, "native-fingerprint-row").hidden, true);
  }
});

test("preparation requires host permission, canPrepare, and a nonempty address", async () => {
  let prepareCalls = 0;
  const ctx = createRenderer({
    getStatus: async () => coreStatus({ canManageHost: false }),
    prepareNativeIdentity: async () => { prepareCalls += 1; return coreStatus(); },
  });
  await settle();
  const address = element(ctx, "native-certificate-address");
  const button = element(ctx, "prepare-native-identity");

  address.value = "192.168.1.10";
  address.dispatch("input");
  assert.equal(button.disabled, true);
  button.dispatch("click");
  await settle();
  assert.equal(prepareCalls, 0);

  const cannotPrepare = createRenderer({ getStatus: async () => coreStatus({ nativeConnectivity: validNative({ canPrepare: false }) }) });
  await settle();
  element(cannotPrepare, "native-certificate-address").value = "192.168.1.10";
  element(cannotPrepare, "native-certificate-address").dispatch("input");
  assert.equal(element(cannotPrepare, "prepare-native-identity").disabled, true);
});

test("explicit preparation sends the address and displays only validated returned identity fields", async () => {
  const fingerprint = "a".repeat(64);
  const expiry = Date.UTC(2035, 0, 2, 3, 4, 5);
  const calls = [];
  const ctx = createRenderer({
    prepareNativeIdentity: async args => {
      calls.push(args);
      return coreStatus({ nativeConnectivity: validNative({
        state: "identity_prepared",
        canPrepare: false,
        serverSpkiSha256: fingerprint,
        serverNotAfter: expiry,
        memberIssuerNotAfter: expiry + 1000,
        token: "must-not-render",
        privatePath: "C:\\private\\key.pem",
      }) });
    },
  });
  await settle();
  const address = element(ctx, "native-certificate-address");
  const button = element(ctx, "prepare-native-identity");
  assert.equal(button.disabled, true);
  address.value = " 192.168.1.10 ";
  address.dispatch("input");
  assert.equal(button.disabled, false);
  button.dispatch("click");
  await settle();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].serverAddress, "192.168.1.10");
  assert.equal(element(ctx, "native-identity-state").textContent, "Identity prepared");
  assert.equal(element(ctx, "native-fingerprint").textContent, fingerprint);
  assert.equal(element(ctx, "native-server-expiry").textContent, new Date(expiry).toISOString());
  assert.equal(element(ctx, "native-issuer-expiry").textContent, new Date(expiry + 1000).toISOString());
  assert.equal(element(ctx, "prepare-native-identity").disabled, true);
  assert.equal(element(ctx, "action-notice").textContent, "Preparation request completed.");
  assert.doesNotMatch(rendererSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(element(ctx, "native-identity-state").textContent, /must-not-render|private/);
});

test("a canceled preparation does not claim an identity that the returned status does not show", async () => {
  const unchangedStatus = coreStatus({ nativeConnectivity: validNative({ state: "not_prepared", canPrepare: true }) });
  const ctx = createRenderer({ prepareNativeIdentity: async () => unchangedStatus });
  await settle();
  element(ctx, "native-certificate-address").value = "192.168.1.10";
  element(ctx, "native-certificate-address").dispatch("input");
  element(ctx, "prepare-native-identity").dispatch("click");
  await settle();

  assert.equal(element(ctx, "native-identity-state").textContent, "Not prepared");
  assert.equal(element(ctx, "native-fingerprint-row").hidden, true);
  assert.equal(element(ctx, "action-notice").textContent, "Preparation request completed.");
});

test("returned malformed status never changes the identity display to prepared", async () => {
  const ctx = createRenderer({ prepareNativeIdentity: async () => ({}) });
  await settle();
  element(ctx, "native-certificate-address").value = "192.168.1.10";
  element(ctx, "native-certificate-address").dispatch("input");
  element(ctx, "prepare-native-identity").dispatch("click");
  await settle();

  assert.equal(element(ctx, "native-identity-state").textContent, "Not prepared");
  assert.match(element(ctx, "action-notice").textContent, /action failed/i);
});

test("quit button is a bottom local desktop action and does not quit on startup", async () => {
  let quitCalls = 0;
  const ctx = createRenderer({ api: { quitDesktop: () => { quitCalls += 1; } } });
  await settle();

  assert.match(htmlSource, /<section class="section" aria-labelledby="local-desktop-heading">[\s\S]*?<button id="quit-desktop"[^>]*>Quit SPS Desktop<\/button>[\s\S]*?<\/section>\s*<\/main>/);
  assert.equal(element(ctx, "quit-desktop").disabled, false);
  assert.equal(quitCalls, 0);
});

test("quit works when status is unavailable or the current user is a Member", async () => {
  for (const getStatus of [
    async () => { throw new Error("private status diagnostic"); },
    async () => coreStatus({ canManageHost: false }),
  ]) {
    let quitCalls = 0;
    let statusCalls = 0;
    const ctx = createRenderer({
      getStatus: async () => { statusCalls += 1; return getStatus(); },
      api: { quitDesktop: () => { quitCalls += 1; } },
    });
    await settle();
    const button = element(ctx, "quit-desktop");
    assert.equal(button.disabled, false);
    button.dispatch("click");
    await settle();

    assert.equal(quitCalls, 1);
    assert.equal(statusCalls, 1);
    assert.equal(button.disabled, true);
  }
});

test("quit calls the bridge once with no arguments and reports pending without claiming completion", async () => {
  const calls = [];
  const ctx = createRenderer({ api: { quitDesktop: (...args) => { calls.push(args); } } });
  await settle();

  element(ctx, "quit-desktop").dispatch("click");
  await settle();

  assert.deepEqual(calls, [[]]);
  assert.equal(element(ctx, "action-notice").textContent, "Closing SPS Desktop...");
  assert.equal(element(ctx, "quit-desktop").disabled, true);
});

test("quit rejects with a fixed safe message and can be retried without refreshing status", async () => {
  let statusCalls = 0;
  let quitCalls = 0;
  const ctx = createRenderer({
    getStatus: async () => { statusCalls += 1; return coreStatus(); },
    api: {
      quitDesktop: async () => {
        quitCalls += 1;
        if (quitCalls === 1) throw new Error("C:\\private\\secret-token.txt");
      },
    },
  });
  await settle();
  const button = element(ctx, "quit-desktop");
  button.dispatch("click");
  await settle();

  assert.equal(element(ctx, "action-notice").textContent, "Could not close SPS Desktop. Try again.");
  assert.equal(element(ctx, "action-notice").classes.has("error"), true);
  assert.doesNotMatch(element(ctx, "action-notice").textContent, /secret-token|private/i);
  assert.equal(button.disabled, false);

  button.dispatch("click");
  await settle();
  assert.equal(quitCalls, 2);
  assert.equal(statusCalls, 1);
  assert.equal(element(ctx, "action-notice").textContent, "Closing SPS Desktop...");
  assert.equal(button.disabled, true);
});

test("a pending quit disables the button and ignores overlapping clicks", async () => {
  let resolveQuit;
  let quitCalls = 0;
  const ctx = createRenderer({
    api: {
      quitDesktop: () => {
        quitCalls += 1;
        return new Promise(resolve => { resolveQuit = resolve; });
      },
    },
  });
  await settle();
  const button = element(ctx, "quit-desktop");
  button.dispatch("click");
  assert.equal(button.disabled, true);
  assert.equal(element(ctx, "action-notice").textContent, "Closing SPS Desktop...");
  button.dispatch("click");
  await settle();

  assert.equal(quitCalls, 1);
  resolveQuit();
  await settle();
  assert.equal(button.disabled, true);
  button.dispatch("click");
  await settle();
  assert.equal(quitCalls, 1);
  assert.equal(element(ctx, "action-notice").textContent, "Closing SPS Desktop...");
});

test("a pending host mutation disables quit and a dispatched click does not call it", async () => {
  let resolveUpdate;
  let quitCalls = 0;
  const ctx = createRenderer({
    api: {
      checkUpdates: () => new Promise(resolve => { resolveUpdate = resolve; }),
      quitDesktop: () => { quitCalls += 1; },
    },
  });
  await settle();
  const quitButton = element(ctx, "quit-desktop");
  ctx.actionButtons.find(button => button.dataset.action === "check-updates").dispatch("click");
  assert.equal(quitButton.disabled, true);
  quitButton.dispatch("click");
  await settle();

  assert.equal(quitCalls, 0);
  resolveUpdate();
  await settle();
  assert.equal(quitButton.disabled, false);
});

test("quit stays available during initial status loading and late failure cannot overwrite its pending state", async () => {
  let rejectStatus;
  let quitCalls = 0;
  const ctx = createRenderer({
    getStatus: () => new Promise((_resolve, reject) => { rejectStatus = reject; }),
    api: { quitDesktop: async () => { quitCalls += 1; } },
  });
  const button = element(ctx, "quit-desktop");
  assert.equal(button.disabled, false);
  button.dispatch("click");
  await settle();
  rejectStatus(new Error("private status detail"));
  await settle();
  button.dispatch("click");
  await settle();

  assert.equal(quitCalls, 1);
  assert.equal(button.disabled, true);
  assert.equal(element(ctx, "action-notice").textContent, "Closing SPS Desktop...");
});
