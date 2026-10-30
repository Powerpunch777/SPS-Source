import { randomUUID } from "node:crypto";
import { validateSpsNativePluginAsset, validateSpsNativePluginDescriptor,
  snapshotNativePluginJson } from "./native-plugin-protocol.mjs";
import { validateSpsNativeWorkspaceBootstrap } from "./native-enrollment-response.mjs";

const ACCOUNT_KEYS = ["identityIssuer", "subject", "userDataDirectory", "vaultDirectory", "generation"];
const SCOPE_KEYS = ["hostId", "workspaceId", "pluginId", "surface", "surfaceId", "revision"];
const CHANNELS = ["desktop:native-plugin-bootstrap", "desktop:native-plugin-data", "desktop:native-plugin-action"];
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const unavailable = () => new Error("The Native Plugin window is unavailable. Check the connection and retry.");

function record(value, keys, required = keys) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const own = Reflect.ownKeys(descriptors);
    if (own.some(key => typeof key !== "string" || !keys.includes(key))
      || required.some(key => !own.includes(key))) throw unavailable();
    const output = Object.create(null);
    for (const key of own) {
      if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) throw unavailable();
      output[key] = descriptors[key].value;
    }
    return output;
  } catch { throw unavailable(); }
}

function scopeRecord(value) {
  const scope = record(value, SCOPE_KEYS);
  if (!["hostId", "workspaceId", "pluginId"].every(key => typeof scope[key] === "string" && UUID.test(scope[key]))
    || !["shell", "widget"].includes(scope.surface) || typeof scope.surfaceId !== "string"
    || !scope.surfaceId || scope.surfaceId.length > 200 || /[\x00-\x1f\x7f]/.test(scope.surfaceId)
    || typeof scope.revision !== "string" || !SHA.test(scope.revision)) throw unavailable();
  return Object.freeze(scope);
}

function launchInput(value) {
  const input = record(value, ["hostId", "workspaceId", "pluginId", "surface", "surfaceId"],
    ["hostId", "workspaceId", "pluginId", "surface", "surfaceId"]);
  if (!["hostId", "workspaceId", "pluginId"].every(key => typeof input[key] === "string" && UUID.test(input[key]))
    || !["shell", "widget"].includes(input.surface) || typeof input.surfaceId !== "string"
    || !input.surfaceId || input.surfaceId.length > 200 || /[\x00-\x1f\x7f]/.test(input.surfaceId)) throw unavailable();
  return Object.freeze(input);
}

function syncGuard(guard) {
  const result = guard();
  if (result !== undefined) {
    if (result && typeof result.then === "function") void Promise.resolve(result).catch(() => {});
    throw unavailable();
  }
}

async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), 10_000); })]); }
  finally { clearTimeout(timer); }
}

function memberBootstrap(value, expectedWorkspaceId) {
  const bootstrap = validateSpsNativeWorkspaceBootstrap(value);
  if (bootstrap.workspace.id !== expectedWorkspaceId) throw unavailable();
  return Object.freeze({ workspace: bootstrap.workspace, member: bootstrap.member });
}

function safeDataCall(value) {
  const input = record(value, ["key", "params"]);
  if (typeof input.key !== "string" || !input.key || input.key.length > 200 || /[\x00-\x1f\x7f]/.test(input.key)) throw unavailable();
  if (!input.params || typeof input.params !== "object" || Array.isArray(input.params)) throw unavailable();
  return Object.freeze({ key: input.key, params: snapshotNativePluginJson(input.params) });
}

function parentKey(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid Native Plugin parent window.");
  return value;
}

/** Main-only owner of one isolated renderer per selected, server-authorized Plugin surface. */
export function createSpsNativePluginWindowController({ BrowserWindow, getAuthority, getAssetRoot,
  createAssets, preloadFile, getBootstrap, getDescriptor, invoke, readAsset, maxWindows = 4,
  maxOperations = 2 }) {
  if (typeof BrowserWindow !== "function" || [getAuthority, getAssetRoot, createAssets, getBootstrap,
    getDescriptor, invoke, readAsset].some(value => typeof value !== "function")
    || typeof preloadFile !== "string" || !Number.isSafeInteger(maxWindows) || maxWindows < 1 || maxWindows > 4
    || !Number.isSafeInteger(maxOperations) || maxOperations !== 2) throw new TypeError("Invalid Native Plugin window configuration.");
  let disposed = false;
  let cleanupFailed = false;
  let registered = null;
  const launches = new Set();
  const drains = new Set();

  function capture() {
    if (disposed) throw unavailable();
    const current = record(getAuthority(), ACCOUNT_KEYS);
    if (ACCOUNT_KEYS.slice(0, 4).some(key => typeof current[key] !== "string" || !current[key])
      || !(typeof current.generation === "bigint" ? current.generation >= 0n
        : Number.isSafeInteger(current.generation) && current.generation >= 0)) throw unavailable();
    return Object.freeze(current);
  }
  function assertCurrent(launch) {
    const current = capture();
    if (launch.closed || launch.abort.signal.aborted || ACCOUNT_KEYS.some(key => current[key] !== launch.account[key])
      || launch.window?.isDestroyed()) throw unavailable();
  }
  function close(launch) {
    if (launch.closed) return launch.closing ?? Promise.resolve();
    launch.closed = true;
    launch.abort.abort();
    launches.delete(launch);
    try { if (launch.window && !launch.window.isDestroyed()) launch.window.destroy(); } catch { /* Authority is already fenced. */ }
    const closing = bounded((async () => {
      const assets = await launch.assetsPromise?.catch(() => null);
      if (assets) {
        if (!launch.assetDisposal) launch.assetDisposal = Promise.resolve().then(() => assets.dispose());
        await launch.assetDisposal;
      }
      await Promise.allSettled([...launch.operations]);
      await launch.session?.clearStorageData?.();
      await launch.session?.clearCache?.();
    })());
    launch.closing = closing;
    drains.add(closing);
    void closing.catch(() => { cleanupFailed = true; }).finally(() => drains.delete(closing));
    return closing;
  }
  function assertSender(launch, event) {
    assertCurrent(launch);
    const window = launch.window;
    if (!window || event.sender !== window.webContents || !event.senderFrame
      || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== launch.url
      || window.webContents.getURL() !== launch.url) throw unavailable();
  }
  function fromEvent(event) {
    const launch = [...launches].find(value => value.window?.webContents === event.sender);
    if (!launch) throw unavailable();
    assertSender(launch, event);
    return launch;
  }
  async function operate(launch, event, action) {
    assertSender(launch, event);
    if (launch.operations.size >= maxOperations) throw unavailable();
    const operation = new AbortController();
    const abort = () => operation.abort();
    const timer = setTimeout(abort, 10_000);
    launch.abort.signal.addEventListener("abort", abort, { once: true });
    const check = () => { assertSender(launch, event); if (operation.signal.aborted) throw unavailable(); };
    const promise = Promise.resolve().then(async () => {
      check();
      const result = await bounded(action({ signal: operation.signal, assertRequester: check }));
      check();
      return result;
    });
    launch.operations.add(promise);
    try { return await promise; }
    catch { throw unavailable(); }
    finally { clearTimeout(timer); launch.abort.signal.removeEventListener("abort", abort); launch.operations.delete(promise); }
  }
  function bootstrap(launch, event) {
    assertSender(launch, event);
    return Object.freeze({ descriptor: launch.descriptor, ...launch.workspaceBootstrap });
  }
  async function call(launch, event, operation, raw) {
    const input = safeDataCall(raw);
    return operate(launch, event, async options => {
      const response = await invoke(launch.scope, { operation, key: input.key, params: input.params }, options);
      return snapshotNativePluginJson(response, 256 * 1024);
    });
  }
  function assetReader(launch) {
    return async (relativePath, signal) => {
      assertCurrent(launch);
      const controller = new AbortController();
      const abortFromLaunch = () => controller.abort();
      const abortFromServer = () => controller.abort();
      launch.abort.signal.addEventListener("abort", abortFromLaunch, { once: true });
      signal?.addEventListener("abort", abortFromServer, { once: true });
      if (launch.abort.signal.aborted || signal?.aborted) controller.abort();
      try {
        const value = validateSpsNativePluginAsset(await readAsset(launch.scope, { path: relativePath }, {
          signal: controller.signal,
        }), relativePath);
        assertCurrent(launch);
        if (controller.signal.aborted) throw unavailable();
        return value;
      } finally {
        launch.abort.signal.removeEventListener("abort", abortFromLaunch);
        signal?.removeEventListener("abort", abortFromServer);
        controller.abort();
      }
    };
  }

  return Object.freeze({
    registerIpc(ipcMain) {
      if (registered) { if (registered !== ipcMain) throw unavailable(); return; }
      registered = ipcMain;
      ipcMain.handle(CHANNELS[0], async (event, ...args) => {
        try { const launch = fromEvent(event); if (args.length) throw unavailable(); return bootstrap(launch, event); }
        catch { throw unavailable(); }
      });
      ipcMain.handle(CHANNELS[1], async (event, ...args) => {
        try { return await call(fromEvent(event), event, "data", args.length === 1 ? args[0] : (() => { throw unavailable(); })()); }
        catch { throw unavailable(); }
      });
      ipcMain.handle(CHANNELS[2], async (event, ...args) => {
        try { return await call(fromEvent(event), event, "action", args.length === 1 ? args[0] : (() => { throw unavailable(); })()); }
        catch { throw unavailable(); }
      });
    },
    async open(input, { parentId = null, signal, assertRequester = () => {} } = {}) {
      const requested = launchInput(input);
      parentId = parentKey(parentId);
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw unavailable();
      syncGuard(assertRequester);
      if (signal?.aborted) throw unavailable();
      const account = capture();
      if (launches.size >= maxWindows) throw unavailable();
      const launch = { account, scope: null, descriptor: null, workspaceBootstrap: null, parentId,
        window: null, session: null, assetsPromise: null, url: null, closed: false, closing: null,
        abort: new AbortController(), operations: new Set(), assetDisposal: null };
      launches.add(launch);
      const abortFromParent = () => { void close(launch).catch(() => {}); };
      signal?.addEventListener("abort", abortFromParent, { once: true });
      const check = () => { assertCurrent(launch); syncGuard(assertRequester); };
      try {
        const baseScope = Object.freeze(requested);
        const bootstrapResult = await bounded(getBootstrap(baseScope, { signal: launch.abort.signal, assertRequester: check }));
        check();
        launch.workspaceBootstrap = memberBootstrap(bootstrapResult, requested.workspaceId);
        const descriptor = validateSpsNativePluginDescriptor(await bounded(getDescriptor(baseScope, {
          signal: launch.abort.signal, assertRequester: check,
        })));
        check();
        if (descriptor.workspaceId !== requested.workspaceId || descriptor.pluginId !== requested.pluginId
          || descriptor.surface !== requested.surface || descriptor.surfaceId !== requested.surfaceId) throw unavailable();
        launch.scope = scopeRecord({ ...requested, revision: descriptor.revision });
        launch.descriptor = descriptor;
        const root = await getAssetRoot(); check();
        launch.assetsPromise = Promise.resolve(createAssets({ root, assertCurrent: () => assertCurrent(launch),
          plugin: { readAsset: assetReader(launch) } }));
        const assets = await launch.assetsPromise; check();
        const origin = new URL(assets.origin);
        if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || !origin.port || origin.origin !== assets.origin) throw unavailable();
        launch.url = `${origin.origin}/`;
        const window = new BrowserWindow({ title: descriptor.displayName, width: 1080, height: 760,
          minWidth: 600, minHeight: 500, show: false, autoHideMenuBar: true,
          webPreferences: { preload: preloadFile, contextIsolation: true, sandbox: true, nodeIntegration: false,
            partition: `sps-native-plugin-${randomUUID()}` } });
        launch.window = window; launch.session = window.webContents.session;
        window.webContents.session.setPermissionRequestHandler?.((_contents, _permission, callback) => callback(false));
        window.webContents.session.setPermissionCheckHandler?.(() => false);
        window.webContents.session.on?.("will-download", event => event.preventDefault());
        window.setMenu(null);
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        for (const event of ["will-navigate", "will-redirect"]) window.webContents.on(event,
          (navigation, url) => { if (url !== launch.url) navigation.preventDefault(); });
        window.webContents.on("will-attach-webview", event => event.preventDefault());
        window.webContents.on("render-process-gone", () => { void close(launch).catch(() => {}); });
        window.once("closed", () => { void close(launch).catch(() => {}); });
        window.once("ready-to-show", () => { try { assertCurrent(launch); window.show(); } catch { void close(launch).catch(() => {}); } });
        const cookie = record(assets.launchCookie, ["name", "value", "httpOnly", "sameSite", "path"]);
        if (cookie.name !== "sps_native_workspace_launch" || typeof cookie.value !== "string"
          || !/^[A-Za-z0-9_-]{43}$/.test(cookie.value) || cookie.httpOnly !== true
          || cookie.sameSite !== "strict" || cookie.path !== "/") throw unavailable();
        await window.webContents.session.cookies.set({ ...cookie, url: launch.url }); check();
        await window.loadURL(launch.url); check();
        return Object.freeze({ opened: true });
      } catch {
        try { await close(launch); } catch { /* Keep errors independent of credentials and paths. */ }
        throw unavailable();
      } finally {
        signal?.removeEventListener("abort", abortFromParent);
      }
    },
    closeForParent(parentId) { return Promise.allSettled([...launches].filter(item => item.parentId === parentId).map(close)); },
    closeForWorkspace(hostId, workspaceId) {
      return Promise.allSettled([...launches].filter(item => item.scope?.hostId === hostId && item.scope?.workspaceId === workspaceId).map(close));
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
