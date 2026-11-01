import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readSpsRuntimeConfigArtifactReferences } from "../src/runtime-config-artifact-references.mjs";

const coreConfig = (root, overrides = {}) => ({
  database: {
    mode: "embedded-postgres",
    embeddedPostgresDataDir: path.join(root, "database"),
    backup: { dir: path.join(root, "backups") },
  },
  logging: { mode: "file", logDir: path.join(root, "logs") },
  storage: { provider: "local_disk", localDisk: { baseDir: path.join(root, "storage") } },
  secrets: { provider: "local_encrypted", localEncrypted: { keyFilePath: path.join(root, "secrets", "master.key") } },
  ...overrides,
});

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-runtime-config-refs-"));
  try { await run(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function writeJson(file, value, { newline = true, bom = false, crlf = false } = {}) {
  const text = `${JSON.stringify(value, null, 2)}${newline ? "\n" : ""}`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${bom ? "\uFEFF" : ""}${crlf ? text.replace(/\n/g, "\r\n") : text}`, "utf8");
}

async function linkOrSkip(t, operation) {
  try { await operation(); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP"].includes(error?.code)) {
      t.skip(`Filesystem does not permit this link fixture (${error.code}).`);
      return false;
    }
    throw error;
  }
  return true;
}

test("captures only named Core config paths and never exposes config values", async () => {
  await fixture(async root => {
    const configPath = path.join(root, "config.json");
    const secret = "test-memory-token-not-for-references";
    await writeJson(configPath, { ...coreConfig(root), security: { token: secret }, server: { url: "https://private.invalid" } });

    const captured = await readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" });
    assert.deepEqual(captured.references.map(({ ownerId, path: referencePath, kind }) => ({ ownerId, path: referencePath, kind })), [
      { ownerId: "core:config", path: configPath, kind: "file" },
      { ownerId: "core:database", path: path.join(root, "database"), kind: "directory" },
      { ownerId: "core:logs", path: path.join(root, "logs"), kind: "directory" },
      { ownerId: "core:storage", path: path.join(root, "storage"), kind: "directory" },
      { ownerId: "core:secrets", path: path.join(root, "secrets", "master.key"), kind: "file" },
      { ownerId: "core:backups", path: path.join(root, "backups"), kind: "directory" },
    ]);
    assert.ok(captured.references.every(reference => reference.source === "desktop-runtime-config" && reference.state === "retained"));
    assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.references));
    assert.ok(captured.references.every(Object.isFrozen));
    assert.equal(JSON.stringify(captured.references).includes(secret), false);
    assert.equal(JSON.stringify(captured.references).includes("private.invalid"), false);
    assert.equal(await captured.assertCurrent(), true);
  });
});

test("accepts canonical Core JSON with one BOM, CRLF, or no final newline", async () => {
  await fixture(async root => {
    for (const options of [{ bom: true, crlf: true }, { newline: false }]) {
      const configPath = path.join(root, `config-${Object.keys(options).join("-")}.json`);
      await writeJson(configPath, coreConfig(root), options);
      const captured = await readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" });
      assert.equal(captured.references.length, 6);
      assert.equal(await captured.assertCurrent(), true);
    }
  });
});

test("accepts Core configs without an optional backup directory", async () => {
  await fixture(async root => {
    const configPath = path.join(root, "config.json");
    const config = coreConfig(root);
    delete config.database.backup;
    await writeJson(configPath, config);
    const captured = await readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" });
    assert.deepEqual(captured.references.map(reference => reference.ownerId), [
      "core:config", "core:database", "core:logs", "core:storage", "core:secrets",
    ]);
  });
});

test("captures Memory defaults and each configured journal without disclosing credentials", async () => {
  await fixture(async root => {
    const configPath = path.join(root, "memory", "config.json");
    const absoluteJournal = path.join(root, "private", "absolute.jsonl");
    const config = {
      dataDir: "./data",
      journalRoot: "../journal-store",
      journals: [{ path: "journals/first.jsonl" }, { path: absoluteJournal }],
      security: { token: "memory-secret" },
      server: { url: "http://127.0.0.1:4000" },
    };
    await writeJson(configPath, config);

    const captured = await readSpsRuntimeConfigArtifactReferences({ configPath, kind: "memory" });
    assert.deepEqual(captured.references.map(({ ownerId, path: referencePath, kind }) => ({ ownerId, path: referencePath, kind })), [
      { ownerId: "memory:config", path: configPath, kind: "file" },
      { ownerId: "memory:data", path: path.join(root, "memory", "data"), kind: "directory" },
      { ownerId: "memory:journal-root", path: path.join(root, "journal-store"), kind: "directory" },
      { ownerId: "memory:journal:0", path: path.join(root, "memory", "journals", "first.jsonl"), kind: "file" },
      { ownerId: "memory:journal:1", path: absoluteJournal, kind: "file" },
    ]);
    assert.equal(JSON.stringify(captured.references).includes("memory-secret"), false);
    assert.equal(JSON.stringify(captured.references).includes("127.0.0.1"), false);
  });
});

test("uses the Memory data default and empty journal list when omitted", async () => {
  await fixture(async root => {
    const configPath = path.join(root, "memory", "config.json");
    await writeJson(configPath, {});
    const captured = await readSpsRuntimeConfigArtifactReferences({ configPath, kind: "memory" });
    assert.deepEqual(captured.references.map(reference => reference.path), [configPath, path.join(root, "memory", "data")]);
  });
});

test("assertCurrent rejects in-place edits and replacement of the config file", async () => {
  await fixture(async root => {
    const configPath = path.join(root, "config.json");
    const initial = coreConfig(root);
    await writeJson(configPath, initial);
    const edited = await readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" });
    await writeJson(configPath, coreConfig(root, { logging: { mode: "file", logDir: path.join(root, "logs-next") } }));
    await assert.rejects(edited.assertCurrent());

    await writeJson(configPath, initial);
    const replaced = await readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" });
    const replacement = `${configPath}.replacement`;
    await writeJson(replacement, initial);
    await fs.rename(replacement, configPath);
    await assert.rejects(replaced.assertCurrent());
  });
});

test("assertCurrent rejects replacement of a config ancestor", async () => {
  await fixture(async root => {
    const directory = path.join(root, "vault");
    const configPath = path.join(directory, "config.json");
    const value = coreConfig(root);
    await writeJson(configPath, value);
    const captured = await readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" });
    await fs.rename(directory, path.join(root, "vault-old"));
    await writeJson(configPath, value);
    await assert.rejects(captured.assertCurrent());
  });
});

test("rejects missing, linked, multiply-linked, or linked-parent config files", async t => {
  await fixture(async root => {
    const missing = path.join(root, "missing.json");
    await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath: missing, kind: "core" }));

    const target = path.join(root, "target.json");
    await writeJson(target, coreConfig(root));
    const symbolic = path.join(root, "symbolic.json");
    if (!await linkOrSkip(t, () => fs.symlink(target, symbolic, "file"))) return;
    await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath: symbolic, kind: "core" }));

    const hardlink = path.join(root, "hardlink.json");
    if (!await linkOrSkip(t, () => fs.link(target, hardlink))) return;
    await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath: hardlink, kind: "core" }));

    const actualParent = path.join(root, "actual-parent");
    const linkedParent = path.join(root, "linked-parent");
    await writeJson(path.join(actualParent, "config.json"), coreConfig(root));
    const type = process.platform === "win32" ? "junction" : "dir";
    if (!await linkOrSkip(t, () => fs.symlink(actualParent, linkedParent, type))) return;
    await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath: path.join(linkedParent, "config.json"), kind: "core" }));
  });
});

test("rejects oversized, malformed, noncanonical, duplicate-key, invalid UTF-8, replacement, and NUL configs", async () => {
  await fixture(async root => {
    const configPath = path.join(root, "config.json");
    const canonical = JSON.stringify(coreConfig(root), null, 2);
    const invalid = [
      `${canonical}\n `,
      canonical.replace('{\n  "database": {', '{\n  "database": {},\n  "database": {'),
      `${canonical}\u0000`,
      `${canonical}\uFFFD`,
    ];
    for (const text of invalid) {
      await fs.writeFile(configPath, text, "utf8");
      await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" }));
    }
    await fs.writeFile(configPath, Buffer.from([0x7b, 0x22, 0xff, 0x7d]));
    await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" }));
    await fs.writeFile(configPath, Buffer.alloc(128 * 1024 + 1, 0x20));
    await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath, kind: "core" }));
  });
});

test("rejects unsupported providers and invalid Core or Memory path values", async () => {
  await fixture(async root => {
    const configPath = path.join(root, "config.json");
    const invalidValues = [
      ["core", coreConfig(root, { database: { mode: "sqlite", embeddedPostgresDataDir: path.join(root, "db") } })],
      ["core", coreConfig(root, { logging: { mode: "console", logDir: path.join(root, "logs") } })],
      ["core", coreConfig(root, { storage: { provider: "remote", localDisk: { baseDir: path.join(root, "storage") } } })],
      ["core", coreConfig(root, { secrets: { provider: "remote", localEncrypted: { keyFilePath: path.join(root, "key") } } })],
      ["core", coreConfig(root, { database: { mode: "embedded-postgres", embeddedPostgresDataDir: "relative" } })],
      ["core", coreConfig(root, { database: { ...coreConfig(root).database, backup: { dir: "relative" } } })],
      ["memory", { dataDir: "~/private" }],
      ["memory", { dataDir: `bad\u0000path` }],
      ["memory", { journals: Array.from({ length: 129 }, (_, index) => ({ path: `j-${index}.jsonl` })) }],
      ["memory", { journals: [null] }],
      ["memory", { journals: [{ path: "~relative.jsonl" }] }],
    ];
    for (const [kind, value] of invalidValues) {
      await writeJson(configPath, value);
      await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath, kind }));
    }
    await writeJson(configPath, coreConfig(root));
    await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath, kind: "unknown" }));
    await assert.rejects(readSpsRuntimeConfigArtifactReferences({ configPath: "relative.json", kind: "core" }));
  });
});
