import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.resolve(desktopRoot, "..", "desktop-node");
const targetRoot = path.resolve(desktopRoot, "node_modules", "@sps", "desktop-node");
const nodeModulesRoot = path.resolve(desktopRoot, "node_modules");
const checkOnly = process.argv.includes("--check");

if (!checkOnly) await import("../../desktop-node/scripts/prepare-windows-job-supervisor.mjs");

if (!targetRoot.startsWith(`${nodeModulesRoot}${path.sep}`)) {
  throw new Error("Refusing to synchronize @sps/desktop-node outside this Desktop node_modules directory.");
}

async function readTree(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".DS_Store") continue;
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readTree(root, nextRelative));
    } else if (entry.isFile()) {
      const contents = await readFile(path.join(root, nextRelative));
      files.push([nextRelative.replaceAll(path.sep, "/"), createHash("sha256").update(contents).digest("hex")]);
    }
  }
  return files;
}

async function treeFingerprint(root) {
  try {
    const files = await readTree(root);
    return JSON.stringify(files.sort(([left], [right]) => left.localeCompare(right)));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

const sourceFingerprint = await treeFingerprint(sourceRoot);
if (!sourceFingerprint) throw new Error(`Missing local Desktop Node source: ${sourceRoot}`);
const targetFingerprint = await treeFingerprint(targetRoot);

if (sourceFingerprint === targetFingerprint) {
  console.log("@sps/desktop-node is synchronized with the local source.");
  process.exit(0);
}

if (checkOnly) {
  throw new Error("@sps/desktop-node is stale. Run npm run sync:desktop-node before starting, testing, or packaging SPS Desktop.");
}

await mkdir(path.dirname(targetRoot), { recursive: true });
await rm(targetRoot, { recursive: true, force: true });
await cp(sourceRoot, targetRoot, {
  recursive: true,
  filter: (entry) => !entry.endsWith(`${path.sep}node_modules`) && !entry.includes(`${path.sep}node_modules${path.sep}`),
});

if (sourceFingerprint !== await treeFingerprint(targetRoot)) {
  throw new Error("@sps/desktop-node synchronization did not produce an exact local source copy.");
}

console.log("Synchronized @sps/desktop-node from the local SPS Desktop Node source.");
