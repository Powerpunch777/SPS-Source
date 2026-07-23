import assert from "node:assert/strict";
import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import yazl from "yazl";
import {
  inspectPluginArchive,
  MAX_PLUGIN_ARCHIVE_ENTRIES,
} from "./archive-inspector-v1.mjs";

async function writeZip(destination, entries) {
  await new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    const output = createWriteStream(destination);
    output.once("close", resolve);
    output.once("error", reject);
    archive.outputStream.once("error", reject).pipe(output);
    for (const entry of entries) {
      archive.addBuffer(Buffer.from(entry.contents ?? "", "utf8"), entry.name, entry.options);
    }
    archive.end();
  });
}

async function makeArchive(t, entries) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-plugin-archive-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const archivePath = path.join(root, "example.spsplugin");
  await writeZip(archivePath, entries);
  return archivePath;
}

const validEntries = [
  { name: "package.json", contents: JSON.stringify({ name: "@example/weather", version: "1.2.3" }) },
  { name: "dist/index.js", contents: "export default {};" },
];

test("inspects a plugin package without executing or extracting it", async (t) => {
  const archivePath = await makeArchive(t, validEntries);
  const report = await inspectPluginArchive(archivePath);

  assert.deepEqual(report.errors, []);
  assert.equal(report.valid, true);
  assert.deepEqual(report.package, { name: "@example/weather", version: "1.2.3" });
  assert.equal(report.archive.entryCount, 2);
});

test("rejects case-colliding archive paths", async (t) => {
  const archivePath = await makeArchive(t, [
    ...validEntries,
    { name: "Package.JSON", contents: "{}" },
  ]);
  const report = await inspectPluginArchive(archivePath);

  assert.equal(report.valid, false);
  assert.ok(report.errors.some((message) => message.includes("Duplicate or case-colliding archive entry")));
});

test("rejects a package with no root package manifest", async (t) => {
  const archivePath = await makeArchive(t, [{ name: "dist/index.js", contents: "export default {};" }]);
  const report = await inspectPluginArchive(archivePath);

  assert.equal(report.valid, false);
  assert.ok(report.errors.includes("Plugin archive must contain one root package.json."));
});

test("rejects symbolic links in an archive", async (t) => {
  const archivePath = await makeArchive(t, [
    ...validEntries,
    { name: "dist/link.js", contents: "index.js", options: { mode: 0o120777 } },
  ]);
  const report = await inspectPluginArchive(archivePath);

  assert.equal(report.valid, false);
  assert.ok(report.errors.some((message) => message.includes("Symbolic links are not allowed")));
});

test("bounds archive entry counts before any install step", async (t) => {
  const entries = [...validEntries];
  for (let index = 0; index < MAX_PLUGIN_ARCHIVE_ENTRIES; index += 1) {
    entries.push({ name: `dist/generated-${index}.js`, contents: "" });
  }
  const archivePath = await makeArchive(t, entries);
  const report = await inspectPluginArchive(archivePath);

  assert.equal(report.valid, false);
  assert.ok(report.errors.some((message) => message.includes("Plugin archive exceeds")));
});
