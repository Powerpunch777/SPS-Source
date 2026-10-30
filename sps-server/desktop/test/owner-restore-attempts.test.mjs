import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  normalizeSpsOwnerRestoreAttempts,
  ownerRestoreAttemptsForAccount,
  resolveSpsOwnerRestoreAttemptDirectory,
} from "../src/owner-restore-attempts.mjs";
import { writeSpsOwnerVaultRestoreReceipt } from "../src/owner-vault-restore-receipt.mjs";

async function withFixture(t, run) {
  const parent = await fs.realpath(os.tmpdir());
  const created = await fs.mkdtemp(path.join(parent, "sps-owner-restore-attempts-"));
  const root = await fs.realpath(created);
  const identity = await fs.lstat(root, { bigint: true });
  try {
    await run(root);
  } finally {
    const actualRoot = await fs.realpath(root);
    assert.equal(path.dirname(actualRoot), parent, "fixture must remain a direct child of the canonical OS temp directory");
    assert.match(path.basename(actualRoot), /^sps-owner-restore-attempts-/);
    const current = await fs.lstat(actualRoot, { bigint: true });
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true, "fixture root must remain a plain directory");
    assert.equal(current.dev, identity.dev);
    assert.equal(current.ino, identity.ino);
    await fs.rm(actualRoot, { recursive: true, force: true });
  }
}

function record(id = randomUUID(), ownerSubject = "owner-A", createdAt = "2026-10-30T12:00:00.000Z") {
  return { id, ownerSubject, createdAt };
}

test("normalizes restore attempts and exposes only IDs and dates for the matching account", () => {
  const first = record("11111111-1111-4111-8111-111111111111");
  const second = record("22222222-2222-4222-8222-222222222222", "owner-B", "2026-10-29T12:00:00.000Z");
  const normalized = normalizeSpsOwnerRestoreAttempts([first, second]);

  assert.deepEqual(normalized, [first, second]);
  assert.deepEqual(normalizeSpsOwnerRestoreAttempts(normalized), normalized, "a normalized copy remains valid on the next read");
  assert.notEqual(normalized[0], first);
  assert.deepEqual(ownerRestoreAttemptsForAccount(normalized, "owner-A"), [
    { id: first.id, createdAt: first.createdAt },
  ]);
  assert.deepEqual(ownerRestoreAttemptsForAccount(normalized, "owner-B"), [
    { id: second.id, createdAt: second.createdAt },
  ]);
  assert.deepEqual(ownerRestoreAttemptsForAccount(undefined, "owner-A"), []);
  assert.deepEqual(normalizeSpsOwnerRestoreAttempts(undefined), []);
});

test("rejects malformed, duplicate, unknown, traversal, and oversized restore attempt lists", () => {
  const valid = record("33333333-3333-4333-8333-333333333333");
  const cases = [
    null,
    [null],
    [{ ...valid, id: "../outside" }],
    [{ ...valid, ownerSubject: " owner-A" }],
    [{ ...valid, createdAt: "not-a-date" }],
    [{ ...valid, unexpected: "path" }],
    [valid, { ...valid }],
    Array.from({ length: 129 }, (_, index) => record(
      `${String(index + 1).padStart(8, "0")}-4444-4444-8444-444444444444`,
    )),
  ];
  for (const value of cases) {
    assert.throws(() => normalizeSpsOwnerRestoreAttempts(value), /SPS preserved restore records/);
  }
});

test("derives only the fixed per-attempt directory beneath the supplied user data root", async t => {
  await withFixture(t, async root => {
    const id = "44444444-4444-4444-8444-444444444444";
    const expected = path.join(root, `owner-vault.restore-${id}`);
    await fs.mkdir(expected);
    await fs.writeFile(path.join(expected, "marker.txt"), "retained", "utf8");

    assert.equal(await resolveSpsOwnerRestoreAttemptDirectory({ userDataPath: root, id }), await fs.realpath(expected));
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath: root, id: "../../outside" }),
      /Invalid SPS restore record/,
    );
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath: root, id: "owner-vault.restore-44444444-4444-4444-8444-444444444444" }),
      /Invalid SPS restore record/,
    );
    assert.equal(await fs.readFile(path.join(expected, "marker.txt"), "utf8"), "retained");
  });
});

test("reports missing staging as retained data and leaves sibling data unchanged", async t => {
  await withFixture(t, async root => {
    const sibling = path.join(root, "keep-me.txt");
    await fs.writeFile(sibling, "preserve", "utf8");
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath: root, id: "55555555-5555-4555-8555-555555555555" }),
      /no longer in staging.*may already have been restored; no files were changed/i,
    );
    assert.equal(await fs.readFile(sibling, "utf8"), "preserve");
  });
});

test("rejects linked roots and linked attempt directories without changing their targets", async t => {
  await withFixture(t, async root => {
    const id = "66666666-6666-4666-8666-666666666666";
    const realRoot = path.join(root, "real-user-data");
    await fs.mkdir(realRoot);
    const rootTarget = path.join(root, "root-target");
    await fs.mkdir(rootTarget);
    const rootMarker = path.join(rootTarget, "marker.txt");
    await fs.writeFile(rootMarker, "root-target", "utf8");
    const linkedRoot = path.join(root, "linked-user-data");
    const linkType = process.platform === "win32" ? "junction" : "dir";
    try {
      await fs.symlink(rootTarget, linkedRoot, linkType);
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error?.code)) {
        t.skip(`Directory symlink/junction creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    const rootAttempt = path.join(rootTarget, `owner-vault.restore-${id}`);
    await fs.mkdir(rootAttempt);
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath: linkedRoot, id }),
      /linked or replaced directory/,
    );

    const leafTarget = path.join(realRoot, "leaf-target");
    await fs.mkdir(leafTarget);
    const leafMarker = path.join(leafTarget, "marker.txt");
    await fs.writeFile(leafMarker, "leaf-target", "utf8");
    const linkedLeaf = path.join(realRoot, `owner-vault.restore-${id}`);
    try {
      await fs.symlink(leafTarget, linkedLeaf, linkType);
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error?.code)) {
        assert.equal(await fs.readFile(rootMarker, "utf8"), "root-target");
        t.skip(`Attempt-directory symlink/junction creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath: realRoot, id }),
      /linked or replaced directory/,
    );
    assert.equal(await fs.readFile(rootMarker, "utf8"), "root-target");
    assert.equal(await fs.readFile(leafMarker, "utf8"), "leaf-target");
  });
});

test("rejects a hard-linked file where a restore directory is expected and preserves both names", async t => {
  await withFixture(t, async root => {
    const id = "77777777-7777-4777-8777-777777777777";
    const source = path.join(root, "source.txt");
    const expected = path.join(root, `owner-vault.restore-${id}`);
    await fs.writeFile(source, "do not alter", "utf8");
    try {
      await fs.link(source, expected);
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error?.code)) {
        t.skip(`Hard links unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath: root, id }),
      /linked or replaced directory/,
    );
    assert.equal(await fs.readFile(source, "utf8"), "do not alter");
    assert.equal(await fs.readFile(expected, "utf8"), "do not alter");
  });
});

test("uses only a matching promoted-vault receipt when staging is absent", async t => {
  await withFixture(t, async root => {
    const userDataPath = path.join(root, "user-data");
    const promotedVaultRoot = path.join(root, "promoted-vault");
    const id = "88888888-8888-4888-8888-888888888888";
    const ownerSubject = "owner-restore-A";
    await fs.mkdir(userDataPath);
    await fs.mkdir(promotedVaultRoot);
    const marker = path.join(promotedVaultRoot, "preserved.txt");
    await fs.writeFile(marker, "vault remains intact", "utf8");
    await writeSpsOwnerVaultRestoreReceipt({ vaultRoot: promotedVaultRoot, ownerSubject, restoreId: id });
    const receiptPath = path.join(promotedVaultRoot, "sps-desktop-restore.json");
    const receiptBytes = await fs.readFile(receiptPath, "utf8");

    assert.equal(await resolveSpsOwnerRestoreAttemptDirectory({ userDataPath, id, ownerSubject, promotedVaultRoot }),
      await fs.realpath(promotedVaultRoot));
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath, id, ownerSubject: "owner-restore-B", promotedVaultRoot }),
      /no longer in staging.*may already have been restored; no files were changed/i,
    );
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath, id: "99999999-9999-4999-8999-999999999999", ownerSubject, promotedVaultRoot }),
      /no longer in staging.*may already have been restored; no files were changed/i,
    );
    assert.equal(await fs.readFile(receiptPath, "utf8"), receiptBytes);
    assert.equal(await fs.readFile(marker, "utf8"), "vault remains intact");
    await assert.rejects(fs.access(path.join(userDataPath, `owner-vault.restore-${id}`)), { code: "ENOENT" });
  });
});

test("rejects a junction used as the promoted receipt root without changing its target", async t => {
  await withFixture(t, async root => {
    const userDataPath = path.join(root, "user-data");
    const vaultTarget = path.join(root, "vault-target");
    const promotedVaultRoot = path.join(root, "vault-junction");
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const ownerSubject = "owner-restore-junction";
    await fs.mkdir(userDataPath);
    await fs.mkdir(vaultTarget);
    const marker = path.join(vaultTarget, "preserved.txt");
    await fs.writeFile(marker, "junction target remains intact", "utf8");
    await writeSpsOwnerVaultRestoreReceipt({ vaultRoot: vaultTarget, ownerSubject, restoreId: id });
    const receiptPath = path.join(vaultTarget, "sps-desktop-restore.json");
    const receiptBytes = await fs.readFile(receiptPath, "utf8");
    try {
      await fs.symlink(vaultTarget, promotedVaultRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error?.code)) {
        t.skip(`Directory junction/symlink creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    await assert.rejects(
      writeSpsOwnerVaultRestoreReceipt({ vaultRoot: promotedVaultRoot, ownerSubject, restoreId: id }),
      /linked Vault path/,
    );
    await assert.rejects(
      resolveSpsOwnerRestoreAttemptDirectory({ userDataPath, id, ownerSubject, promotedVaultRoot }),
      /linked Vault path/,
    );
    assert.equal(await fs.readFile(receiptPath, "utf8"), receiptBytes);
    assert.equal(await fs.readFile(marker, "utf8"), "junction target remains intact");
    await assert.rejects(fs.access(path.join(userDataPath, `owner-vault.restore-${id}`)), { code: "ENOENT" });
  });
});
