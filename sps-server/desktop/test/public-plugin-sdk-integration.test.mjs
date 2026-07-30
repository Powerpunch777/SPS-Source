import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");
const workspaceRoot = path.resolve(spsServerRoot, "..");

test("uses the pinned public SDK instead of the retired in-product plugin platform", async () => {
  const [desktopPackage, packageLock, sdkPackage, gitmodules, npmrc, stagingSource, catalogSource, smokeSource, workerHostSmokeSource] = await Promise.all([
    readFile(path.join(desktopRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(desktopRoot, "package-lock.json"), "utf8").then(JSON.parse),
    readFile(path.join(workspaceRoot, "external", "sps-plugin-sdk", "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(workspaceRoot, ".gitmodules"), "utf8"),
    readFile(path.join(desktopRoot, ".npmrc"), "utf8"),
    readFile(path.join(desktopRoot, "src", "registry-staging.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "src", "registry-source-catalog.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "scripts", "smoke-packaged-owner-host-runtime.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "scripts", "smoke-public-plugin-worker-host.mjs"), "utf8"),
  ]);

  assert.equal(desktopPackage.dependencies["@sonparkserver/plugin-sdk"], "file:../../external/sps-plugin-sdk");
  assert.equal(desktopPackage.dependencies["@sps/plugin-platform"], undefined);
  assert.match(gitmodules, /\[submodule "external\/sps-plugin-sdk"\]/);
  assert.match(gitmodules, /url = https:\/\/github\.com\/Powerpunch777\/sps-plugin-sdk\.git/);
  assert.match(npmrc, /^install-links=true$/m);
  assert.equal(packageLock.packages["node_modules/@sonparkserver/plugin-sdk"].version, sdkPackage.version);
  assert.notEqual(packageLock.packages["node_modules/@sonparkserver/plugin-sdk"].link, true);

  for (const source of [stagingSource, catalogSource, smokeSource]) {
    assert.match(source, /@sonparkserver\/plugin-sdk\//);
    assert.doesNotMatch(source, /@sps\/plugin-platform\//);
  }

  assert.match(smokeSource, /assertPublicPluginWorkerHostConformance/);
  assert.match(workerHostSmokeSource, /process\.env\.SPS_PUBLIC_PLUGIN_SDK_ROOT\s*\|\|\s*path\.join\(desktopRoot, "node_modules", "@sonparkserver", "plugin-sdk"\)/);
  assert.match(workerHostSmokeSource, /authoring\/worker-bundle-v1\.mjs/);
  assert.match(workerHostSmokeSource, /buildPluginWorker/);
  assert.match(workerHostSmokeSource, /createPluginWorkerManager/);
  assert.match(workerHostSmokeSource, /sps\.runtimes\.list/);
  assert.match(workerHostSmokeSource, /@sonparkserver\/plugin-sdk\/worker/);
  assert.doesNotMatch(workerHostSmokeSource, /from\s+["']@paperclipai\//);
});
