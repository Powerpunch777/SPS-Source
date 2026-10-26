import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";

assert.deepEqual(process.argv.slice(2), ["--isolated-native-workspace-window"]);
const desktop = path.resolve(import.meta.dirname, "..");
const fixture = await createWorkspaceE2eFixture();
let child, mainClosed = false;
try {
  await fixture.assertCurrent();
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  child = spawn(path.join(desktop, "node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : "electron"),
    [path.join(import.meta.dirname, "fixtures/native-workspace-window-child.mjs"),
      "--isolated-native-workspace-window", fixture.directory], {
      cwd: desktop, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: environment,
    });
  child.stdout.setEncoding("utf8");
  let output = "";
  child.stdout.on("data", chunk => {
    output = `${output}${chunk}`.slice(-2048);
    const lines = output.split("\n");
    output = lines.pop();
    for (const line of lines) if (/^native_window_stage:[a-z_]+$/.test(line.trim())) process.stdout.write(`${line.trim()}\n`);
  });
  child.stderr.resume();
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Native Workspace Electron fixture did not close in time.")), 90_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer); mainClosed = true;
      resolve(code);
    });
  });
  await fixture.assertCurrent();
  const result = JSON.parse(await readFile(path.join(fixture.directory, "result.json"), "utf8"));
  if (code !== 0) {
    const stage = ["startup", "window_open", "workspace_render", "browser_isolation", "dashboard_render", "inbox_render", "shutdown"]
      .includes(result?.stage) ? result.stage : "unknown";
    throw new Error(`Native Workspace Electron fixture failed at ${stage}.`);
  }
  assert.deepEqual(result, {
    ok: true, views: ["workspace", "dashboard", "inbox"], actualElectron: true,
    fixtureBackend: true, ownerBridge: false, serviceWorkers: 0,
  });
  console.log("Native Workspace actual Electron/bundled SPA/launch-cookie/preload/IPC smoke passed with fixture backend and natural Main closure. Not LAN, real Identity, DPAPI or installed-product qualification.");
} finally {
  // Failure cleanup is never accepted as natural-exit evidence. Preserve the
  // owned profile unless its exact Electron Main and stdio have closed.
  if (child && !mainClosed && child.exitCode === null && child.signalCode === null) {
    const closure = new Promise(resolve => child.once("close", () => { mainClosed = true; resolve(); }));
    child.kill();
    let timer;
    try { await Promise.race([closure, new Promise(resolve => { timer = setTimeout(resolve, 10_000); })]); }
    finally { clearTimeout(timer); }
  }
  if (!child || mainClosed) await fixture.remove();
}
