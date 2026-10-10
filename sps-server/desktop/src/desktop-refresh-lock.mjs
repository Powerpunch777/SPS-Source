import { promises as fs } from "node:fs";
import path from "node:path";

const LOCK_FILE_NAME = "sps-identity-refresh.lock";
const LOCK_RETRY_MS = 100;
const LOCK_TIMEOUT_MS = 20_000;
const STALE_LOCK_MS = 60_000;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Refresh-token rotation is single-use. Coordinate separate SPS Desktop
// processes as well as calls within one process before exchanging it.
export async function withSpsDesktopRefreshLock({
  directory,
  action,
  fsImpl = fs,
  now = () => Date.now(),
  sleep = wait,
  retryMs = LOCK_RETRY_MS,
  timeoutMs = LOCK_TIMEOUT_MS,
  staleMs = STALE_LOCK_MS,
} = {}) {
  if (typeof directory !== "string" || !directory.trim()) {
    throw new Error("SPS Desktop could not locate its local refresh lock directory.");
  }
  if (typeof action !== "function") throw new Error("SPS Desktop refresh lock requires an action.");

  const lockPath = path.join(directory, LOCK_FILE_NAME);
  const startedAt = now();
  let handle = null;
  while (!handle) {
    try {
      handle = await fsImpl.open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n${new Date(now()).toISOString()}\n`, "utf8");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const info = await fsImpl.stat(lockPath).catch(() => null);
      if (info && now() - info.mtimeMs >= staleMs) {
        await fsImpl.rm(lockPath, { force: true }).catch(() => undefined);
        continue;
      }
      if (now() - startedAt >= timeoutMs) {
        throw new Error("SPS Desktop is already refreshing this account. Try again in a moment.");
      }
      await sleep(retryMs);
    }
  }

  try {
    return await action();
  } finally {
    await handle.close().catch(() => undefined);
    await fsImpl.rm(lockPath, { force: true }).catch(() => undefined);
  }
}
