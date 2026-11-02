import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeLegacyProgramInventory, loadLegacyProgramInventory, LEGACY_PROGRAM_INVENTORY } from "../src/legacy-recovery/catalog.mjs";
import { HISTORICAL_INSTALLER_BASELINE } from "../scripts/historical-installer-baseline.mjs";

test("reviewed historical inventory is pinned, canonical and machine-independent", async () => {
  const catalog = await loadLegacyProgramInventory();
  assert.equal(catalog.sourceVersion, HISTORICAL_INSTALLER_BASELINE.version);
  assert.equal(catalog.installerSha256, HISTORICAL_INSTALLER_BASELINE.sha256);
  assert.equal(LEGACY_PROGRAM_INVENTORY.installerSha256, HISTORICAL_INSTALLER_BASELINE.sha256);
  assert.equal(catalog.files.length, 29314);
  assert.equal(catalog.directories.length, 3051);
  assert.equal(catalog.files.filter(file => file.path.startsWith("resources/sps-owner-host-runtime/")).length, 29237);
  assert.deepEqual(Object.keys(catalog), ["schemaVersion", "sourceVersion", "installerSha256", "contentSha256", "bytes", "files", "directories"]);
  assert.ok(Object.isFrozen(catalog) && Object.isFrozen(catalog.files) && Object.isFrozen(catalog.directories));
  assert.ok(catalog.files.every(Object.isFrozen));
  assert.ok(catalog.files.every(file => !file.path.startsWith("/") && !/[\\:\x00]/.test(file.path)));
  assert.throws(() => { catalog.files[0].sha256 = "0".repeat(64); }, TypeError);
});

test("inventory decoding rejects wrong size, corruption, concatenation and untrusted replacements", async () => {
  const packed = await readFile(new URL("../assets/legacy-recovery/program-inventory-0.4.86.json.gz", import.meta.url));
  const changed = Buffer.from(packed);
  changed[Math.floor(changed.length / 2)] ^= 1;
  for (const invalid of [null, {}, new Uint8Array(packed), packed.subarray(1), Buffer.concat([packed, Buffer.from([0])]),
    changed, Buffer.alloc(packed.length), Buffer.from("C:\\private-machine@example.invalid")]) {
    assert.throws(() => decodeLegacyProgramInventory(invalid), {
      message: "The pinned legacy program inventory is unavailable.",
    });
  }
  assert.equal(decodeLegacyProgramInventory(packed).files.length, 29314);
});
