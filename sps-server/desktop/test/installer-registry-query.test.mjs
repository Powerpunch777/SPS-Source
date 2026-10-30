import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseInstallerRegistrations, queryInstallerRegistrations } from "../scripts/installer-registry-query.mjs";

const unavailable = /Installer registration inspection is unavailable/;
const valid = [{ name: "SPS Desktop 東京", version: null, uninstall: "C:\\SPS\\卸载.exe", perUser: true }];

async function helperFixture(t) {
  const temporaryRoot = await realpath(os.tmpdir());
  let directory;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    directory = path.join(temporaryRoot, `sps-windows-e2e-helper-${randomBytes(16).toString("hex")}`);
    try { await mkdir(directory); break; } catch (error) {
      if (error.code !== "EEXIST" || attempt === 4) throw error;
    }
  }
  const canonical = await realpath(directory);
  assert.equal(path.dirname(canonical).toLowerCase(), temporaryRoot.toLowerCase());
  const helper = path.join(canonical, "RestrictedE2eRunner.exe");
  await writeFile(helper, "owned helper fixture");
  t.after(async () => {
    const actual = await realpath(directory);
    assert.equal(actual.toLowerCase(), canonical.toLowerCase());
    assert.equal(path.dirname(actual).toLowerCase(), temporaryRoot.toLowerCase());
    await rm(actual, { recursive: true, force: true });
  });
  return { helper, directory: canonical, temporaryRoot };
}

test("registration parser accepts only the fixed four-field record shape", () => {
  assert.deepEqual(parseInstallerRegistrations("[]"), []);
  assert.deepEqual(parseInstallerRegistrations(JSON.stringify(valid)), valid);
  assert.deepEqual(parseInstallerRegistrations(`\uFEFF${JSON.stringify(valid)}`), valid);
  assert.throws(() => parseInstallerRegistrations("{"));
  assert.throws(() => parseInstallerRegistrations(JSON.stringify({ ...valid[0] })), unavailable);
  assert.throws(() => parseInstallerRegistrations(JSON.stringify([{ ...valid[0], extra: "x" }])), unavailable);
  assert.throws(() => parseInstallerRegistrations(JSON.stringify([{ ...valid[0], name: "Other App" }])), unavailable);
  assert.throws(() => parseInstallerRegistrations(JSON.stringify([{ ...valid[0], version: 3 }])), unavailable);
  assert.throws(() => parseInstallerRegistrations(JSON.stringify([{ ...valid[0], uninstall: {} }])), unavailable);
  assert.throws(() => parseInstallerRegistrations("x".repeat(1024 * 1024 + 1)), unavailable);
});

test("query invokes only the fixed helper command with bounded, shell-free options", async t => {
  const fixture = await helperFixture(t);
  let call;
  const result = await queryInstallerRegistrations({
    ...fixture,
    execute: async (...args) => { call = args; return { stdout: JSON.stringify(valid) }; },
  });
  assert.deepEqual(result, valid);
  assert.equal(call[0], fixture.helper);
  assert.deepEqual(call[1], ["--read-installer-registry"]);
  assert.deepEqual(call[2], {
    windowsHide: true, shell: false, timeout: 30000, maxBuffer: 1024 * 1024, encoding: "utf8",
  });
});

test("missing, outside, wrong-name, and junction helpers are rejected before execution", async t => {
  const fixture = await helperFixture(t);
  let calls = 0;
  const execute = async () => { calls += 1; return { stdout: "[]" }; };
  await assert.rejects(queryInstallerRegistrations({ ...fixture, helper: null, execute }), unavailable);
  await assert.rejects(queryInstallerRegistrations({
    ...fixture, helper: path.join(fixture.temporaryRoot, "outside", "RestrictedE2eRunner.exe"), execute,
  }), unavailable);
  await assert.rejects(queryInstallerRegistrations({
    ...fixture, helper: path.join(fixture.directory, "Other.exe"), execute,
  }), unavailable);

  const target = path.join(fixture.temporaryRoot, `sps-windows-e2e-helper-${randomBytes(16).toString("hex")}`);
  const linked = path.join(fixture.temporaryRoot, `sps-windows-e2e-helper-${randomBytes(16).toString("hex")}`);
  await mkdir(target);
  t.after(async () => {
    const actualTarget = await realpath(target);
    assert.equal(path.dirname(actualTarget).toLowerCase(), fixture.temporaryRoot.toLowerCase());
    await rm(actualTarget, { recursive: true, force: true });
    await rm(linked, { force: true });
  });
  await symlink(target, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(queryInstallerRegistrations({
    ...fixture, helper: path.join(linked, "RestrictedE2eRunner.exe"), execute,
  }));
  assert.equal(calls, 0);
});

test("execution errors and helper identity changes fail instead of becoming an empty result", async t => {
  const fixture = await helperFixture(t);
  const commandError = new Error("helper command failed");
  await assert.rejects(queryInstallerRegistrations({
    ...fixture, execute: async () => { throw commandError; },
  }), error => error === commandError);

  await assert.rejects(queryInstallerRegistrations({
    ...fixture,
    execute: async helper => {
      await writeFile(helper, "replacement helper with changed identity");
      return { stdout: "[]" };
    },
  }), unavailable);
});
