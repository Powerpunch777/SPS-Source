import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.join(desktopRoot, ".agent-runtime-packs");
const targetRoot = path.join(desktopRoot, "dist", "agent-runtime-packs");

await rm(targetRoot, { recursive: true, force: true });
await mkdir(path.dirname(targetRoot), { recursive: true });
await cp(sourceRoot, targetRoot, { recursive: true, dereference: true });
console.log(`Staged SPS Agent Runtime packs: ${targetRoot}`);
