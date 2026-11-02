import path from "node:path";
import { Worker } from "node:worker_threads";
import { x as extractTar } from "tar";
import { RUNTIME_EXTRACTION_PARTITIONS } from "./owner-host-runtime-archive-path.mjs";

const workerUrl = new URL("./owner-host-runtime-extract-worker.mjs", import.meta.url);
const failure = () => new Error("SPS Owner Host runtime archive extraction failed.");

export async function extractSpsOwnerRuntimeArchive(options, internal = {}) {
  if ((internal.platform ?? process.platform) !== "win32") return extractTar(options);
  if (!options || ![options.file, options.cwd].every(value => typeof value === "string" && path.isAbsolute(value) && !value.includes("\0"))
    || options.preservePaths !== undefined && options.preservePaths !== false
    || options.strict !== undefined && options.strict !== true) throw failure();

  const workers = [];
  const createWorker = internal.createWorker ?? (data => new Worker(workerUrl, {
    workerData: data, execArgv: [], env: {}, stdout: true, stderr: true,
  }));
  try {
    await Promise.all(Array.from({ length: RUNTIME_EXTRACTION_PARTITIONS }, (_, partition) => new Promise((resolve, reject) => {
      const worker = createWorker({ cwd: options.cwd, file: options.file, partition });
      workers.push(worker);
      let complete = false;
      let outputBytes = 0;
      const observeOutput = chunk => { outputBytes += chunk.length; if (outputBytes > 32_768) reject(failure()); };
      worker.stdout?.on("data", observeOutput);
      worker.stderr?.on("data", observeOutput);
      worker.on("error", () => reject(failure()));
      worker.on("messageerror", () => reject(failure()));
      worker.on("message", value => {
        if (complete || !value || typeof value !== "object" || Array.isArray(value)
          || Object.keys(value).sort().join(",") !== "partition,type"
          || value.type !== "sps-runtime-extracted" || value.partition !== partition) {
          reject(failure());
        } else { complete = true; }
      });
      // A completion message is not termination evidence. All threads must exit
      // successfully before verification/promotion or failure cleanup proceeds.
      worker.on("exit", code => complete && code === 0 ? resolve() : reject(failure()));
    })));
  } catch {
    const results = await Promise.allSettled(workers.map(worker => Promise.resolve().then(() => worker.terminate())));
    const error = failure();
    if (results.some(result => result.status !== "fulfilled")) error.runtimeStagingCleanupUnconfirmed = true;
    throw error;
  }
}
