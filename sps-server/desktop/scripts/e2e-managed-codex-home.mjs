import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Resolve a managed Agent home and prove its filesystem target stays inside isolated userData. */
export async function resolveIsolatedE2eManagedCodexHomeRelative(userDataDirectory, managedHome) {
  if (typeof userDataDirectory !== "string" || !userDataDirectory || typeof managedHome !== "string"
    || !managedHome || !path.isAbsolute(userDataDirectory) || !path.isAbsolute(managedHome)) {
    throw new Error("Managed Codex home must stay in the isolated test userData.");
  }
  let root, candidate, suffix = [];
  try {
    root = await realpath(userDataDirectory);
    if (!(await stat(root)).isDirectory()) throw new Error();
    candidate = path.resolve(managedHome);
    while (true) {
      try {
        const existing = await realpath(candidate);
        if (!(await stat(existing)).isDirectory()) throw new Error("Managed home ancestor is not a directory.");
        candidate = path.resolve(existing, ...suffix);
        break;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        // An absent leaf may be created later; an unresolved existing link
        // cannot prove that its filesystem target stays inside the fixture.
        try { await lstat(candidate); throw new Error("Unresolved managed home link."); }
        catch (inspectionError) { if (inspectionError?.code !== "ENOENT") throw inspectionError; }
        const parent = path.dirname(candidate);
        if (parent === candidate) throw new Error();
        suffix.unshift(path.basename(candidate));
        candidate = parent;
      }
    }
  } catch {
    throw new Error("Managed Codex home must resolve inside the isolated test userData.");
  }
  const relative = path.relative(root, candidate);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Managed Codex home must stay in the isolated test userData.");
  }
  return relative;
}
