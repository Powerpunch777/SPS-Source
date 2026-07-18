import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const adapterUtils = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".sps",
  "adapter-plugins",
  "node_modules",
  "@paperclipai",
  "adapter-utils",
  "dist",
  "server-utils.js"
);
const { runChildProcess } = await import(pathToFileURL(adapterUtils).href);

const commonOptions = {
  cwd: path.resolve(here, ".."),
  env: {},
  timeoutSec: 10,
  graceSec: 1,
  onLog: async () => {}
};

const koreanChild = [
  "const bytes = Buffer.from('\\uC548\\uB155\\uD558\\uC138\\uC694, \\uC0AC\\uC591 \\uD655\\uC778\\n', 'utf8');",
  "process.stdout.write(bytes.subarray(0, 2));",
  "setTimeout(() => process.stdout.end(bytes.subarray(2)), 20);"
].join(" ");
const koreanResult = await runChildProcess("utf8-split-test", process.execPath, ["-e", koreanChild], commonOptions);
assert.equal(koreanResult.exitCode, 0);
assert.equal(koreanResult.stdout, "\uC548\uB155\uD558\uC138\uC694, \uC0AC\uC591 \uD655\uC778\n");

const invalidChild = "process.stdout.end(Buffer.from([0xed, 0xa0, 0x80]));";
await assert.rejects(
  () => runChildProcess("utf8-invalid-test", process.execPath, ["-e", invalidChild], commonOptions),
  /Invalid UTF-8 emitted.*refused to save corrupted agent output/
);

console.log("PASS SPS adapter UTF-8 stream compatibility preserves split Korean and rejects invalid bytes");
