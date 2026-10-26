import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { workspaceE2eCleanupDisposition } from "../scripts/workspace-e2e-cleanup-contract.mjs";

const local = { delegated: false, children: 3, exited: 3, orderly: 3, outputEnded: 6,
  outputFailed: 0, finalDesktopGraceful: true, temporaryDataRemoved: true, identityClosed: true };

test("local Workspace evidence requires every Main and both output streams across restarts", () => {
  assert.deepEqual(workspaceE2eCleanupDisposition(local), { exitCode: 0, kind: "local-main-and-output-confirmed" });
  for (const change of [{ exited: 2, orderly: 2 }, { orderly: 2 }, { outputEnded: 5 }, { outputFailed: 1 },
    { finalDesktopGraceful: false }, { temporaryDataRemoved: false }, { identityClosed: false }]) {
    assert.throws(() => workspaceE2eCleanupDisposition({ ...local, ...change }), /cannot be accepted/);
  }
});

test("delegated output pipes never become a self-certified whole-Job pass", () => {
  assert.deepEqual(workspaceE2eCleanupDisposition({ ...local, delegated: true, outputEnded: 2 }),
    { exitCode: 76, kind: "owned-job-cleanup-pending" });
  for (const change of [{ orderly: 2 }, { exited: 2, orderly: 2 }, { outputFailed: 1 },
    { finalDesktopGraceful: false }, { temporaryDataRemoved: false }, { identityClosed: false }]) {
    assert.throws(() => workspaceE2eCleanupDisposition({ ...local, delegated: true, ...change }), /cannot be accepted/);
  }
});

test("malformed, incomplete and contradictory process counts fail closed", () => {
  for (const change of [{ children: 0 }, { children: Infinity }, { children: 11 }, { exited: 4 },
    { orderly: 4 }, { outputEnded: 7 }, { outputFailed: -1 }, { delegated: "true" }, { identityClosed: undefined }]) {
    assert.throws(() => workspaceE2eCleanupDisposition({ ...local, ...change }), TypeError);
  }
  assert.throws(() => workspaceE2eCleanupDisposition(), TypeError);
});

test("a standalone Workspace child with delegated evidence exits nonzero", async () => {
  const module = new URL("../scripts/workspace-e2e-cleanup-contract.mjs", import.meta.url).href;
  const source = `import { workspaceE2eCleanupDisposition } from ${JSON.stringify(module)};
    const result=workspaceE2eCleanupDisposition(${JSON.stringify({ ...local, delegated: true })});
    process.stdout.write(result.kind); process.exitCode=result.exitCode;`;
  await assert.rejects(promisify(execFile)(process.execPath, ["--input-type=module", "-e", source], {
    timeout: 5000, windowsHide: true,
  }), error => error.code === 76 && error.stdout === "owned-job-cleanup-pending");
});
