import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

const transientFileErrors = new Set(["EACCES", "EBUSY", "EPERM", "UNKNOWN"]);

export async function retryTransientFileOperation(operation, options = {}) {
  const maxAttempts = options.maxAttempts ?? 6;
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !transientFileErrors.has(error?.code)) throw error;
      await wait(50 * attempt);
    }
  }
}

export async function writeGeneratedFileAtomic(targetPath, contents, options = {}) {
  const write = options.write ?? writeFile;
  const move = options.move ?? rename;
  const remove = options.remove ?? rm;
  const temporaryPath = options.temporaryPath
    ?? `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  const retryOptions = {
    maxAttempts: options.maxAttempts,
    wait: options.wait,
  };

  try {
    await retryTransientFileOperation(
      () => write(temporaryPath, contents, "utf8"),
      retryOptions,
    );
    await retryTransientFileOperation(
      () => move(temporaryPath, targetPath),
      retryOptions,
    );
  } finally {
    await remove(temporaryPath, { force: true }).catch(() => undefined);
  }
}
