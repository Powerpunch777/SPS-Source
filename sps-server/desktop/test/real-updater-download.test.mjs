import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";
import { createSpsUpdateService } from "../src/update-service.mjs";

const require = createRequire(import.meta.url);
const { NsisUpdater } = require("../node_modules/electron-updater/out/NsisUpdater.js");
const { NodeHttpExecutor } = require("../node_modules/builder-util/out/nodeHttpExecutor.js");
const { configureRequestOptions, configureRequestUrl } = require("builder-util-runtime");
const payload = Buffer.from("SPS update download fixture - not executable", "utf8");
const filename = "SPS-Desktop-Setup-0.4.138.exe";

// Based on electronHttpExecutor.ts (MIT); see fixtures/updater-transport-LICENSE.txt.
function addFileDownloadSupport(executor) {
  executor.download = (url, destination, options) => options.cancellationToken.createPromise((resolve, reject, onCancel) => {
    const requestOptions = { headers: options.headers || undefined, redirect: "manual" };
    configureRequestUrl(url, requestOptions);
    configureRequestOptions(requestOptions);
    executor.doDownload(requestOptions, {
      destination,
      options,
      onCancel,
      callback: (error) => error == null ? resolve(destination) : reject(error),
      responseHandler: null,
    }, 0);
  });
}

function sha512(bytes) {
  return createHash("sha512").update(bytes).digest("base64");
}

async function closeServer(server) {
  server.closeAllConnections();
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function createFixture({ version = "0.4.138", advertisedHash = sha512(payload) } = {}) {
  const fixture = await createWorkspaceE2eFixture();
  const root = fixture.directory;
  const userDataPath = path.join(root, "user-data");
  const baseCachePath = path.join(root, "cache");
  const appUpdateConfigPath = path.join(root, "app-update.yml");
  let updater = null;
  let service = null;

  let installerGetCount = 0;
  const server = createServer((request, response) => {
    const requestPath = new URL(request.url, "http://127.0.0.1").pathname;
    if (requestPath === "/latest.yml") {
      const metadata = [
        `version: ${version}`,
        "files:",
        `  - url: ${filename}`,
        `    sha512: ${advertisedHash}`,
        `    size: ${payload.length}`,
        `path: ${filename}`,
        `sha512: ${advertisedHash}`,
        `size: ${payload.length}`,
        "",
      ].join("\n");
      response.writeHead(200, { "content-type": "text/yaml" });
      response.end(metadata);
      return;
    }
    if (requestPath === `/${filename}`) {
      installerGetCount += 1;
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": payload.length,
      });
      response.end(payload);
      return;
    }
    response.writeHead(404);
    response.end();
  });

  try {
    await Promise.all([
      mkdir(userDataPath),
      mkdir(baseCachePath),
    ]);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const feedUrl = `http://127.0.0.1:${address.port}/`;
    await writeFile(appUpdateConfigPath, `provider: generic\nurl: ${feedUrl}\n`);

    const appAdapter = {
      version: "0.4.137",
      name: "fixture",
      isPackaged: true,
      userDataPath,
      baseCachePath,
      appUpdateConfigPath,
      whenReady: async () => {},
      quit: () => { throw new Error("download-only fixture must not quit"); },
      relaunch: () => { throw new Error("download-only fixture must not relaunch"); },
      onQuit: () => { throw new Error("download-only fixture must not register quit"); },
    };
    updater = new NsisUpdater(null, appAdapter);
    updater.httpExecutor = new NodeHttpExecutor();
    addFileDownloadSupport(updater.httpExecutor);
    updater.updateConfigPath = appUpdateConfigPath;
    updater.logger = null;
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;

    let installRequests = 0;
    service = createSpsUpdateService({
      app: { isPackaged: true, getVersion: () => "0.4.137" },
      updater,
      onInstallRequested: async () => {
        installRequests += 1;
        throw new Error("download-only fixture must not install");
      },
    });

    return {
      baseCachePath,
      close: async () => {
        service.stop();
        await closeServer(server);
        await settleDownloadPromise(updater);
        await fixture.remove();
      },
      getInstallerGetCount: () => installerGetCount,
      getInstallRequests: () => installRequests,
      service,
      updater,
    };
  } catch (error) {
    service?.stop();
    await closeServer(server);
    if (updater) await settleDownloadPromise(updater);
    await fixture.remove();
    throw error;
  }
}

async function settleDownloadPromise(updater) {
  const downloadPromise = updater.downloadPromise;
  if (!downloadPromise) return;
  let timeout;
  try {
    await Promise.race([
      Promise.resolve(downloadPromise).then(() => undefined, () => undefined),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Updater download did not settle during fixture cleanup.")), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function awaitTerminalDownload(service) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const status = service.getStatus();
    if (["ready", "error", "current"].includes(status.state)) return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Updater did not finish downloading within 10 seconds: ${service.getStatus().state}`);
}

test("NSIS provider/checksum with Node test transport downloads exact bytes for a valid hash", async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.check();
    const status = await awaitTerminalDownload(fixture.service);
    assert.equal(status.state, "ready");
    assert.equal(status.availableVersion, "0.4.138");
    assert.equal(fixture.updater.autoDownload, false);
    assert.equal(fixture.updater.autoInstallOnAppQuit, false);
    assert.equal(fixture.getInstallerGetCount(), 1);
    assert.equal(fixture.getInstallRequests(), 0);

    const downloadedPath = fixture.updater.downloadedUpdateHelper.file;
    assert.ok(downloadedPath.startsWith(fixture.baseCachePath));
    assert.deepEqual(await readFile(downloadedPath), payload);
  } finally {
    await fixture.close();
  }
});

test("NSIS provider/checksum with Node test transport rejects mismatched installer bytes", async () => {
  const fixture = await createFixture({ advertisedHash: sha512(Buffer.from("different payload")) });
  try {
    await fixture.service.check();
    const status = await awaitTerminalDownload(fixture.service);
    assert.equal(status.state, "error");
    assert.equal(fixture.getInstallerGetCount(), 1);
    assert.equal(fixture.getInstallRequests(), 0);
    assert.equal(fixture.updater.downloadedUpdateHelper?.file ?? null, null);
  } finally {
    await fixture.close();
  }
});

test("NSIS provider/checksum with Node test transport skips installer bytes for a stale release", async () => {
  const fixture = await createFixture({ version: "0.4.136" });
  try {
    await fixture.service.check();
    const status = await awaitTerminalDownload(fixture.service);
    assert.equal(status.state, "current");
    assert.equal(fixture.getInstallerGetCount(), 0);
    assert.equal(fixture.getInstallRequests(), 0);
  } finally {
    await fixture.close();
  }
});
