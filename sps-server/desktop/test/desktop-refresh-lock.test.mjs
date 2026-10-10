import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withSpsDesktopRefreshLock } from "../src/desktop-refresh-lock.mjs";

async function temporaryDirectory() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "sps-refresh-lock-"));
}

test("serializes concurrent SPS Desktop refreshes across processes", async () => {
  const directory = await temporaryDirectory();
  let active = 0;
  let maximumActive = 0;
  try {
    await Promise.all(Array.from({ length: 4 }, (_, index) => withSpsDesktopRefreshLock({
      directory,
      action: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        return index;
      },
    })));
    assert.equal(maximumActive, 1);
    await assert.rejects(fs.stat(path.join(directory, "sps-identity-refresh.lock")), { code: "ENOENT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("recovers a stale SPS Desktop refresh lock", async () => {
  const directory = await temporaryDirectory();
  const lockPath = path.join(directory, "sps-identity-refresh.lock");
  try {
    await fs.writeFile(lockPath, "stale", "utf8");
    const old = new Date(Date.now() - 120_000);
    await fs.utimes(lockPath, old, old);
    const result = await withSpsDesktopRefreshLock({
      directory,
      staleMs: 1_000,
      action: async () => "refreshed",
    });
    assert.equal(result, "refreshed");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
