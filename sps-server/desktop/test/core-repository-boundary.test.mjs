import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(testDirectory, "..", "..", "..");
const productDirectory = path.join(repositoryDirectory, "sps-server");
const allowedCorePackageReferences = new Set([
  "sps-room-chat/package.json",
  "sps-room-chat/package-lock.json",
  // The generated bundle carries build-path comments only; it does not load Core at runtime.
  "sps-room-chat/dist/worker.js",
]);
const corePrivatePackagePath = ["external", "sps-core", "packages"].join("/");

function trackedProductFiles() {
  return execFileSync("git", ["-C", repositoryDirectory, "ls-files", "--", "sps-server"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((trackedPath) => path.relative(productDirectory, path.join(repositoryDirectory, trackedPath)))
    .filter((relativePath) => existsSync(path.join(productDirectory, relativePath)));
}

test("pins the compatible SPS Core submodule", async () => {
  const modules = await readFile(path.join(repositoryDirectory, ".gitmodules"), "utf8");
  assert.match(modules, /path = external\/sps-core/);
  assert.match(modules, /url = https:\/\/github\.com\/Powerpunch777\/SPS-Core\.git/);
  assert.match(modules, /branch = main/);
});

test("keeps product source out of Core private implementation paths", async () => {
  const unexpected = [];
  for (const relativePath of trackedProductFiles()) {
    const normalized = relativePath.replaceAll(path.sep, "/");
    // Audit documents cite implementation paths; they are not runtime imports.
    if (normalized.endsWith(".md")) continue;
    const content = await readFile(path.join(productDirectory, relativePath), "utf8");
    if (content.includes(`${corePrivatePackagePath}/`) && !allowedCorePackageReferences.has(normalized)) {
      unexpected.push(normalized);
    }
  }
  assert.deepEqual(unexpected, []);
});

test("does not keep historic one-off workplane database repairs in product source", async () => {
  await assert.rejects(
    access(path.join(productDirectory, "scripts", "Repair-SPSWorkplaneTaskRouting.mjs")),
    /ENOENT/,
  );
});

test("uses a read-only token fallback for private Core submodule CI", async () => {
  const workflow = await readFile(path.join(repositoryDirectory, ".github", "workflows", "sps-verify.yml"), "utf8");
  assert.match(workflow, /token: \$\{\{ secrets\.SPS_SOURCE_READ_TOKEN \|\| github\.token \}\}/);
});
