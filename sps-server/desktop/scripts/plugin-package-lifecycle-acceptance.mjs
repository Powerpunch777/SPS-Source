import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { calculateStaticCapabilitiesDigest } from "@sonparkserver/plugin-sdk/registry/static-package-manifest-v1.mjs";
import { createChecklistPackage } from "./no-ai-checklist-package.mjs";

const exec = promisify(execFile);
const desktop = path.resolve(import.meta.dirname, "..");
const cli = path.join(desktop, "node_modules/@sonparkserver/plugin-sdk/cli/sps-plugin.mjs");
const pluginKey = "local.core-package-lifecycle";
const confirmation = "Apply this exact reviewed plugin version? SPS will import its runtime only after this confirmation. It may install, update, or roll back the current plugin version.";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readOwnedHostLog(root) {
  const file = path.join(root, "owner-vault/logs/server.log");
  const canonicalRoot = await realpath(root);
  const canonicalFile = await realpath(file);
  const relative = path.relative(canonicalRoot, canonicalFile);
  assert.ok(relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  const metadata = await lstat(file);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size <= 8 * 1024 * 1024);
  const bytes = await readFile(file);
  assert.ok(bytes.length <= 8 * 1024 * 1024);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function eventually(read, accepts, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await read();
    if (accepts(value)) return value;
    await delay(150);
  }
  throw new Error(`Timed out waiting for package lifecycle ${label}: ${JSON.stringify(value)}`);
}

export async function createLifecycleRegistryFixture(root) {
  const registry = path.join(root, "signed-package-lifecycle");
  const keys = path.join(registry, "keys");
  for (const directory of [keys, path.join(registry, "artifacts"), path.join(registry, "releases")]) {
    await mkdir(directory, { recursive: true });
  }
  const command = args => exec(process.execPath, [cli, ...args], {
    cwd: desktop, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  for (const name of ["publisher", "root"]) {
    await command(["keygen", "--private", path.join(keys, `${name}.pem`), "--public", path.join(keys, `${name}.pub`)]);
  }
  const releases = [];
  const artifacts = [];
  for (const version of ["0.1.0", "0.2.0", "0.3.0"]) {
    const directory = path.join(registry, "source", version);
    const { manifest } = await createChecklistPackage(directory, {
      id: pluginKey, version, withUi: false, lifecycleProbe: true, failInitialize: version === "0.3.0",
    });
    const manifestBytes = await readFile(path.join(directory, "dist/manifest.js"));
    await writeFile(path.join(directory, "sps-plugin.json"), `${JSON.stringify({
      schemaVersion: 1, plugin: { id: pluginKey, version, apiVersion: "1" },
      runtime: { manifestEntry: "dist/manifest.js", manifestSha256: createHash("sha256").update(manifestBytes).digest("hex") },
      capabilities: manifest.capabilities, permissionsDigest: calculateStaticCapabilitiesDigest(manifest.capabilities),
    }, null, 2)}\n`, { flag: "wx" });
    const archive = path.join(registry, "artifacts", `${version}.spsplugin`);
    await command(["pack", directory, "--out", archive]);
    const release = path.join(registry, "releases", `${version}.json`);
    await command(["release", archive, "--artifact-url", `artifacts/${version}.spsplugin`,
      "--publisher-id", "core-lifecycle-fixture", "--publisher-key-id", "ed25519:core-lifecycle-fixture",
      "--private-key", path.join(keys, "publisher.pem"), "--visibility", "private", "--out", release]);
    releases.push("--release", `releases/${version}.json=${release}`);
    artifacts.push({ version, sha256: createHash("sha256").update(await readFile(archive)).digest("hex") });
  }
  await command(["registry-index", "--registry-id", "local.core-lifecycle-fixture", "--display-name", "Core lifecycle fixture",
    "--root-key-id", "ed25519:core-lifecycle-root", "--root-private-key", path.join(keys, "root.pem"),
    "--publisher-key", `ed25519:core-lifecycle-fixture=${path.join(keys, "publisher.pub")}`,
    ...releases, "--out", path.join(registry, "registry.json")]);
  return { directory: registry, artifacts };
}

// Uses the real Host Registry review UI, Core routes/DB and public SDK workers.
// All signing keys, packages, accounts and data belong to the caller's fixture.
export async function runSignedPluginLifecycleAcceptance({ cdp, company, secondCompany, api, click, openRegistry, temporaryRoot }) {
  const fixture = await createLifecycleRegistryFixture(temporaryRoot);
  const registry = await openRegistry();
  const request = (url, options) => api(cdp, url, options);
  const snapshot = plugins => plugins.map(p => ({ id: p.id, version: p.version, status: p.status })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let plugin;
  let expectedData;
  const before = await request("/api/plugins");
  assert.equal(before.some(p => p.pluginKey === pluginKey), false);
  try {
    await eventually(() => registry.evaluate("Boolean(document.querySelector('#source-form') && document.querySelector('#local-path') && window.spsRegistry)"), Boolean, "Registry renderer readiness");
    assert.equal(await registry.evaluate("window.spsRegistry.getDeveloperContext()", true), null);
    await registry.evaluate(`(() => {
      const form = document.querySelector('#source-form');
      const details = form.closest('details');
      if (details && !details.open) details.querySelector('summary').click();
      document.querySelector('#source-id').value = 'local.core-lifecycle-fixture';
      document.querySelector('#source-name').value = 'Core lifecycle fixture';
      document.querySelector('#local-path').value = ${JSON.stringify(fixture.directory)};
      form.requestSubmit();
    })()`);
    await eventually(() => registry.evaluate(`document.querySelectorAll('.stage-release[data-plugin-id="${pluginKey}"]').length`), count => count === 3, "three verified signed releases");
    assert.deepEqual(snapshot(await request("/api/plugins")), snapshot(before), "Inspecting signed releases changed Core lifecycle state");

    async function apply(version, { failure = false } = {}) {
      console.log(`[package-lifecycle] staging and explicitly applying ${version}`);
      await click(registry, `.stage-release[data-plugin-id="${pluginKey}"][data-version="${version}"]`, `Stage lifecycle ${version}`);
      const stages = await eventually(() => registry.evaluate("window.spsRegistry.listStages()", true),
        rows => rows.some(row => row.pluginId === pluginKey && row.version === version), `staged ${version}`);
      const stage = stages.find(row => row.pluginId === pluginKey && row.version === version);
      assert.equal(stage.artifactSha256, fixture.artifacts.find(item => item.version === version).sha256);
      assert.equal(stage.status, "staged");
      registry.expectConfirmation(confirmation);
      await click(registry, `.enable-stage[data-stage-id="${stage.stageId}"]`, `Apply reviewed lifecycle ${version}`);
      await eventually(() => registry.evaluate(`({ text: document.querySelector('#notice')?.textContent ?? '', error: document.querySelector('#notice')?.classList.contains('error') === true })`),
        notice => failure ? notice.error && notice.text === "Could not apply this package. Check the review queue and try again."
          : !notice.error && notice.text === `${pluginKey} v${version} is ready.`, `review result ${version}`);
      registry.assertConfirmationHandled();
    }
    const getPlugin = async () => (await request("/api/plugins")).find(p => p.pluginKey === pluginKey);
    const read = (key, companyId = company.id) => request(`/api/plugins/${plugin.id}/data/${key}`, { method: "POST", body: { companyId } }).then(result => result.data);
    const ready = version => eventually(getPlugin, value => value?.status === "ready" && value.version === version, `ready ${version}`);
    const assertDataAndVersion = async version => {
      assert.deepEqual(await read("package-version"), { version });
      assert.deepEqual(await read("checklist"), expectedData);
      assert.deepEqual((await read("checklist", secondCompany.id)).items, []);
    };

    await apply("0.1.0");
    plugin = await ready("0.1.0");
    for (const workspace of [company, secondCompany]) {
      await request(`/api/plugins/${plugin.id}/companies/${workspace.id}/activation`, { method: "PUT", body: { enabled: true } });
    }
    await request(`/api/plugins/${plugin.id}/actions/checklist.add`, { method: "POST", body: { companyId: company.id, params: { text: "Retain through package update and rollback" } } });
    expectedData = await eventually(() => read("checklist"), value => value.items.length === 1 && value.eventCount === 1, "seeded scoped durable state");
    await assertDataAndVersion("0.1.0");
    const originalPath = plugin.packagePath;

    await apply("0.2.0");
    const updated = await ready("0.2.0");
    assert.notEqual(updated.packagePath, originalPath, "Update did not commit its separate candidate artifact");
    await assertDataAndVersion("0.2.0");
    console.log("[package-lifecycle] signed v1 install and v2 update used real Worker and preserved Workspace A/B state");

    const logBeforeFailure = await readOwnedHostLog(temporaryRoot);
    await apply("0.3.0", { failure: true });
    const logAfterFailure = await readOwnedHostLog(temporaryRoot);
    assert.ok(logAfterFailure.startsWith(logBeforeFailure), "Owned Core log was replaced during candidate activation");
    const activationLog = logAfterFailure.slice(logBeforeFailure.length);
    assert.ok(activationLog.includes(plugin.id));
    assert.match(activationLog, /SPS lifecycle fixture initialization failure/, "Candidate failed before its intended real Worker initialization");
    const rolledBack = await ready("0.2.0");
    assert.equal(rolledBack.packagePath, updated.packagePath, "Failed initialization did not restore the previous artifact");
    await assertDataAndVersion("0.2.0");
    console.log("[package-lifecycle] actual candidate initialization failure rolled back to the working v2 package and data");

    // Re-applying an already registered exact stage is the normal Host rollback.
    const oldStage = (await registry.evaluate("window.spsRegistry.listStages()", true)).find(row => row.pluginId === pluginKey && row.version === "0.1.0");
    assert.equal(oldStage.status, "registered");
    registry.expectConfirmation(confirmation);
    await click(registry, `.enable-stage[data-stage-id="${oldStage.stageId}"]`, "Explicit reviewed rollback to v1");
    await eventually(() => registry.evaluate("document.querySelector('#notice')?.textContent"), text => text === `${pluginKey} v0.1.0 is ready.`, "explicit rollback UI result");
    registry.assertConfirmationHandled();
    await ready("0.1.0");
    await assertDataAndVersion("0.1.0");
    assert.deepEqual(snapshot((await request("/api/plugins")).filter(p => p.id !== plugin.id)), snapshot(before), "Lifecycle flow changed an unrelated package");
    console.log("[package-lifecycle] Host-confirmed exact-artifact rollback restored v1 Worker without erasing scoped state");
  } finally {
    await registry.close();
  }
  return async restarted => {
    const current = (await api(restarted, "/api/plugins")).find(p => p.id === plugin.id);
    assert.equal(current.version, "0.1.0");
    assert.equal(current.status, "ready");
    for (const [workspace, expected] of [[company, expectedData], [secondCompany, { items: [], eventCount: 0, jobCount: 0 }]]) {
      const result = await api(restarted, `/api/plugins/${plugin.id}/data/checklist`, { method: "POST", body: { companyId: workspace.id } });
      assert.deepEqual(result.data, expected);
    }
    const version = await api(restarted, `/api/plugins/${plugin.id}/data/package-version`, { method: "POST", body: { companyId: company.id } });
    assert.deepEqual(version.data, { version: "0.1.0" });
    console.log("[package-lifecycle] real Host restart retained rolled-back version and both Workspace states; no schema downgrade claimed");
  };
}
