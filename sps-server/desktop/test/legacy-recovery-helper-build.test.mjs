import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildLegacyRecoveryHelper } from "../scripts/build-legacy-recovery-helper.mjs";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const manifestPath = new URL("../src/legacy-recovery/app.manifest", import.meta.url);

async function ownedTemp(t, prefix) {
  const parent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(parent), parent);
  const parentIdentity = await lstat(parent, { bigint: true });
  const owned = await mkdtemp(path.join(parent, prefix));
  const identity = await lstat(owned, { bigint: true });
  t.after(async () => {
    assert.equal(await assertPlainDirectory(parent), parent);
    assert.equal(await assertPlainDirectory(owned), owned);
    assert.equal(path.dirname(owned), parent);
    const nowParent = await lstat(parent, { bigint: true });
    const now = await lstat(owned, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs"]) {
      assert.equal(nowParent[key], parentIdentity[key]);
      assert.equal(now[key], identity[key]);
    }
    await rm(owned, { recursive: true, force: false });
  });
  return owned;
}

test("legacy recovery build uses only pinned Windows x64 WinForms sources and asInvoker", async () => {
  const [script, manifest] = await Promise.all([
    readFile(new URL("../scripts/build-legacy-recovery-helper.mjs", import.meta.url), "utf8"),
    readFile(manifestPath, "utf8"),
  ]);
  assert.match(script, /Framework64[\\"], "v4\.0\.30319[\\"], "csc\.exe/);
  assert.match(script, /"\/target:winexe"/);
  assert.match(script, /"\/platform:x64"/);
  assert.match(script, /"\/main:Sps\.LegacyRecovery\.LegacyRecoveryApp"/);
  assert.match(script, /shell: false, windowsHide: true/);
  assert.match(script, /60_000/);
  assert.match(script, /decodeLegacyProgramInventory\(packed\)/);
  assert.match(script, /VerifiedResidue\.cs.*PinnedProgramCatalog\.cs.*LegacyRecoverySession\.cs.*LegacyRecoveryApp\.cs/s);
  assert.match(manifest, /requestedExecutionLevel level="asInvoker" uiAccess="false"/);
});

test("import is inert and non-Windows build fails closed", async () => {
  if (process.platform !== "win32") {
    await assert.rejects(buildLegacyRecoveryHelper(path.resolve(os.tmpdir(), "unused-output")), /only be built on Windows/);
  } else {
    const { stdout, stderr } = await import("node:child_process").then(({ execFile }) => new Promise((resolve, reject) => {
      execFile(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(new URL("../scripts/build-legacy-recovery-helper.mjs", import.meta.url).href)})`],
        { windowsHide: true, timeout: 10_000 }, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }));
    }));
    assert.equal(stdout, "");
    assert.equal(stderr, "");
  }
});

test("Windows build produces a nonempty x64 GUI PE without executing the helper", { skip: process.platform !== "win32" }, async t => {
  const owned = await ownedTemp(t, "sps-legacy-recovery-build-");
  const outputDirectory = path.join(owned, "owned-output");
  await mkdir(outputDirectory);
  const output = await buildLegacyRecoveryHelper(outputDirectory);
  assert.equal(output, path.join(outputDirectory, "SpsLegacyRecovery.exe"));
  const bytes = await readFile(output);
  assert.ok(bytes.length > 0);
  assert.equal(bytes.toString("ascii", 0, 2), "MZ");
  const peOffset = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.toString("ascii", peOffset, peOffset + 4), "PE\0\0");
  assert.equal(bytes.readUInt16LE(peOffset + 4), 0x8664);
  assert.equal(bytes.readUInt16LE(peOffset + 24 + 68), 2);
  assert.ok((await readFile(new URL("../assets/legacy-recovery/program-inventory-0.4.86.json.gz", import.meta.url))).length > 0);
});

test("output directory rejects linked ancestors", { skip: process.platform !== "win32" }, async t => {
  const owned = await ownedTemp(t, "sps-legacy-recovery-links-");
  const target = path.join(owned, "target");
  const linked = path.join(owned, "linked");
  await mkdir(target);
  await symlink(target, linked, "junction");
  await assert.rejects(buildLegacyRecoveryHelper(path.join(linked, "child")), /linked or non-directory/);
});

test("output refuses to replace a pre-existing linked executable", { skip: process.platform !== "win32" }, async t => {
  const owned = await ownedTemp(t, "sps-legacy-recovery-output-link-");
  const outputDirectory = path.join(owned, "owned-output");
  await mkdir(outputDirectory);
  const sentinel = path.join(owned, "sentinel.exe");
  await writeFile(sentinel, "sentinel");
  try {
    await symlink(sentinel, path.join(outputDirectory, "SpsLegacyRecovery.exe"), "file");
  } catch (error) {
    if (["EPERM", "EACCES", "UNKNOWN"].includes(error.code)) return t.skip("Windows does not permit creating a test file symlink here.");
    throw error;
  }
  await assert.rejects(buildLegacyRecoveryHelper(outputDirectory), /Existing legacy recovery output is linked/);
});
