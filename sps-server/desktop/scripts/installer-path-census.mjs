import path from "node:path";
import { lstat, readdir } from "node:fs/promises";
import { assertPlainDirectory } from "./installer-ci-safety.mjs";

const LIMITS = { maxEntries: [1, 1_000_000], maxDepth: [1, 256], timeoutMs: [1, 120_000] };
const REASONS = ["entry-limit", "depth-limit", "timeout", "link", "filesystem-error", "changed", "unsupported-entry"];
const TIMEOUT = Symbol("timeout");

export async function collectInstallerPathCensus(root, { maxEntries = 100_000, maxDepth = 64, timeoutMs = 20_000 } = {}) {
  if (!root || typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("Invalid census root.");
  for (const [key, value] of Object.entries({ maxEntries, maxDepth, timeoutMs })) {
    const [min, max] = LIMITS[key];
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError("Invalid census limit.");
  }
  const result = { files: 0, directories: 0, links: 0, hardlinkedFiles: 0,
    maxAbsolutePathLength: 0, maxRelativePathLength: 0, over259Paths: 0,
    complete: true, truncatedReason: null };
  const stop = reason => { result.complete = false; result.truncatedReason = reason; };
  const deadline = Date.now() + timeoutMs;
  const timed = async operation => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw TIMEOUT;
    let timer;
    try {
      return await Promise.race([operation(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(TIMEOUT), remaining);
      })]);
    } finally { clearTimeout(timer); }
  };
  let canonicalRoot;
  try { canonicalRoot = await timed(() => assertPlainDirectory(root)); }
  catch (error) {
    if (error === TIMEOUT) { stop("timeout"); return result; }
    throw new Error("Invalid census root.");
  }
  let visited = 0;
  const check = () => { if (Date.now() >= deadline) { stop("timeout"); return false; } return true; };
  const addPath = (absolute, relative) => {
    result.maxAbsolutePathLength = Math.max(result.maxAbsolutePathLength, absolute.length);
    result.maxRelativePathLength = Math.max(result.maxRelativePathLength, relative.length);
    if (absolute.length > 259) result.over259Paths++;
  };
  const within = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const plainAncestors = async directory => {
    const relative = path.relative(canonicalRoot, directory);
    let current = canonicalRoot;
    const components = relative ? relative.split(path.sep) : [];
    for (const component of components) {
      current = path.join(current, component);
      const info = await timed(() => lstat(current));
      if (info.isSymbolicLink()) return "link";
      if (!info.isDirectory()) return "changed";
    }
    return null;
  };
  const walk = async (directory, depth) => {
    if (!check()) return;
    let before;
    let names;
    try {
      const invalidAncestor = await plainAncestors(directory);
      if (invalidAncestor) { stop(invalidAncestor); return; }
      before = await timed(() => lstat(directory));
      if (!before.isDirectory() || before.isSymbolicLink()) { stop("changed"); return; }
      names = await timed(() => readdir(directory));
    } catch (error) { stop(error === TIMEOUT ? "timeout" : "filesystem-error"); return; }
    for (const name of names) {
      if (!check()) return;
      if (visited >= maxEntries) { stop("entry-limit"); return; }
      const child = path.resolve(directory, name);
      if (!within(canonicalRoot, child)) { stop("changed"); return; }
      const relative = path.relative(canonicalRoot, child);
      let info;
      try { info = await timed(() => lstat(child)); }
      catch (error) { stop(error === TIMEOUT ? "timeout" : "filesystem-error"); return; }
      visited++;
      addPath(child, relative);
      if (info.isSymbolicLink()) { result.links++; stop("link"); return; }
      if (info.isDirectory()) {
        result.directories++;
        if (depth >= maxDepth) { stop("depth-limit"); return; }
        await walk(child, depth + 1);
        if (!result.complete) return;
      } else if (info.isFile()) {
        result.files++;
        if (info.nlink > 1) result.hardlinkedFiles++;
      } else { stop("unsupported-entry"); return; }
    }
    try {
      const after = await timed(() => lstat(directory));
      if (after.dev !== before.dev || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs
        || after.ctimeMs !== before.ctimeMs || !after.isDirectory()) stop("changed");
    } catch (error) { stop(error === TIMEOUT ? "timeout" : "filesystem-error"); }
  };

  try {
    const rootInfo = await timed(() => lstat(canonicalRoot));
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) stop("changed");
    else { result.directories = 1; addPath(canonicalRoot, ""); await walk(canonicalRoot, 0); }
  } catch (error) { stop(error === TIMEOUT ? "timeout" : "filesystem-error"); }
  if (!result.complete && !REASONS.includes(result.truncatedReason)) result.truncatedReason = "filesystem-error";
  return result;
}
