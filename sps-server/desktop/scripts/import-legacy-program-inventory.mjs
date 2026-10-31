import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { encodeLegacyProgramInventory } from "../src/legacy-installer-residue-plan.mjs";

// Build-time import of a reviewed, clean-VM, exact historical package capture.
// Never accept a live installation as a source of trusted package membership.
const expectedSha256 = "dc41392de7ff7390a396a898f352cbc6883072d5a8b5203c780294720a872322";
const expectedBytes = 5_909_697;
assert.equal(process.argv.length, 3, "Pass only the reviewed inventory input file.");
const source = process.argv[2];
const stat = await lstat(source);
assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size === expectedBytes);
const raw = await readFile(source);
assert.equal(raw.length, expectedBytes);
assert.equal(createHash("sha256").update(raw).digest("hex"), expectedSha256);
const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
const canonical = encodeLegacyProgramInventory({ rootIdentity: { dev: "0", ino: "0", birthtimeNs: "0" },
  files: value.files, directories: value.directories.map(path => ({ path })), bytes: value.bytes, sha256: value.contentSha256 });
assert.ok(canonical.equals(raw));
const packed = gzipSync(raw, { level: 9 });
const output = new URL("../assets/legacy-recovery/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("program-inventory-0.4.86.json.gz", output), packed, { flag: "wx" });
console.log(JSON.stringify({ rawBytes: raw.length, rawSha256: expectedSha256,
  gzipBytes: packed.length, gzipSha256: createHash("sha256").update(packed).digest("hex"),
  files: value.files.length, directories: value.directories.length }));
