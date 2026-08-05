import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyServeEvidenceDirectoryPrivacy } from "./release-evidence-privacy.mjs";

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageManifest = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
const errors = await verifyServeEvidenceDirectoryPrivacy({
  distDirectory: path.join(desktopDirectory, "dist"),
  currentVersion: packageManifest.version,
});
if (errors.length > 0) throw new Error(`SPS release evidence privacy gate failed:\n${errors.join("\n")}`);
process.stdout.write(`${JSON.stringify({ privacyGate: "passed", candidate: packageManifest.version })}\n`);
