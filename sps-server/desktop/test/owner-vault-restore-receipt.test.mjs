import assert from "node:assert/strict";
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  readSpsOwnerVaultRestoreReceipt,
  writeSpsOwnerVaultRestoreReceipt,
} from "../src/owner-vault-restore-receipt.mjs";

const RECEIPT_NAME = "sps-desktop-restore.json";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-owner-restore-receipt-"));
  const temporaryRoot = await realpath(os.tmpdir());
  const vaultRoot = path.join(root, "vault");
  await mkdir(vaultRoot);
  t.after(async () => {
    assert.equal(path.dirname(await realpath(root)), temporaryRoot);
    await rm(root, { recursive: true, force: true });
  });
  return { root, vaultRoot };
}

function newReceipt(ownerSubject = "owner-a") {
  return { ownerSubject, restoreId: randomUUID() };
}

function receiptFile(vaultRoot) {
  return path.join(vaultRoot, RECEIPT_NAME);
}

function serializedReceipt({ ownerSubject = "owner-a", restoreId = randomUUID(), createdAt = "2026-10-30T00:00:00.000Z" } = {}) {
  return `${JSON.stringify({
    format: "sps-desktop-owner-restore",
    version: 1,
    ownerSubject,
    restoreId,
    createdAt,
  })}\n`;
}

test("restore receipt round trips, survives Vault rename, and returns null when absent", async t => {
  const f = await fixture(t);
  assert.equal(await readSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot }), null);

  const input = newReceipt();
  let guardCalls = 0;
  const written = await writeSpsOwnerVaultRestoreReceipt({
    vaultRoot: f.vaultRoot,
    ...input,
    beforeCommit() {
      guardCalls += 1;
    },
  });
  assert.equal(guardCalls, 2);
  assert.equal(written.ownerSubject, input.ownerSubject);
  assert.equal(written.restoreId, input.restoreId);
  assert.equal(Number.isFinite(Date.parse(written.createdAt)), true);
  assert.deepEqual(await readSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot }), written);

  const renamedRoot = path.join(f.root, "renamed-vault");
  await rename(f.vaultRoot, renamedRoot);
  assert.deepEqual(await readSpsOwnerVaultRestoreReceipt({ vaultRoot: renamedRoot }), written);
});

test("receipt write is create-only and EEXIST preserves the existing bytes", async t => {
  const f = await fixture(t);
  const original = await writeSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot, ...newReceipt("owner-original") });
  const before = await readFile(receiptFile(f.vaultRoot));

  await assert.rejects(
    writeSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot, ...newReceipt("owner-replacement") }),
    error => error?.code === "EEXIST",
  );

  assert.deepEqual(await readFile(receiptFile(f.vaultRoot)), before);
  assert.deepEqual(await readSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot }), original);
});

test("asynchronous pre-commit guards are rejected before a receipt file is created", async t => {
  const f = await fixture(t);
  await assert.rejects(writeSpsOwnerVaultRestoreReceipt({
    vaultRoot: f.vaultRoot,
    ...newReceipt(),
    beforeCommit: async () => {},
  }), /guards must be synchronous/i);
  await assert.rejects(lstat(receiptFile(f.vaultRoot)), error => error?.code === "ENOENT");
});

test("malformed, invalid, and oversized receipt bytes are rejected without rewriting them", async t => {
  const f = await fixture(t);
  const invalidPayloads = [
    "{not-json\n",
    serializedReceipt({ ownerSubject: "   " }),
    serializedReceipt({ restoreId: "not-a-v4-uuid" }),
    `${"x".repeat(4097)}\n`,
  ];

  for (const payload of invalidPayloads) {
    const file = receiptFile(f.vaultRoot);
    await writeFile(file, payload, { flag: "w" });
    await assert.rejects(readSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot }));
    assert.equal(await readFile(file, "utf8"), payload);
    await rm(file);
  }

  await assert.rejects(
    writeSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot, ownerSubject: " ", restoreId: randomUUID() }),
  );
  await assert.rejects(
    writeSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot, ownerSubject: "owner-a", restoreId: "invalid" }),
  );
  await assert.rejects(lstat(receiptFile(f.vaultRoot)));
});

test("receipt reader rejects non-regular and hardlinked metadata without changing the files", async t => {
  const f = await fixture(t);
  const directoryReceipt = receiptFile(f.vaultRoot);
  await mkdir(directoryReceipt);
  await assert.rejects(readSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot }), /private regular metadata file/i);
  assert.equal((await lstat(directoryReceipt)).isDirectory(), true);
  await rm(directoryReceipt, { recursive: true });

  const contents = serializedReceipt({ ownerSubject: "owner-hardlink" });
  const hardlinkReceipt = receiptFile(f.vaultRoot);
  const secondLink = path.join(f.root, "receipt-hardlink.json");
  await writeFile(hardlinkReceipt, contents);
  await link(hardlinkReceipt, secondLink);
  await assert.rejects(readSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot }), /private regular metadata file/i);
  assert.equal(await readFile(hardlinkReceipt, "utf8"), contents);
  assert.equal(await readFile(secondLink, "utf8"), contents);
});

test("receipt read and write reject a junction Vault root", async t => {
  const f = await fixture(t);
  await writeSpsOwnerVaultRestoreReceipt({ vaultRoot: f.vaultRoot, ...newReceipt() });
  const before = await readFile(receiptFile(f.vaultRoot));
  const junctionRoot = path.join(f.root, "vault-junction");
  try {
    await symlink(f.vaultRoot, junctionRoot, "junction");
  } catch (error) {
    if (["EACCES", "EPERM", "ENOTSUP"].includes(error?.code)) {
      t.skip(`Directory junction creation is unsupported in this environment (${error.code}).`);
      return;
    }
    throw error;
  }

  await assert.rejects(readSpsOwnerVaultRestoreReceipt({ vaultRoot: junctionRoot }), /linked Vault path/i);
  await assert.rejects(
    writeSpsOwnerVaultRestoreReceipt({ vaultRoot: junctionRoot, ...newReceipt("owner-through-junction") }),
    /linked Vault path/i,
  );
  assert.deepEqual(await readFile(receiptFile(f.vaultRoot)), before);
});

test("a synchronous pre-commit guard is rechecked and failure leaves partial data in staging", async t => {
  const f = await fixture(t);
  const stagingRoot = path.join(f.root, "staging");
  const promotedRoot = path.join(f.root, "vault-promoted");
  await mkdir(stagingRoot);
  const input = newReceipt("owner-guarded");
  let calls = 0;

  await assert.rejects(writeSpsOwnerVaultRestoreReceipt({
    vaultRoot: stagingRoot,
    ...input,
    beforeCommit() {
      calls += 1;
      if (calls === 2) throw new Error("guard rejected commit");
    },
  }), /guard rejected commit/);

  assert.equal(calls, 2);
  assert.equal((await lstat(stagingRoot)).isDirectory(), true);
  assert.equal(await readSpsOwnerVaultRestoreReceipt({ vaultRoot: stagingRoot }).then(Boolean), true);
  await assert.rejects(lstat(promotedRoot), error => error?.code === "ENOENT");
});
