import path from "node:path";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { x as extractTar } from "tar";
import { normalizeArchiveEntry, runtimeArchivePartition, RUNTIME_EXTRACTION_PARTITIONS } from "./owner-host-runtime-archive-path.mjs";

if (isMainThread || !parentPort || !workerData
  || Object.keys(workerData).sort().join(",") !== "cwd,file,partition"
  || ![workerData.cwd, workerData.file].every(value => typeof value === "string" && path.isAbsolute(value) && !value.includes("\0"))
  || !Number.isInteger(workerData.partition) || workerData.partition < 0 || workerData.partition >= RUNTIME_EXTRACTION_PARTITIONS) {
  throw new Error("Invalid SPS runtime extraction worker configuration.");
}

extractTar({
  cwd: workerData.cwd, file: workerData.file, sync: true, preservePaths: false, strict: true,
  filter: (entryPath, entry) => {
    const normalized = normalizeArchiveEntry(entryPath);
    // One reader preserves empty directories; tar also creates required parent
    // directories for each file. No reader accepts links or special entries.
    if (entry.type === "Directory") return workerData.partition === 0;
    return (entry.type === "File" || entry.type === "OldFile" || entry.type === "ContiguousFile")
      && runtimeArchivePartition(normalized) === workerData.partition;
  },
});
parentPort.postMessage({ type: "sps-runtime-extracted", partition: workerData.partition });
parentPort.close();
