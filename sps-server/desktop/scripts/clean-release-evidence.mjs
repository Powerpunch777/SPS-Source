import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanObsoleteServeEvidence } from "./release-evidence-privacy.mjs";

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageManifest = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
const removed = await cleanObsoleteServeEvidence({
  distDirectory: path.join(desktopDirectory, "dist"),
  currentVersion: packageManifest.version,
  removeCurrentPublic: true,
});
process.stdout.write(`${JSON.stringify({ removed })}\n`);
