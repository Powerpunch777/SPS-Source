import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { encodeLegacyProgramInventory } from "../legacy-installer-residue-plan.mjs";

export const LEGACY_PROGRAM_INVENTORY = Object.freeze({
  version: "0.4.86",
  installerSha256: "d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56",
  rawBytes: 5_909_697,
  rawSha256: "dc41392de7ff7390a396a898f352cbc6883072d5a8b5203c780294720a872322",
  gzipBytes: 1_313_545,
  gzipSha256: "35834b4d078b72938ea9b2149933cd05356c6398c2ae8b873b927a781a52dfd7",
});
const asset = new URL("../../assets/legacy-recovery/program-inventory-0.4.86.json.gz", import.meta.url);
const failure = () => new Error("The pinned legacy program inventory is unavailable.");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export function decodeLegacyProgramInventory(packed) {
  try {
    const pin = LEGACY_PROGRAM_INVENTORY;
    if (!Buffer.isBuffer(packed) || packed.length !== pin.gzipBytes || hash(packed) !== pin.gzipSha256) throw failure();
    const raw = gunzipSync(packed, { maxOutputLength: pin.rawBytes });
    if (raw.length !== pin.rawBytes || hash(raw) !== pin.rawSha256) throw failure();
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (value.sourceVersion !== pin.version || value.installerSha256 !== pin.installerSha256) throw failure();
    const encoded = encodeLegacyProgramInventory({ rootIdentity: { dev: "0", ino: "0", birthtimeNs: "0" },
      files: value.files, directories: value.directories.map(path => ({ path })), bytes: value.bytes, sha256: value.contentSha256 });
    if (!encoded.equals(raw)) throw failure();
    value.files.forEach(Object.freeze);
    Object.freeze(value.files);
    Object.freeze(value.directories);
    return Object.freeze(value);
  } catch { throw failure(); }
}

export async function loadLegacyProgramInventory() {
  let handle;
  try {
    handle = await open(asset, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size !== BigInt(LEGACY_PROGRAM_INVENTORY.gzipBytes)) throw failure();
    const packed = Buffer.alloc(LEGACY_PROGRAM_INVENTORY.gzipBytes + 1);
    let length = 0;
    while (length < packed.length) {
      const { bytesRead } = await handle.read(packed, length, packed.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) if (after[key] !== before[key]) throw failure();
    return decodeLegacyProgramInventory(packed.subarray(0, length));
  } catch { throw failure(); }
  finally { await handle?.close(); }
}
