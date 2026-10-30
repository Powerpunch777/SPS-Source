import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

export function canonicalNativeSmokeDirectorySync(directory) {
  const resolved = path.resolve(directory);
  for (let current = resolved;; current = path.dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Native identity smoke refuses linked or non-directory paths.");
    }
    if (path.dirname(current) === current) break;
  }
  return realpathSync.native(resolved);
}
