import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE,
  previewE2eCleanupDisposition } from "../scripts/preview-e2e-cleanup-contract.mjs";

const local = { delegated: false, desktopExitConfirmed: true, desktopGraceful: true,
  postgresCleanupConfirmed: true, temporaryDataRemoved: true };

test("standalone Preview qualification requires all local cleanup evidence", () => {
  assert.deepEqual(previewE2eCleanupDisposition(local), { exitCode: 0, kind: "local-cleanup-confirmed" });
  for (const key of ["desktopExitConfirmed", "desktopGraceful", "postgresCleanupConfirmed", "temporaryDataRemoved"]) {
    assert.throws(() => previewE2eCleanupDisposition({ ...local, [key]: false }), /cannot be accepted/);
  }
});

test("delegation remains nonzero and cannot hide known failed or malformed cleanup", () => {
  const pending = { ...local, delegated: true, postgresCleanupConfirmed: null };
  assert.equal(OWNED_JOB_CLEANUP_ARGUMENT, "--owned-job-cleanup-pending");
  assert.equal(OWNED_JOB_CLEANUP_PENDING_EXIT_CODE, 76);
  assert.deepEqual(previewE2eCleanupDisposition(pending), { exitCode: 76, kind: "owned-job-cleanup-pending" });
  for (const postgresCleanupConfirmed of [false, true, undefined, "unknown"]) {
    assert.throws(() => previewE2eCleanupDisposition({ ...pending, postgresCleanupConfirmed }), /Invalid/);
  }
  for (const key of ["desktopExitConfirmed", "desktopGraceful", "temporaryDataRemoved"]) {
    assert.throws(() => previewE2eCleanupDisposition({ ...pending, [key]: false }), /cannot be accepted/);
  }
  assert.throws(() => previewE2eCleanupDisposition({ ...local, postgresCleanupConfirmed: null }), /Invalid/);
});

test("a standalone process using the pending flag cannot exit successfully", async () => {
  const module = new URL("../scripts/preview-e2e-cleanup-contract.mjs", import.meta.url).href;
  const source = `import { previewE2eCleanupDisposition } from ${JSON.stringify(module)};
    const result = previewE2eCleanupDisposition({delegated:process.argv.includes('--owned-job-cleanup-pending'),
      desktopExitConfirmed:true,desktopGraceful:true,postgresCleanupConfirmed:null,temporaryDataRemoved:true});
    process.stdout.write(result.kind); process.exitCode=result.exitCode;`;
  await assert.rejects(promisify(execFile)(process.execPath, ["--input-type=module", "-e", source, "--", OWNED_JOB_CLEANUP_ARGUMENT], {
    timeout: 5000, windowsHide: true,
  }), error => error.code === 76 && error.stdout === "owned-job-cleanup-pending");
});
