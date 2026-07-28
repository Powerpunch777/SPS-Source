import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testRoot, "..");

test("keeps first-release Registry UI and IPC limited to Official plus local development sources", async () => {
  const [html, renderer, main] = await Promise.all([
    readFile(path.join(desktopRoot, "renderer", "registry.html"), "utf8"),
    readFile(path.join(desktopRoot, "renderer", "registry.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8"),
  ]);

  assert.match(html, /Add local development Registry/);
  assert.doesNotMatch(html, /value="git"|value="official"|remote-source-fields|source-index-url/);
  assert.doesNotMatch(renderer, /source-kind|trustedRootKeyId|trustedRootPublicKey/);
  assert.match(main, /currently accepts only Owner-selected local development Registries/);
});
