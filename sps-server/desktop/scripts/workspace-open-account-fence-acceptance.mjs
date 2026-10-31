import assert from "node:assert/strict";

// Delay only completion of one real navigation; Identity, Core and IPC stay real.
export async function assertWorkspaceOpenAccountFence({ app, setup, identityOrigin,
  signIn, waitFor, api, company, project, expectedUserData, expectedWorkspaceOrigin }) {
  const initial = await setup.evaluate(() => window.spsDesktop.getStatus());
  assert.equal(initial.desktopAccount.signedIn, true);
  assert.equal(initial.desktopAccount.pending, false);
  const originalEmail = initial.desktopAccount.email;
  assert.equal(new URL(initial.profile.hubUrl).origin, expectedWorkspaceOrigin);
  let dialogFailure;
  const onDialog = dialog => {
    // Electron can silently cancel before CDP handles its mirrored notification.
    // Register explicitly so Playwright never auto-accepts the unload veto.
    void dialog.dismiss().catch(error => {
      if (!/No dialog is showing/.test(error.message)) dialogFailure = error;
    });
  };
  app.context().on("dialog", onDialog);
  try {
    await app.evaluate(({ app, BrowserWindow }, { directory, origin }) => {
      const path = process.getBuiltinModule("path");
      if (process.env.SPS_DESKTOP_E2E !== "1"
        || path.resolve(app.getPath("userData")) !== path.resolve(directory)
        || path.resolve(process.env.SPS_DESKTOP_E2E_USER_DATA_DIR || "") !== path.resolve(directory)) {
        throw new Error("Account fence acceptance requires its exact isolated Main profile.");
      }
      if (globalThis.__spsWorkspaceOpenFenceAcceptance) throw new Error("Account fence acceptance is already active.");
      const sameOrigin = value => { try { return new URL(value).origin === origin; } catch { return false; } };
      const existing = BrowserWindow.getAllWindows().filter(window => sameOrigin(window.webContents.getURL()));
      if (existing.length !== 1) throw new Error("Expected one current fixture Workspace before the account fence.");
      existing[0].destroy();
      const control = { armed: true, loaded: false, vetoes: 0, error: false,
        stale: null, original: BrowserWindow.prototype.loadURL, release: null };
      const gate = new Promise(resolve => { control.release = resolve; });
      control.wrapper = async function (url, ...args) {
        if (!control.armed || !sameOrigin(url)) return control.original.call(this, url, ...args);
        control.armed = false;
        control.stale = this;
        try {
          await control.original.call(this, url, ...args);
          this.webContents.on("will-prevent-unload", () => { control.vetoes += 1; });
          await this.webContents.executeJavaScript(`window.__spsFenceUnload = event => {
            event.preventDefault(); event.returnValue = false;
          }; window.addEventListener("beforeunload", window.__spsFenceUnload);`);
          control.loaded = true;
          await gate;
        } catch (error) { control.error = true; throw error; }
      };
      globalThis.__spsWorkspaceOpenFenceAcceptance = control;
      BrowserWindow.prototype.loadURL = control.wrapper;
    }, { directory: expectedUserData, origin: expectedWorkspaceOrigin });

    await setup.evaluate(() => {
      window.__spsFenceOpen = window.spsDesktop.openWorkspace().then(() => "resolved", () => "rejected");
    });
    await waitFor(() => app.evaluate(() => {
      const control = globalThis.__spsWorkspaceOpenFenceAcceptance;
      if (control.error) throw new Error("Real fixture navigation failed before the account change.");
      return control.loaded && !control.stale.isDestroyed() && control.stale.isVisible();
    }), "actual pending Workspace navigation");

    // signOut reloads the setup document. Its old renderer promise may disappear;
    // the observable signed-out state and unload event, not that rejection, qualify it.
    await setup.evaluate(() => window.spsDesktop.signOutSpsAccount()).catch(error => {
      if (!/Execution context was destroyed|context.*destroyed/i.test(error.message)) throw error;
    });
    await setup.waitForFunction(() => Boolean(window.spsDesktop), { timeout: 30_000 });
    await waitFor(async () => !(await setup.evaluate(() => window.spsDesktop.getStatus())).desktopAccount.signedIn,
      "real Desktop sign-out");
    const veto = await app.evaluate(() => {
      const control = globalThis.__spsWorkspaceOpenFenceAcceptance;
      return { observed: control.vetoes > 0, retained: !control.stale.isDestroyed() };
    });
    assert.deepEqual(veto, { observed: true, retained: true }, "The old renderer must actually veto ordinary close.");

    await signIn(setup, identityOrigin);
    const signedIn = await setup.evaluate(() => window.spsDesktop.getStatus());
    assert.equal(signedIn.desktopAccount.email, originalEmail, "Exercise a real same-account ABA, not a fabricated epoch.");
    assert.equal(signedIn.desktopAccount.signedIn, true);
    const freshWindowId = await waitFor(() => app.evaluate(({ BrowserWindow }, origin) => {
      const control = globalThis.__spsWorkspaceOpenFenceAcceptance;
      const windows = BrowserWindow.getAllWindows().filter(window => window !== control.stale
        && !window.isDestroyed() && window.webContents.getURL().startsWith(`${origin}/`));
      return windows.length === 1 && windows[0].isVisible() ? windows[0].id : null;
    }, expectedWorkspaceOrigin), "new account-scoped Workspace window");
    await app.evaluate(() => { globalThis.__spsWorkspaceOpenFenceAcceptance.release(); });
    await waitFor(() => app.evaluate(({ BrowserWindow }, id) => {
      const control = globalThis.__spsWorkspaceOpenFenceAcceptance;
      const fresh = BrowserWindow.fromId(id);
      return control.stale.isDestroyed() && fresh && !fresh.isDestroyed() && fresh.isVisible();
    }, freshWindowId), "stale window destruction without closing the newer window");
    const fresh = await waitFor(() => {
      // The Main check above identifies the retained window. Wait for CDP to
      // observe the destroyed old page instead of resolving its dead WebContents.
      const pages = app.windows().filter(page => !page.isClosed()
        && page.url().startsWith(`${expectedWorkspaceOrigin}/`));
      return pages.length === 1 ? pages[0] : null;
    }, "retained fresh Workspace page");
    const projects = await api(fresh, `/api/companies/${company.id}/projects`);
    assert.ok(projects.some(row => row.id === project.id && row.name === project.name));
    if (dialogFailure) throw dialogFailure;
    return { sameAccountSignOutSignIn: true, realRendererCloseVeto: true,
      staleWindowDestroyed: true, newerWorkspaceAndDataRetained: true };
  } finally {
    try { await app.evaluate(async ({ BrowserWindow }) => {
      const control = globalThis.__spsWorkspaceOpenFenceAcceptance;
      if (!control) return;
      if (BrowserWindow.prototype.loadURL === control.wrapper) BrowserWindow.prototype.loadURL = control.original;
      control.release();
      if (control.stale && !control.stale.isDestroyed()) {
        await control.stale.webContents.executeJavaScript(`window.removeEventListener("beforeunload", window.__spsFenceUnload);
          delete window.__spsFenceUnload;`).catch(() => {});
        control.stale.destroy();
      }
      delete globalThis.__spsWorkspaceOpenFenceAcceptance;
    }); } finally { app.context().off("dialog", onDialog); }
  }
}
