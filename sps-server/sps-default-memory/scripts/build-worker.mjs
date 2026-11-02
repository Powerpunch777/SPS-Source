import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(root, "../..");
// Bundle the pinned public Worker protocol and build tool; relocated packages
// must not depend on a Core source-tree module or a runtime SDK installation.
const publicSdkRoot = path.join(repo, "external/sps-plugin-sdk");
const sdkRequire = createRequire(path.join(publicSdkRoot, "package.json"));
const { build } = sdkRequire("esbuild");
const output = path.join(root, "dist/worker.js");
const temporary = `${output}.${randomUUID()}.tmp`;
await mkdir(path.dirname(output), { recursive: true });
try {
  const result = await build({
    absWorkingDir: repo, entryPoints: [path.join(root, "src/worker.js")], outfile: output,
    bundle: true, packages: "bundle", platform: "node", format: "esm", target: "node22",
    alias: {
      "@sonparkserver/plugin-sdk/worker": path.join(publicSdkRoot, "worker/index.mjs"),
      "@sonparkserver/plugin-sdk/platform": path.join(publicSdkRoot, "platform/index.mjs"),
    },
    legalComments: "inline", logLevel: "silent", write: false,
  });
  if (result.outputFiles.length !== 1) throw new Error("Memory Worker build produced unexpected output.");
  await writeFile(temporary, result.outputFiles[0].contents, { flag: "wx" });
  await rename(temporary, output);
} finally { await rm(temporary, { force: true }); }
