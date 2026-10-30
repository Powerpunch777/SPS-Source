import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Windows runtime pack archive records the exact ZIP hash and size", {
  skip: process.platform !== "win32",
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-runtime-archive-test-"));
  try {
    const source = path.join(root, "source");
    const pack = path.join(source, "fixture", "1.0.0");
    const dist = path.join(root, "dist");
    await mkdir(pack, { recursive: true });
    await writeFile(path.join(pack, "sps-agent-runtime-pack.json"), JSON.stringify({
      id: "fixture", version: "1.0.0", commands: { fixture: "fixture.cmd" },
    }));
    await writeFile(path.join(pack, "fixture.cmd"), "@echo fixture\r\n");
    execFileSync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      fileURLToPath(new URL("../scripts/archive-agent-runtime-packs.ps1", import.meta.url)),
      "-SourceRoot", source, "-DistRoot", dist,
    // Include cold PowerShell/module startup under the parallel Windows suite.
    // Archive contents, exact byte count and hash still require full validation.
    ], { windowsHide: true, timeout: 90_000, stdio: "pipe" });
    const catalog = JSON.parse(await readFile(path.join(dist, "sps-agent-runtime-packs.json"), "utf8"));
    assert.equal(catalog.schemaVersion, 1);
    assert.equal(catalog.packs.length, 1);
    const entry = catalog.packs[0];
    assert.equal(entry.archive, "SPS-Agent-Runtime-Pack-fixture-1.0.0.zip");
    assert.deepEqual(entry.commands, ["fixture"]);
    const archive = await readFile(path.join(dist, entry.archive));
    assert.equal(entry.sizeBytes, archive.length);
    assert.equal(entry.sha256, createHash("sha256").update(archive).digest("hex"));
    assert.equal(archive.subarray(0, 2).toString(), "PK");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
