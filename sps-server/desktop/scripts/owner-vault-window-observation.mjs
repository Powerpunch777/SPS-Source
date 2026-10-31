const LIMIT = 8;

function locationKind(value) {
  if (typeof value !== "string") return "unavailable";
  if (value === "" || value === "about:blank") return "blank";
  if (value.startsWith("file:")) return "file";
  return /^http:\/\/127\.0\.0\.1:\d+\//.test(value) ? "loopback-http" : "other";
}

// Passed directly to Playwright's Electron Main evaluation: keep this function
// self-contained, synchronous and read-only. Never return URLs, titles or paths.
export function observeNativeTransferWindows({ BrowserWindow }) {
  const windows = BrowserWindow.getAllWindows();
  return {
    count: Math.min(windows.length, 33), truncated: windows.length > 8,
    windows: windows.slice(0, 8).map(window => {
      try {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return { state: "closed" };
        const contents = window.webContents;
        const url = contents.getURL();
        const kind = url === "" || url === "about:blank" ? "blank"
          : url.startsWith("file:") ? "file"
          : /^http:\/\/127\.0\.0\.1:\d+\//.test(url) ? "loopback-http" : "other";
        return { state: "observed", kind, visible: window.isVisible(), loading: contents.isLoading(),
          loadingMainFrame: contents.isLoadingMainFrame(), waitingForResponse: contents.isWaitingForResponse(),
          crashed: contents.isCrashed() };
      } catch { return { state: "unavailable" }; }
    }),
  };
}

function trackedWindows(app) {
  const windows = app.windows();
  return { count: Math.min(windows.length, 33), truncated: windows.length > LIMIT,
    windows: windows.slice(0, LIMIT).map(page => {
      try { return { kind: locationKind(page.url()), closed: page.isClosed() }; }
      catch { return { kind: "unavailable", closed: null }; }
    }) };
}

export async function observeTransferWindows(app) {
  let timer;
  let native;
  try {
    const value = await Promise.race([
      app.evaluate(observeNativeTransferWindows),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), 5000); }),
    ]);
    native = { state: "reported", ...value };
  } catch { native = { state: "unavailable" }; }
  finally { clearTimeout(timer); }
  let tracked;
  try { tracked = { state: "reported", ...trackedWindows(app) }; }
  catch { tracked = { state: "unavailable" }; }
  return { native, tracked };
}
