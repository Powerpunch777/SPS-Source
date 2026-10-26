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
    this.textContent = "";
    this.children = [];
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
  append(...children) { this.children.push(...children); }
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
  assert.match(htmlSource, /LAN access<\/dt>\s*<dd>Off · not active<\/dd>/);
  assert.match(htmlSource, /Native LAN \(in development\)/);
  assert.doesNotMatch(htmlSource, /listener|online/i);
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
