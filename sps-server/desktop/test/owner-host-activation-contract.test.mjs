import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";

async function loadPreviewRuntimeResolver({ isPackaged, materializeRuntime, materializeStableNode } = {}) {
  const source = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function resolveDesktopPluginPreviewRuntime(");
  const end = source.indexOf("\nasync function startDesktopPluginPreview(", start);
  assert.notEqual(start, -1, "preview runtime resolver exists in main.mjs");
  assert.notEqual(end, -1, "preview runtime resolver ends before the preview startup function");

  let resolvedOptions;
  const context = {
    app: {
      isPackaged,
      getPath: name => name === "userData" ? "C:\\owned-profile" : "unexpected-path",
      getVersion: () => "0.4.137",
    },
    materializeCurrentSpsOwnerHostRuntime: materializeRuntime,
    materializeStableSpsOwnerHostNode: materializeStableNode,
    path,
    __dirname: "C:\\app\\resources\\app.asar\\src",
    process: { execPath: "C:\\Electron\\electron.exe" },
    resolveSpsOwnerHostRuntime: async options => {
      resolvedOptions = options;
      return options;
    },
    spsDesktopAccessEnvironment: token => ({ SPS_DESKTOP_ACCESS_TOKEN: token }),
  };
  runInNewContext(`${source.slice(start, end)}\nglobalThis.resolvePreviewRuntime = resolveDesktopPluginPreviewRuntime;`, context);
  return {
    resolve: context.resolvePreviewRuntime,
    get resolvedOptions() { return resolvedOptions; },
  };
}

const previewFixture = () => ({
  accessToken: "fixture-access-token",
  buildId: "build-123456789",
  configPath: "C:\\owned-profile\\preview\\config.json",
  previewVault: "C:\\owned-profile\\preview\\vault",
  config: {
    database: { backup: { dir: "C:\\owned-profile\\preview\\backups" } },
    storage: { localDisk: { baseDir: "C:\\owned-profile\\preview\\storage" } },
    secrets: { localEncrypted: { keyFilePath: "C:\\owned-profile\\preview\\key" } },
  },
});

test("Owner Host creation succeeds only after activation is ready", async () => {
  const [main, renderer] = await Promise.all([
    readFile(new URL("../src/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(
    main,
    /if \(activate\) \{\s*if \(!ownerHostIsReady\(\)\) \{\s*throw new Error\(ownerHostStatus\.lastError \|\| "SPS Owner Host did not become ready\."\);\s*\}\s*await activateOwnerHostProfile\(expectedSubject, expectedRestoreGeneration\);\s*await ensureInitialOwnerHostCompany\(\);[\s\S]*?await synchronizeReadyTeamWorkplane\(\);\s*\}/,
  );
  assert.match(
    renderer,
    /\$\("#create-owner-server"\)\.addEventListener\("click", \(\) => run\(async \(\) => \{[\s\S]*?button\.disabled = true;[\s\S]*?await window\.spsDesktop\.createOwnerServer\(\);\s*setNotice\("SPS Server 준비가 완료되었습니다\."\);\s*\} finally \{\s*button\.disabled = false;/,
  );
  assert.doesNotMatch(
    renderer,
    /\$\("#create-owner-server"\)[\s\S]*?createOwnerServer\(\);\s*await window\.spsDesktop\.openWorkspace\(\);/,
  );
});

test("local Owner Host transport proof does not depend on profile activation order", async () => {
  const [main, accountController] = await Promise.all([
    readFile(new URL("../src/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop-account-controller.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(
    accountController,
    /if \(\s*ownerHostStatus\.url\s*&& new URL\(hubOrigin\)\.origin === requireOwnerHostOrigin\(ownerHostStatus\.url\)\s*\) \{\s*headers\[desktopAccessHeader\] = getOwnerHostDesktopAccessToken\(\);/,
  );
  assert.doesNotMatch(
    accountController,
    /isOwnerHostProfile\(\)\s*&& ownerHostStatus\.url\s*&& new URL\(hubOrigin\)/,
  );
  assert.match(
    main,
    /headers\[SPS_DESKTOP_ACCESS_HEADER\] = ownerHostDesktopAccessToken;\s*if \(ownerBootstrap\)/,
  );
  assert.match(main, /import \{ spsRequestError, spsRequestTimeoutSignal \} from "\.\/desktop-request\.mjs";/);
  assert.match(main, /signal: spsRequestTimeoutSignal\(\)[\s\S]*?throw spsRequestError\(error, "SPS Owner Host request timed out\./);
});

test("source preview resolves the checked-out Core without materializing an Owner Host runtime", async () => {
  let materializeCalls = 0;
  const resolver = await loadPreviewRuntimeResolver({
    isPackaged: false,
    materializeRuntime: async () => {
      materializeCalls += 1;
      throw new Error("source preview must not copy the packaged runtime");
    },
    materializeStableNode: async () => { throw new Error("source preview must not materialize stable Node"); },
  });

  const options = await resolver.resolve(previewFixture());
  const developmentCoreRoot = path.resolve("C:\\app\\resources\\app.asar\\src", "..", "..", "..", "external", "sps-core");
  assert.equal(materializeCalls, 0);
  assert.deepEqual(Array.from(options.packagedRuntimeRoots), []);
  assert.deepEqual(Array.from(options.coreRoots), [developmentCoreRoot]);
  assert.equal(options.packagedNodeCommand, "C:\\Electron\\electron.exe");
  assert.equal(options.stableNodeCommand, null);
  assert.equal(resolver.resolvedOptions, options);
});

test("packaged preview uses only its materialized runtime and stable Node", async () => {
  const materializedRuntime = "C:\\owned-profile\\owner-host-runtime\\0.4.137";
  const stableNodeCommand = "C:\\owned-profile\\owner-host-node\\node.exe";
  let runtimeCalls = 0;
  let stableNodeOptions;
  const resolver = await loadPreviewRuntimeResolver({
    isPackaged: true,
    materializeRuntime: async () => { runtimeCalls += 1; return materializedRuntime; },
    materializeStableNode: async options => { stableNodeOptions = options; return stableNodeCommand; },
  });

  const options = await resolver.resolve(previewFixture());
  assert.equal(runtimeCalls, 1);
  assert.deepEqual(Array.from(options.packagedRuntimeRoots), [materializedRuntime]);
  assert.deepEqual(Array.from(options.coreRoots), []);
  assert.equal(options.stableNodeCommand, stableNodeCommand);
  assert.equal(stableNodeOptions.runtimeRoot, materializedRuntime);
  assert.equal(stableNodeOptions.stableRoot, path.join("C:\\owned-profile", "owner-host-node"));
});

test("packaged preview propagates runtime materialization failure without source fallback", async () => {
  const materializationError = new Error("packaged runtime unavailable");
  let stableNodeCalls = 0;
  const resolver = await loadPreviewRuntimeResolver({
    isPackaged: true,
    materializeRuntime: async () => { throw materializationError; },
    materializeStableNode: async () => { stableNodeCalls += 1; return "unexpected-node.exe"; },
  });

  await assert.rejects(resolver.resolve(previewFixture()), error => error === materializationError);
  assert.equal(stableNodeCalls, 0);
  assert.equal(resolver.resolvedOptions, undefined);
});
