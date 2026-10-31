import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const HISTORICAL_CORE_SCHEMA_BASELINE = Object.freeze({
  coreCommit: "95665eb49996cd0e9c13e2da817326dfffe0f2a3",
  entries: 157,
  journalSha256: "b4f499190694a372442c8ff3c86e78adabafa733e67b7799ebe0db8d9ad4ab0b",
  sqlSha256: "b89987692343bdea3ab476ea2298782836916b0675c33bf583270abd61f9838f",
});

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function requirePlainDirectory(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Historical core schema input directory is not plain.");
}

async function readPlainFile(file, readSource) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Historical core schema input file is not plain.");
  if (info.size > MAX_FILE_BYTES) throw new Error("Historical core schema input file exceeds its size limit.");
  const value = await readSource(file);
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (bytes.length > MAX_FILE_BYTES) throw new Error("Historical core schema input file exceeds its size limit.");
  return { bytes, text: UTF8.decode(bytes) };
}

export async function verifyHistoricalCoreSchema(coreRoot, { readSource = readFile } = {}) {
  if (typeof coreRoot !== "string" || typeof readSource !== "function") throw new TypeError("Invalid historical core schema source.");
  const db = path.join(coreRoot, "packages", "db");
  const migrationsFolder = path.join(db, "src", "migrations");
  const metaFolder = path.join(migrationsFolder, "meta");
  for (const directory of [coreRoot, path.join(coreRoot, "packages"), db,
    path.join(db, "src"), migrationsFolder, metaFolder]) {
    await requirePlainDirectory(directory);
  }

  const journalPath = path.join(metaFolder, "_journal.json");
  const journalFile = await readPlainFile(journalPath, readSource);
  let current;
  try {
    current = JSON.parse(journalFile.text);
  } catch {
    throw new Error("Historical core schema journal is invalid JSON.");
  }
  if (current.version !== "7" || current.dialect !== "postgresql"
    || !Array.isArray(current.entries) || current.entries.length < HISTORICAL_CORE_SCHEMA_BASELINE.entries) {
    throw new Error("Historical core schema journal does not contain the pinned prefix.");
  }

  const entries = current.entries.slice(0, HISTORICAL_CORE_SCHEMA_BASELINE.entries);
  const journal = `${JSON.stringify({ version: "7", dialect: "postgresql", entries }, null, 2)}\n`;
  const journalSha256 = sha256(journal);
  if (journalSha256 !== HISTORICAL_CORE_SCHEMA_BASELINE.journalSha256) {
    throw new Error("Historical core schema journal SHA-256 does not match its pin.");
  }

  const sqlHash = createHash("sha256");
  const sqlFiles = [];
  let totalBytes = journalFile.bytes.length;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || !Number.isSafeInteger(entry.idx) || entry.idx < 0
      || typeof entry.tag !== "string" || !/^[A-Za-z0-9_-]+$/.test(entry.tag)) {
      throw new Error("Historical core schema journal entry is invalid.");
    }
    const filename = `${entry.tag}.sql`;
    const source = await readPlainFile(path.join(migrationsFolder, filename), readSource);
    totalBytes += source.bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Historical core schema input exceeds its total size limit.");
    const text = source.text.replace(/\r\n/g, "\n");
    const textSha256 = sha256(text);
    sqlHash.update(`${filename}\0${textSha256}\n`);
    sqlFiles.push({ filename, text });
  }

  const sqlSha256 = sqlHash.digest("hex");
  if (sqlSha256 !== HISTORICAL_CORE_SCHEMA_BASELINE.sqlSha256) {
    throw new Error("Historical core schema SQL SHA-256 does not match its pin.");
  }
  return { entries: 157, journal, journalSha256, sqlFiles, sqlSha256 };
}

export async function stageHistoricalCoreSchema({ coreRoot, fixture, readSource = readFile } = {}) {
  if (!fixture || typeof fixture.directory !== "string" || typeof fixture.assertCurrent !== "function") {
    throw new TypeError("A workspace E2E fixture is required.");
  }

  await fixture.assertCurrent();
  const verified = await verifyHistoricalCoreSchema(coreRoot, { readSource });
  await fixture.assertCurrent();
  const migrationsFolder = path.join(fixture.directory, "historical-migrations");
  const metaFolder = path.join(migrationsFolder, "meta");
  await fixture.assertCurrent();
  await mkdir(migrationsFolder);
  await fixture.assertCurrent();
  await mkdir(metaFolder);
  await fixture.assertCurrent();
  for (const file of verified.sqlFiles) {
    await fixture.assertCurrent();
    await writeFile(path.join(migrationsFolder, file.filename), file.text, { flag: "wx" });
    await fixture.assertCurrent();
  }
  await fixture.assertCurrent();
  await writeFile(path.join(metaFolder, "_journal.json"), verified.journal, { flag: "wx" });
  await fixture.assertCurrent();
  return {
    migrationsFolder,
    entries: verified.entries,
    journalSha256: verified.journalSha256,
    sqlSha256: verified.sqlSha256,
  };
}
