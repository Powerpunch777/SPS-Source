import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createPluginTemplate,
  generatePluginSigningKeyPair,
  packagePluginDirectory,
  publishPluginToLocalRegistry,
} from "../authoring/plugin-package-v1.mjs";

const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "sps-plugin.mjs");

function runCli(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

test("inspects a source tree, package, and local Registry without running plugin code", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-plugin-cli-inspect-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDirectory = path.join(root, "source");
  const archivePath = path.join(root, "weather.spsplugin");
  const registryDirectory = path.join(root, "registry");
  await createPluginTemplate({
    directory: sourceDirectory,
    pluginId: "com.example.weather",
    packageName: "@example/weather",
    displayName: "Weather",
    version: "1.0.0",
  });
  const archive = await packagePluginDirectory({ sourceDirectory, archivePath });
  const publisher = generatePluginSigningKeyPair();
  const registryRoot = generatePluginSigningKeyPair();
  await publishPluginToLocalRegistry({
    sourceDirectory,
    registryDirectory,
    registryId: "io.sps.example",
    displayName: "Example Registry",
    publisherId: "example-studio",
    publisherKeyId: "ed25519:example-publisher",
    publisherPrivateKey: publisher.privateKey,
    registryRootKeyId: "ed25519:example-root",
    registryRootPrivateKey: registryRoot.privateKey,
  });

  for (const [target, kind] of [[sourceDirectory, "plugin-source"], [archive.archivePath, "plugin-archive"], [registryDirectory, "local-registry"]]) {
    const result = await runCli("inspect", target);
    assert.equal(result.code, 0, result.stderr);
    const inspection = JSON.parse(result.stdout);
    assert.equal(inspection.kind, kind);
    assert.equal(inspection.report.valid, true);
  }
});
