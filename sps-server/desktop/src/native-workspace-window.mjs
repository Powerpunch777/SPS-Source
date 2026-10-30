import { randomUUID } from "node:crypto";
import { validateSpsNativeWorkspaceBootstrap, validateSpsNativeWorkspaceSurface,
  validateSpsNativeInboxStateInput, validateSpsNativeInboxState } from "./native-enrollment-response.mjs";
import { requireSpsNativeMemberWorkspaceBootstrapInput } from "./native-member-controller.mjs";
import { requireSpsNativePluginSelection } from "./native-plugin-protocol.mjs";

const ACCOUNT_KEYS = ["identityIssuer", "subject", "userDataDirectory", "vaultDirectory", "generation"];
const CHANNELS = ["desktop:native-workspace-bootstrap", "desktop:native-workspace-read",
  "desktop:native-workspace-inbox-state", "desktop:native-workspace-open-plugin"];
const unavailable = () => new Error("The Native Workspace is unavailable. Check the connection and retry.");

function record(value, keys, required = keys) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const own = Reflect.ownKeys(descriptors);
    if (own.some(key => typeof key !== "string" || !keys.includes(key))
      || required.some(key => !own.includes(key))) throw unavailable();
    const output = {};
    for (const key of own) {
      if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) throw unavailable();
      output[key] = descriptors[key].value;
    }
    return output;
  } catch { throw unavailable(); }
}

function syncGuard(guard) {
  const value = guard();
  if (value !== undefined) {
    if (value && typeof value.then === "function") void Promise.resolve(value).catch(() => {});
    throw unavailable();
  }
}

function surfaceInput(value) {
  const input = record(value, ["surface", "archived"], ["surface"]);
  if (!["shell", "providers", "dashboard", "inbox", "executionControl"].includes(input.surface)
    || Object.hasOwn(input, "archived") && (input.surface !== "inbox" || typeof input.archived !== "boolean")) throw unavailable();
  return Object.freeze(input);
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), 10_000); })]);
  } finally { clearTimeout(timer); }
}

function awaitTurn(turn, signal) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => finish(unavailable()), 5000);
    const onAbort = () => finish(unavailable());
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
    void turn.then(() => finish(), () => finish(unavailable()));
    if (signal.aborted) onAbort();
  });
}

/** Main-only window ownership. Every IPC selects its Host/Workspace from the
 * retained launch scope, never a renderer argument. */
export function createSpsNativeWorkspaceWindowController({ BrowserWindow, getAuthority, getAssetRoot,
  createAssets, preloadFile, getBootstrap, readSurface, updateInboxState, openPlugin = null,
  onPluginParentClosed = () => {}, maxWindows = 4 }) {
  if (typeof BrowserWindow !== "function" || [getAuthority, getAssetRoot, createAssets, getBootstrap, readSurface]
    .some(value => typeof value !== "function") || typeof preloadFile !== "string"
    || openPlugin !== null && typeof openPlugin !== "function" || typeof onPluginParentClosed !== "function"
    || !Number.isSafeInteger(maxWindows) || maxWindows < 1 || maxWindows > 4) throw new TypeError("Invalid Native Workspace window configuration.");
  let disposed = false;
  let cleanupFailed = false;
  let registered = null;
  let operationTail = Promise.resolve();
  let queuedOperations = 0;
  const launches = new Set();
  const drains = new Set();

  function capture() {
    if (disposed) throw unavailable();
    const value = record(getAuthority(), ACCOUNT_KEYS);
    if (ACCOUNT_KEYS.slice(0, 4).some(key => typeof value[key] !== "string" || !value[key])
      || !(typeof value.generation === "bigint" ? value.generation >= 0n
        : Number.isSafeInteger(value.generation) && value.generation >= 0)) throw unavailable();
    return Object.freeze(value);
  }
  function assertCurrent(launch) {
    const current = capture();
    if (launch.closed || ACCOUNT_KEYS.some(key => current[key] !== launch.account[key])
      || launch.window?.isDestroyed()) throw unavailable();
  }
  function close(launch) {
    if (launch.closed) return launch.closing ?? Promise.resolve();
    launch.closed = true;
    launch.abort.abort();
    launches.delete(launch);
    try {
      const parentId = launch.window?.id;
      if (Number.isSafeInteger(parentId)) {
        const pending = onPluginParentClosed(parentId);
        if (pending && typeof pending.then === "function") void Promise.resolve(pending).catch(() => {});
      }
    } catch { /* Parent-scoped Plugin windows are fenced by their own account guard. */ }
    try { if (launch.window && !launch.window.isDestroyed()) launch.window.destroy(); } catch { /* Authority is already fenced. */ }
    const closing = bounded((async () => {
      const assets = await launch.assetsPromise?.catch(() => null);
      if (assets) await disposeAssets(launch, assets);
      await Promise.allSettled([...launch.operations]);
      await launch.session?.clearStorageData?.();
      await launch.session?.clearCache?.();
    })());
    launch.closing = closing;
    drains.add(closing);
    void closing.catch(() => { cleanupFailed = true; }).finally(() => drains.delete(closing));
    return closing;
  }
  function disposeAssets(launch, assets) {
    if (!launch.assetDisposal) launch.assetDisposal = Promise.resolve().then(() => assets.dispose());
    return launch.assetDisposal;
  }
  async function operate(launch, action) {
    assertCurrent(launch);
    if (queuedOperations >= 8) throw unavailable();
    queuedOperations++;
    const previous = operationTail;
    let release;
    const slot = new Promise(resolve => { release = resolve; });
    operationTail = previous.then(() => slot, () => slot);
    const operation = (async () => {
      try {
        await awaitTurn(previous, launch.abort.signal);
        assertCurrent(launch);
        return await action();
      } finally { queuedOperations--; release(); }
    })();
    launch.operations.add(operation);
    try { return await operation; } finally { launch.operations.delete(operation); }
  }
  function assertSender(launch, event) {
    assertCurrent(launch);
    const window = launch.window;
    if (!window || event.sender !== window.webContents || !event.senderFrame
      || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame.url !== launch.url || window.webContents.getURL() !== launch.url) throw unavailable();
  }
  function fromEvent(event) {
    const launch = [...launches].find(value => value.window?.webContents === event.sender);
    if (!launch) throw unavailable();
    assertSender(launch, event);
    return launch;
  }
  async function bootstrap(launch, assertRequester) {
    assertCurrent(launch);
    if (!launch.bootstrapPending) {
      const pending = operate(launch, () => getBootstrap(launch.scope, { assertRequester, signal: launch.abort.signal }))
        .then(validateSpsNativeWorkspaceBootstrap);
      launch.bootstrapPending = pending;
      void pending.then(() => {
        if (launch.bootstrapPending === pending) launch.bootstrapPending = null;
      }, () => {
        if (launch.bootstrapPending === pending) launch.bootstrapPending = null;
      });
    }
    const result = await launch.bootstrapPending;
    syncGuard(assertRequester);
    assertCurrent(launch);
    if (result.workspace.id !== launch.scope.workspaceId) throw unavailable();
    return result;
  }

  return Object.freeze({
    registerIpc(ipcMain) {
      if (registered) { if (registered !== ipcMain) throw unavailable(); return; }
      registered = ipcMain;
      ipcMain.handle(CHANNELS[0], async (event, ...args) => {
        try {
          const launch = fromEvent(event);
          if (args.length) throw unavailable();
          return await bootstrap(launch, () => assertSender(launch, event));
        } catch { throw unavailable(); }
      });
      ipcMain.handle(CHANNELS[1], async (event, ...args) => {
        try {
          const launch = fromEvent(event);
          if (args.length !== 1) throw unavailable();
          const input = surfaceInput(args[0]);
          const key = `${input.surface}:${input.archived ?? "default"}`;
          let pending = launch.surfacePending.get(key);
          if (!pending) {
            pending = operate(launch, () => readSurface({ ...launch.scope, ...input }, {
              assertRequester: () => assertSender(launch, event), signal: launch.abort.signal,
            })).then(result => validateSpsNativeWorkspaceSurface(input.surface, launch.scope.workspaceId, result));
            launch.surfacePending.set(key, pending);
            void pending.then(() => launch.surfacePending.delete(key), () => launch.surfacePending.delete(key));
          }
          const result = await pending;
          assertSender(launch, event);
          return result;
        } catch { throw unavailable(); }
      });
      ipcMain.handle(CHANNELS[2], async (event, ...args) => {
        try {
          const launch = fromEvent(event);
          if (args.length !== 1 || typeof updateInboxState !== "function") throw unavailable();
          const state = validateSpsNativeInboxStateInput(args[0]);
          const options = { assertRequester: () => assertSender(launch, event), signal: launch.abort.signal };
          const result = await operate(launch, async () => {
            const current = validateSpsNativeWorkspaceBootstrap(await getBootstrap(launch.scope, options));
            assertSender(launch, event);
            if (current.workspace.id !== launch.scope.workspaceId || !current.capabilities.includes("workspace.inbox.state.write")) throw unavailable();
            return validateSpsNativeInboxState(await updateInboxState({ ...launch.scope, state }, options));
          });
          assertSender(launch, event);
          return result;
        } catch { throw unavailable(); }
      });
      ipcMain.handle(CHANNELS[3], async (event, ...args) => {
        try {
          const launch = fromEvent(event);
          if (args.length !== 1 || typeof openPlugin !== "function") throw unavailable();
          const selection = requireSpsNativePluginSelection(args[0]);
          const result = await operate(launch, () => openPlugin(Object.freeze({ ...launch.scope, ...selection }), {
            parentId: launch.window?.id,
            signal: launch.abort.signal,
            assertRequester: () => assertSender(launch, event),
          }));
          assertSender(launch, event);
          if (!result || result.opened !== true) throw unavailable();
          return Object.freeze({ opened: true });
        } catch { throw unavailable(); }
      });
    },
    async open(input, { assertRequester = () => {} } = {}) {
      const scope = requireSpsNativeMemberWorkspaceBootstrapInput(input);
      syncGuard(assertRequester);
      const account = capture();
      if (launches.size >= maxWindows) throw unavailable();
      const launch = { account, scope, window: null, assetsPromise: null, assets: null, url: null,
        closed: false, closing: null, abort: new AbortController(), operations: new Set(),
        assetDisposal: null, bootstrapPending: null, surfacePending: new Map() };
      launches.add(launch);
      const check = () => { assertCurrent(launch); syncGuard(assertRequester); };
      try {
        await bootstrap(launch, check);
        const root = await getAssetRoot(); check();
        launch.assetsPromise = Promise.resolve(createAssets({ root, assertCurrent: () => assertCurrent(launch) }));
        void launch.assetsPromise.then(assets => {
          launch.assets = assets;
          if (launch.closed) return disposeAssets(launch, assets);
        }).catch(() => {});
        const assets = await launch.assetsPromise; check();
        const origin = new URL(assets.origin);
        if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || !origin.port
          || origin.origin !== assets.origin) throw unavailable();
        launch.url = `${origin.origin}/`;
        const window = new BrowserWindow({ title: "SPS Workspace", width: 1280, height: 840,
          minWidth: 600, minHeight: 540, show: false, autoHideMenuBar: true,
          webPreferences: { preload: preloadFile, contextIsolation: true, sandbox: true, nodeIntegration: false,
            partition: `sps-native-workspace-${randomUUID()}` } });
        launch.window = window;
        launch.session = window.webContents.session;
        window.webContents.session.setPermissionRequestHandler?.((_contents, _permission, callback) => callback(false));
        window.webContents.session.setPermissionCheckHandler?.(() => false);
        window.webContents.session.on?.("will-download", event => event.preventDefault());
        window.setMenu(null);
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        for (const event of ["will-navigate", "will-redirect"]) {
          window.webContents.on(event, (navigation, url) => { if (url !== launch.url) navigation.preventDefault(); });
        }
        window.webContents.on("will-attach-webview", event => event.preventDefault());
        window.webContents.on("render-process-gone", () => { void close(launch).catch(() => {}); });
        window.once("closed", () => { void close(launch).catch(() => {}); });
        window.once("ready-to-show", () => {
          try { assertCurrent(launch); window.show(); } catch { void close(launch).catch(() => {}); }
        });
        const cookie = record(assets.launchCookie, ["name", "value", "httpOnly", "sameSite", "path"]);
        if (cookie.name !== "sps_native_workspace_launch" || typeof cookie.value !== "string"
          || !/^[A-Za-z0-9_-]{43}$/.test(cookie.value) || cookie.httpOnly !== true
          || cookie.sameSite !== "strict" || cookie.path !== "/") throw unavailable();
        await window.webContents.session.cookies.set({ ...cookie, url: launch.url }); check();
        await window.loadURL(launch.url); check();
        return Object.freeze({ opened: true });
      } catch {
        try { await close(launch); } catch { /* Keep the public error independent of credentials and paths. */ }
        throw unavailable();
      }
    },
    async invalidate() {
      const results = await Promise.allSettled([...launches].map(close).concat([...drains]));
      if (cleanupFailed || results.some(result => result.status === "rejected")) throw unavailable();
    },
    async dispose() {
      disposed = true;
      const results = await Promise.allSettled([...launches].map(close).concat([...drains]));
      for (const channel of CHANNELS) registered?.removeHandler?.(channel);
      registered = null;
      if (cleanupFailed || results.some(result => result.status === "rejected")) throw unavailable();
    },
  });
}
