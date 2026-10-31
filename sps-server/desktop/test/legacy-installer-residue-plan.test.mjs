import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { lstat, mkdir, mkdtemp, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { captureInstallerSnapshot } from "../scripts/installer-retained-snapshot.mjs";
import { encodeLegacyProgramInventory, planLegacyInstallerResidue } from "../src/legacy-installer-residue-plan.mjs";
import { HISTORICAL_INSTALLER_BASELINE } from "../scripts/historical-installer-baseline.mjs";

const FAILURE = "Legacy installer residue cannot be safely planned.";
const identity = { dev: "1", ino: "2", birthtimeNs: "3" };
const hash = value => createHash("sha256").update(value).digest("hex");

function makeSnapshot(files, directories = [".", "resources", "resources/sps-owner-host-runtime"]) {
  const fileRecords = files.map(([name, content]) => ({ path: name, size: Buffer.byteLength(content), sha256: hash(content) }));
  const entries = [
    ...fileRecords.map(file => ({ path: file.path, type: "file", size: file.size, sha256: file.sha256 })),
    ...directories.map(name => ({ path: name, type: "directory", size: 0, sha256: "" })),
  ].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
  return {
    rootIdentity: { ...identity }, files: fileRecords,
    directories: directories.map(name => ({ path: name })),
    bytes: fileRecords.reduce((total, file) => total + file.size, 0),
    sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
}

function refreshDigest(snapshot) {
  const entries = [
    ...snapshot.files.map(file => ({ path: file.path, type: "file", size: file.size, sha256: file.sha256 })),
    ...snapshot.directories.map(directory => ({ path: directory.path, type: "directory", size: 0, sha256: "" })),
  ].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
  snapshot.sha256 = createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  return snapshot;
}

function inputFor(before, remaining, overrides = {}) {
  return {
    version: "0.4.86", automaticReplacementFailed: true, ordinaryUninstallExitCode: 0,
    registrationCount: 0, desktopProcessCount: 0, before, remaining, ...overrides,
  };
}

function assertUnsafe(input) {
  assert.throws(() => planLegacyInstallerResidue(input), error => {
    assert.equal(error.message, FAILURE);
    assert.doesNotMatch(error.message, /private|runtime|fixture|resources|[A-Za-z]:[\\/]/i);
    return true;
  });
}

test("plans a frozen allowlist for unchanged runtime residue", () => {
  const before = makeSnapshot([
    ["uninstall.exe", "old uninstaller"],
    ["resources/sps-owner-host-runtime/bin/host.js", "host runtime"],
    ["resources/sps-owner-host-runtime/config/default.json", "{}"],
  ], [".", "resources", "resources/sps-owner-host-runtime", "resources/sps-owner-host-runtime/bin", "resources/sps-owner-host-runtime/config"]);
  const remaining = makeSnapshot([
    ["resources/sps-owner-host-runtime/bin/host.js", "host runtime"],
    ["resources/sps-owner-host-runtime/config/default.json", "{}"],
  ], [".", "resources", "resources/sps-owner-host-runtime", "resources/sps-owner-host-runtime/bin", "resources/sps-owner-host-runtime/config"]);
  const beforeJson = JSON.stringify(before);
  const remainingJson = JSON.stringify(remaining);

  const plan = planLegacyInstallerResidue(inputFor(before, remaining));

  assert.deepEqual(plan, {
    schemaVersion: 1,
    sourceVersion: "0.4.86",
    beforeSha256: before.sha256,
    remainingSha256: remaining.sha256,
    rootIdentity: identity,
    files: [
      { path: "resources/sps-owner-host-runtime/bin/host.js", size: 12, sha256: hash("host runtime") },
      { path: "resources/sps-owner-host-runtime/config/default.json", size: 2, sha256: hash("{}") },
    ],
    directories: [
      "resources/sps-owner-host-runtime/bin", "resources/sps-owner-host-runtime/config",
      "resources/sps-owner-host-runtime", "resources", ".",
    ],
    bytes: 14,
    requiresUserConfirmation: true,
  });
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.rootIdentity));
  assert.ok(Object.isFrozen(plan.files));
  assert.ok(plan.files.every(Object.isFrozen));
  assert.ok(Object.isFrozen(plan.directories));
  assert.equal(JSON.stringify(before), beforeJson);
  assert.equal(JSON.stringify(remaining), remainingJson);
  assert.throws(() => { plan.files[0].path = "changed"; }, TypeError);
});

test("inventory binds the pinned old package but omits machine and fixture identity", () => {
  const captured = makeSnapshot([["resources/sps-owner-host-runtime/a.bin", "a"]]);
  const bytes = encodeLegacyProgramInventory(captured);
  const value = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(Object.keys(value), ["schemaVersion", "sourceVersion", "installerSha256", "contentSha256", "bytes", "files", "directories"]);
  assert.equal(value.installerSha256, HISTORICAL_INSTALLER_BASELINE.sha256);
  assert.equal(value.sourceVersion, HISTORICAL_INSTALLER_BASELINE.version);
  assert.equal(value.contentSha256, captured.sha256);
  assert.deepEqual(value.files, captured.files);
  assert.equal(Object.hasOwn(value, "rootIdentity"), false);
  assert.equal(bytes.toString("utf8"), `${JSON.stringify(value)}\n`);
  const changedIdentity = structuredClone(captured);
  changedIdentity.rootIdentity = { dev: "100", ino: "200", birthtimeNs: "300" };
  assert.deepEqual(encodeLegacyProgramInventory(changedIdentity), bytes);
  assert.throws(() => encodeLegacyProgramInventory({ ...captured, path: "C:\\private-machine" }), { message: FAILURE });
});

test("rejects unsafe contents, inconsistent snapshots, and every unsafe status", () => {
  const before = makeSnapshot([
    ["uninstall.exe", "installer"],
    ["resources/sps-owner-host-runtime/host.bin", "unchanged"],
    ["Documents/private.txt", "userdata"],
  ], [".", "resources", "resources/sps-owner-host-runtime", "Documents"]);
  const remaining = makeSnapshot([["resources/sps-owner-host-runtime/host.bin", "unchanged"]]);
  assert.doesNotThrow(() => planLegacyInstallerResidue(inputFor(before, remaining)));

  for (const overrides of [
    { version: "0.4.85" }, { automaticReplacementFailed: false },
    { ordinaryUninstallExitCode: 1 }, { registrationCount: 1 }, { desktopProcessCount: 1 },
  ]) assertUnsafe(inputFor(before, remaining, overrides));

  const rejectedRemaining = [
    makeSnapshot([["Documents/private.txt", "userdata"]], [".", "Documents"]),
    makeSnapshot([["resources/sps-owner-host-runtime/host.bin", "changed"]]),
    makeSnapshot([["resources/sps-owner-host-runtime/extra.bin", "extra"]]),
    makeSnapshot([]),
  ];
  for (const invalid of rejectedRemaining) assertUnsafe(inputFor(before, invalid));

  const changedRoot = structuredClone(remaining);
  changedRoot.rootIdentity.ino = "999";
  assertUnsafe(inputFor(before, changedRoot));
});

test("rejects malformed and non-canonical snapshots with one fixed error", () => {
  const validBefore = makeSnapshot([["resources/sps-owner-host-runtime/a.bin", "a"]]);
  const validRemaining = makeSnapshot([["resources/sps-owner-host-runtime/a.bin", "a"]]);
  const malformed = [];

  for (const name of ["../escape", "/absolute", "C:/absolute", "resources\\sps-owner-host-runtime\\a.bin", "resources/sps-owner-host-runtime/a:stream", "resources/sps-owner-host-runtime/A.bin",
    `resources/sps-owner-host-runtime/${"a".repeat(256)}`, `resources/sps-owner-host-runtime/${"a/".repeat(65)}a`]) {
    const snapshot = structuredClone(validRemaining);
    snapshot.files[0].path = name;
    malformed.push(refreshDigest(snapshot));
  }
  {
    const snapshot = structuredClone(validRemaining);
    snapshot.files.push({ ...snapshot.files[0] });
    malformed.push(refreshDigest(snapshot));
  }
  {
    const snapshot = structuredClone(validRemaining);
    snapshot.sha256 = "0".repeat(64);
    malformed.push(snapshot);
  }
  {
    const snapshot = structuredClone(validRemaining);
    snapshot.bytes++;
    malformed.push(snapshot);
  }
  {
    const snapshot = structuredClone(validRemaining);
    snapshot.unexpected = true;
    malformed.push(snapshot);
  }
  {
    const snapshot = structuredClone(validRemaining);
    snapshot.files[0].unexpected = true;
    malformed.push(snapshot);
  }
  for (const snapshot of malformed) assertUnsafe(inputFor(validBefore, snapshot));

  for (const unknown of [
    { ...inputFor(validBefore, validRemaining), extra: "secret-path" },
    { ...inputFor(validBefore, validRemaining), version: "0.4.86", get registrationCount() { throw new Error("secret-path"); } },
  ]) assertUnsafe(unknown);
});

test("rejects typed malformed digests and nonnumeric sizes with the fixed error", () => {
  const before = makeSnapshot([["resources/sps-owner-host-runtime/a.bin", "a"]]);
  const invalidSnapshots = [];
  for (const field of ["snapshotSha", "fileSha", "bytes", "size"]) {
    const snapshot = structuredClone(before);
    if (field === "snapshotSha") snapshot.sha256 = { value: snapshot.sha256 };
    if (field === "fileSha") snapshot.files[0].sha256 = { value: snapshot.files[0].sha256 };
    if (field === "bytes") snapshot.bytes = "1";
    if (field === "size") snapshot.files[0].size = "1";
    invalidSnapshots.push(snapshot);
  }
  for (const invalid of invalidSnapshots) assertUnsafe(inputFor(before, invalid));
});

test("accepts root identity values through 64 digits and rejects longer values", () => {
  const before = makeSnapshot([["resources/sps-owner-host-runtime/a.bin", "a"]]);
  const remaining = structuredClone(before);
  for (const key of Object.keys(identity)) {
    before.rootIdentity[key] = "7".repeat(64);
    remaining.rootIdentity[key] = "7".repeat(64);
  }
  assert.doesNotThrow(() => planLegacyInstallerResidue(inputFor(before, remaining)));

  before.rootIdentity.dev = "7".repeat(65);
  remaining.rootIdentity.dev = "7".repeat(65);
  assertUnsafe(inputFor(before, remaining));
});

test("accepts actual capture snapshots after ordinary uninstall removes the original uninstaller without mutating disk", async t => {
  const canonicalTemp = await realpath(os.tmpdir());
  const parent = await mkdtemp(path.join(canonicalTemp, "sps-legacy-residue-plan-"));
  const owned = await lstat(parent, { bigint: true });
  const root = path.join(parent, "root");
  await mkdir(path.join(root, "resources", "sps-owner-host-runtime"), { recursive: true });
  await writeFile(path.join(root, "uninstall.exe"), "historical uninstaller");
  await writeFile(path.join(root, "resources", "sps-owner-host-runtime", "host.bin"), "retained runtime");
  t.after(async () => {
    assert.equal(await realpath(parent), parent);
    const details = await lstat(parent, { bigint: true });
    assert.ok(details.isDirectory() && !details.isSymbolicLink());
    assert.equal(details.dev, owned.dev);
    assert.equal(details.ino, owned.ino);
    assert.equal(details.birthtimeNs, owned.birthtimeNs);
    await rm(parent, { recursive: true, force: true });
  });

  const before = await captureInstallerSnapshot(root);
  await unlink(path.join(root, "uninstall.exe"));
  const remaining = await captureInstallerSnapshot(root);
  const beforeJson = JSON.stringify(before);
  const remainingJson = JSON.stringify(remaining);
  const plan = planLegacyInstallerResidue(inputFor(before, remaining));
  const afterPlanning = await captureInstallerSnapshot(root);

  assert.equal(plan.files.length, 1);
  assert.equal(plan.files[0].path, "resources/sps-owner-host-runtime/host.bin");
  assert.equal(plan.remainingSha256, remaining.sha256);
  assert.deepEqual(afterPlanning, remaining);
  assert.equal(JSON.stringify(before), beforeJson);
  assert.equal(JSON.stringify(remaining), remainingJson);
});
