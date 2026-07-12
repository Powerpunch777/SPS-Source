import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const manifestUrl = pathToFileURL(path.join(repoRoot, "dist", "manifest.js")).href;
const validatorUrl = pathToFileURL(
  "C:\\Users\\young\\AppData\\Local\\npm-cache\\_npx\\43414d9b790239bb\\node_modules\\@paperclipai\\shared\\dist\\validators\\plugin.js"
).href;

const [{ default: manifest }, { pluginManifestV1Schema }] = await Promise.all([
  import(manifestUrl),
  import(validatorUrl)
]);

const parsed = pluginManifestV1Schema.parse(manifest);
console.log(`Manifest OK: ${parsed.id} ${parsed.version}`);
