import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const packagedBinary = process.env.SPS_DESKTOP_E2E_BINARY?.trim();
const isPackagedCandidate = Boolean(packagedBinary);
const electronBinary = isPackagedCandidate
  ? path.resolve(packagedBinary)
  : path.join(
    desktopRoot,
    "node_modules",
    "electron",
    "dist",
    process.platform === "win32" ? "electron.exe" : "electron",
  );

if (process.platform !== "win32") {
  throw new Error("The SPS isolated Desktop smoke currently targets the Windows-first release.");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("Could not reserve an isolated Desktop debug port."));
        else resolve(port);
      });
    });
  });
}

async function waitForDesktopTarget(port, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`The isolated SPS Desktop exited before it rendered (exit ${child.exitCode}).`);
    }
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1_000),
      }).then((response) => response.json());
      const target = targets.find((entry) => entry?.type === "page" && entry?.title === "SPS Desktop");
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // Electron has not exposed its debugger endpoint yet.
    }
    await delay(250);
  }
  throw new Error("The isolated SPS Desktop did not expose its first renderer within 10 seconds.");
}

async function inspectRenderer(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
    delay(5_000).then(() => {
      throw new Error("Timed out connecting to the isolated SPS Desktop renderer.");
    }),
  ]);

  let nextId = 1;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", listener);
      reject(new Error(`Timed out calling Chrome DevTools Protocol method ${method}.`));
    }, 5_000);
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.addEventListener("message", listener);
    socket.send(JSON.stringify({ id, method, params }));
  });

  try {
    await call("Page.bringToFront");
    await delay(1_000);
    const evaluated = await call("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    const screenshotDirectory = process.env.SPS_DESKTOP_E2E_SCREENSHOT_DIR?.trim();
    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true });
      for (const [width, height] of [[1024, 720], [1280, 800], [620, 760]]) {
        await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        const check = await call("Runtime.evaluate", {
          expression: `(async () => {
            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return { loaded: [...document.fonts].some(font => font.family === 'Pretendard Variable' && font.status === 'loaded'),
              overflow: document.documentElement.scrollWidth > innerWidth,
              hiddenScreensVisible: [...document.querySelectorAll('section[hidden]')].some(section => getComputedStyle(section).display !== 'none') };
          })()`, awaitPromise: true, returnByValue: true,
        });
        assert.equal(check.exceptionDetails, undefined, "Login inspection failed in renderer");
        assert.equal(check.result?.value?.loaded, true, "Bundled login font did not load");
        assert.equal(check.result?.value?.overflow, false, "Login screen overflows horizontally");
        assert.equal(check.result?.value?.hiddenScreensVisible, false, "Hidden onboarding screen became visible");
        const screenshot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        await writeFile(path.join(screenshotDirectory, `sign-in-${width}x${height}.png`), Buffer.from(screenshot.data, "base64"));
      }
    }
    return evaluated?.result?.value ?? "";
  } finally {
    socket.close();
  }
}

async function stopChildTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  await execFileAsync("taskkill", ["/pid", String(child.pid), "/T", "/F"]).catch(() => undefined);
  await Promise.race([
    once(child, "exit").catch(() => undefined),
    delay(5_000),
  ]);
}

async function removeTemporaryUserData(directory) {
  let lastError = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

const debugPort = await findAvailablePort();
const userData = await mkdtemp(path.join(os.tmpdir(), "sps-isolated-desktop-ui-"));
const child = spawn(
  electronBinary,
  [
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    ...(isPackagedCandidate ? [] : ["."]),
  ],
  {
    cwd: isPackagedCandidate ? path.dirname(electronBinary) : desktopRoot,
    env: {
      ...process.env,
      SPS_DESKTOP_E2E: "1",
      SPS_DESKTOP_E2E_USER_DATA_DIR: userData,
      SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1",
    },
    stdio: "ignore",
  },
);

try {
  const target = await waitForDesktopTarget(debugPort, child);
  const body = await inspectRenderer(target);
  assert.match(body, /SPS에 로그인/);
  assert.match(body, /회사·Workspace·플러그인 데이터/);
  assert.match(body, /Google로 계속/);
  assert.doesNotMatch(body, /Rooms|Tasks|장기기억/);
  console.log(`Isolated ${isPackagedCandidate ? "packaged" : "source"} SPS Desktop sign-in smoke test passed.`);
} finally {
  await stopChildTree(child);
  await removeTemporaryUserData(userData);
}
