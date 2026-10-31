import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

export function isOwnedSocketFailureCode(value) {
  return value === -15 || value === -101 || value === -324;
}

export async function assertWorkspaceNavigationRetry({ app, setup, expectedUserData, expectedWorkspaceOrigin,
  waitFor, api, company, project }) {
  const origin = new URL(expectedWorkspaceOrigin);
  assert.equal(origin.origin, expectedWorkspaceOrigin);
  assert.equal(origin.protocol, "http:");
  assert.equal(origin.hostname, "127.0.0.1");
  assert.ok(origin.port && !origin.username && !origin.password);
  const initial = await setup.evaluate(() => window.spsDesktop.getStatus());
  assert.equal(initial.desktopAccount.signedIn, true);
  assert.equal(initial.desktopAccount.pending, false);
  assert.equal(new URL(initial.profile.hubUrl).origin, expectedWorkspaceOrigin);
  const token = randomUUID();
  const failingServer = createServer(socket => socket.destroy());
  let listening = false;
  try {
    await app.evaluate(({ app }, directory) => {
      const path = process.getBuiltinModule("path");
      if (process.env.SPS_DESKTOP_E2E !== "1"
        || path.resolve(app.getPath("userData")) !== path.resolve(directory)
        || path.resolve(process.env.SPS_DESKTOP_E2E_USER_DATA_DIR || "") !== path.resolve(directory)) {
        throw new Error("Navigation retry acceptance requires its exact isolated Main profile.");
      }
      if (globalThis.__spsNavigationRetryAcceptance) throw new Error("Navigation retry acceptance is already active.");
    }, expectedUserData);
    await new Promise((resolve, reject) => {
      failingServer.once("error", reject);
      failingServer.listen(0, "127.0.0.1", resolve);
    });
    listening = true;
    const failingUrl = `http://127.0.0.1:${failingServer.address().port}/`;
    await app.evaluate(({ app, BrowserWindow }, { directory, origin, token, failingUrl }) => {
      const path = process.getBuiltinModule("path");
      if (process.env.SPS_DESKTOP_E2E !== "1"
        || path.resolve(app.getPath("userData")) !== path.resolve(directory)
        || path.resolve(process.env.SPS_DESKTOP_E2E_USER_DATA_DIR || "") !== path.resolve(directory)) {
        throw new Error("Navigation retry acceptance requires its exact isolated Main profile.");
      }
      if (globalThis.__spsNavigationRetryAcceptance) throw new Error("Navigation retry acceptance is already active.");
      const root = `${origin}/`;
      const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()
        && window.webContents.getURL().startsWith(root));
      if (windows.length !== 1) throw new Error("Expected one current fixture Workspace before navigation failure.");
      const control = { token, root, attempted: 0, failed: null, errorCode: null, created: [], listeners: [],
        original: BrowserWindow.prototype.loadURL };
      control.onCreated = (_event, window) => {
        control.created.push(window);
        const listener = (_event, code, _description, url, mainFrame) => {
          if (url === failingUrl && mainFrame) {
            control.failed = window;
            control.errorCode = code;
          }
        };
        window.webContents.on("did-fail-load", listener);
        control.listeners.push([window.webContents, listener]);
      };
      control.wrapper = function (url, ...args) {
        if (url === root && control.attempted === 0) {
          control.attempted++;
          return control.original.call(this, failingUrl, ...args);
        }
        return control.original.call(this, url, ...args);
      };
      globalThis.__spsNavigationRetryAcceptance = control;
      app.on("browser-window-created", control.onCreated);
      BrowserWindow.prototype.loadURL = control.wrapper;
      windows[0].destroy();
    }, { directory: expectedUserData, origin: expectedWorkspaceOrigin, token, failingUrl });

    let rejected = false;
    try { await setup.evaluate(() => window.spsDesktop.openWorkspace()); }
    catch { rejected = true; }
    const observation = await app.evaluate(({ BrowserWindow }) => {
      const control = globalThis.__spsNavigationRetryAcceptance;
      if (BrowserWindow.prototype.loadURL === control.wrapper) BrowserWindow.prototype.loadURL = control.original;
      return { attempted: control.attempted, created: control.created.length,
        errorCode: control.errorCode, retained: Boolean(control.failed && !control.failed.isDestroyed()) };
    });
    const failure = { attempted: observation.attempted, created: observation.created,
      nativeFailure: isOwnedSocketFailureCode(observation.errorCode), retained: observation.retained };
    if (!rejected || !failure.nativeFailure) console.error(`[workspace-retry-observation] ${JSON.stringify({ rejected, ...failure })}`);
    assert.equal(rejected, true, "The real failed socket navigation must reject its Main IPC.");
    assert.deepEqual(failure, { attempted: 1, created: 1, nativeFailure: true, retained: true });

    await setup.evaluate(() => window.spsDesktop.openWorkspace());
    const replaced = await app.evaluate(() => {
      const control = globalThis.__spsNavigationRetryAcceptance;
      return { destroyed: control.failed.isDestroyed(), created: control.created.length };
    });
    assert.deepEqual(replaced, { destroyed: true, created: 2 }, "Explicit retry must replace only the failed navigation window.");
    await waitFor(() => app.evaluate(() => {
      const control = globalThis.__spsNavigationRetryAcceptance;
      const current = control.created[1];
      return !current.isDestroyed() && current.isVisible() && current.webContents.getURL().startsWith(control.root);
    }), "visible Workspace after explicit navigation retry");
    const page = await waitFor(() => {
      const pages = app.windows().filter(page => !page.isClosed() && page.url().startsWith(`${expectedWorkspaceOrigin}/`));
      return pages.length === 1 ? pages[0] : null;
    }, "authenticated retry Workspace page");
    const projects = await api(page, `/api/companies/${company.id}/projects`);
    assert.ok(projects.some(row => row.id === project.id && row.name === project.name));
    const after = await setup.evaluate(() => window.spsDesktop.getStatus());
    assert.equal(after.desktopAccount.email, initial.desktopAccount.email);
    assert.equal(after.desktopAccount.signedIn, true);
    return { actualNavigationFailure: true, failedWindowRetainedUntilExplicitRetry: true,
      onlyFailedWindowReplaced: true, authenticatedWorkspaceAndDataRetained: true };
  } finally {
    try { await app.evaluate(({ app, BrowserWindow }, { token, directory }) => {
      const path = process.getBuiltinModule("path");
      if (process.env.SPS_DESKTOP_E2E !== "1"
        || path.resolve(app.getPath("userData")) !== path.resolve(directory)
        || path.resolve(process.env.SPS_DESKTOP_E2E_USER_DATA_DIR || "") !== path.resolve(directory)) return;
      const control = globalThis.__spsNavigationRetryAcceptance;
      if (!control || control.token !== token) return;
      if (BrowserWindow.prototype.loadURL === control.wrapper) BrowserWindow.prototype.loadURL = control.original;
      app.off("browser-window-created", control.onCreated);
      for (const [contents, listener] of control.listeners) {
        if (!contents.isDestroyed()) contents.off("did-fail-load", listener);
      }
      delete globalThis.__spsNavigationRetryAcceptance;
    }, { token, directory: expectedUserData }); }
    finally {
      if (listening) await new Promise((resolve, reject) => failingServer.close(error => error ? reject(error) : resolve()));
    }
  }
}
