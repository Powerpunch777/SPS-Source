import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const start = main.indexOf("async function exportOwnerVaultTransfer()");
const end = main.indexOf("async function inspectOwnerVaultTransfer()", start);
assert.ok(start >= 0 && end > start);

function fixture({ owner = true, cancelled = false, backupError = null } = {}) {
  const calls = [];
  const scope = {
    mainWindow: null,
    isOwnerHostProfile: () => owner,
    currentAccountOwnsOwnerHost: () => owner,
    ownerVaultRoot: () => "fixture-vault",
    dialog: {
      showOpenDialog: async () => ({ canceled: cancelled, filePaths: cancelled ? [] : ["fixture-export"] }),
      showMessageBox: async (_window, options) => { calls.push({ type: "message", options }); },
    },
    ownerHostApi: async (route, options) => {
      calls.push({ type: "backup", route, options });
      if (backupError) throw backupError;
      return { backupFile: "fixture-vault/backups/snapshot.sql.gz" };
    },
    exportSpsOwnerVaultTransfer: async input => { calls.push({ type: "export", input }); return { bundleRoot: "fixture-export/bundle" }; },
  };
  runInNewContext(`${main.slice(start, end)}\nthis.exportTransfer = exportOwnerVaultTransfer;`, scope);
  return { calls, run: scope.exportTransfer };
}

test("Main export retains its protected backup path and warns that the exported snapshot may contain credentials", async () => {
  const ctx = fixture();
  assert.equal((await ctx.run()).bundleRoot, "fixture-export/bundle");
  assert.deepEqual(ctx.calls.map(call => call.type), ["backup", "export", "message"]);
  assert.equal(ctx.calls[0].route, "/instance/database-backups");
  assert.equal(ctx.calls[0].options.ownerBootstrap, true);
  assert.equal(ctx.calls[1].input.backupFile, "fixture-vault/backups/snapshot.sql.gz");
  const detail = ctx.calls[2].options.detail;
  assert.match(detail, /Desktop sign-in storage and separate Vault secret\/key folders are omitted/);
  assert.match(detail, /database snapshot.*can still contain sensitive settings or credentials/);
  assert.match(detail, /transfer is not encrypted by SPS/);
  assert.match(detail, /Keep this transfer private/);
  assert.match(detail, /Restore-time credential cleanup does not sanitize the exported file/);
  assert.doesNotMatch(detail, /bundle excludes account credentials and encryption keys/);
});

test("Main export cancellation does not create a backup or transfer", async () => {
  const ctx = fixture({ cancelled: true });
  assert.equal(await ctx.run(), null);
  assert.equal(ctx.calls.length, 0);
});

test("Main export refuses non-owners before touching backup data", async () => {
  const ctx = fixture({ owner: false });
  await assert.rejects(ctx.run(), /Only the signed-in SPS Owner/);
  assert.equal(ctx.calls.length, 0);
});

test("Main export backup failure cannot display a success or create a transfer", async () => {
  const ctx = fixture({ backupError: new Error("fixture backup failed") });
  await assert.rejects(ctx.run(), /fixture backup failed/);
  assert.deepEqual(ctx.calls.map(call => call.type), ["backup"]);
});
