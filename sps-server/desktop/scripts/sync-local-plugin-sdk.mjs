import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const excluded = new Set(["node_modules", ".git", ".github", ".npm-cache", ".DS_Store", "package-lock.json"]);
const inside = (root, file) => { const relative = path.relative(root, file); return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); };
const exists = async file => lstat(file).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));

async function readTree(root, relative = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const next = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Local SDK files must not contain symbolic links or junctions.");
    if (entry.isDirectory()) files.push(...await readTree(root, next));
    else if (entry.isFile()) files.push([next.replaceAll(path.sep, "/"), createHash("sha256").update(await readFile(path.join(root, next))).digest("hex")]);
    else throw new Error("Local SDK must contain only regular files and directories.");
  }
  return files;
}

async function fingerprint(root) {
  return JSON.stringify((await readTree(root)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export async function synchronizeLocalPluginSdk({ desktopRoot = path.resolve(import.meta.dirname, ".."), checkOnly = false } = {}) {
  const source = path.resolve(desktopRoot, "../../external/sps-plugin-sdk");
  const modules = path.resolve(desktopRoot, "node_modules");
  const target = path.join(modules, "@sonparkserver", "plugin-sdk");
  for (const directory of [modules, path.dirname(target)]) {
    const stats = await exists(directory);
    if (stats?.isSymbolicLink()) throw new Error("Desktop SDK parent must not be a symbolic link or junction.");
    if (stats && !stats.isDirectory()) throw new Error("Desktop SDK parent must be a directory.");
  }
  const sourceStats = await exists(source);
  if (!sourceStats?.isDirectory() || sourceStats.isSymbolicLink()) throw new Error("Missing regular canonical public SDK checkout.");
  const sourcePackage = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
  if (sourcePackage.name !== "@sonparkserver/plugin-sdk") throw new Error("Unexpected canonical SDK package identity.");
  const stats = await exists(target);
  if (stats?.isSymbolicLink()) {
    if (await realpath(target) !== await realpath(source)) throw new Error("Desktop SDK link points outside the canonical checkout.");
    return { changed: false };
  }
  if (stats && !stats.isDirectory()) throw new Error("Desktop SDK target is not a directory.");
  const expected = await fingerprint(source);
  if (stats && expected === await fingerprint(target)) return { changed: false };
  if (checkOnly) throw new Error("Desktop public SDK copy is stale. Run npm run sync:plugin-sdk.");
  if (stats) {
    const installed = JSON.parse(await readFile(path.join(target, "package.json"), "utf8"));
    if (installed.name !== sourcePackage.name || JSON.stringify(installed.dependencies) !== JSON.stringify(sourcePackage.dependencies)) {
      throw new Error("Local SDK dependency graph changed. Install Desktop dependencies before synchronizing source.");
    }
  }
  await mkdir(path.dirname(target), { recursive: true });
  const realModules = await realpath(modules);
  const realParent = await realpath(path.dirname(target));
  if (!inside(realModules, realParent) || path.resolve(target) !== path.join(modules, "@sonparkserver", "plugin-sdk")) {
    throw new Error("Refusing to synchronize the SDK outside Desktop node_modules.");
  }
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true, filter: entry => !path.relative(source, entry).split(path.sep).some(segment => excluded.has(segment)) });
  if (expected !== await fingerprint(target)) throw new Error("Public SDK synchronization did not produce an exact source copy.");
  return { changed: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await synchronizeLocalPluginSdk({ checkOnly: process.argv.includes("--check") });
  console.log(result.changed ? "Synchronized the pinned public SDK source into Desktop node_modules." : "Desktop public SDK is synchronized with the pinned source.");
}
