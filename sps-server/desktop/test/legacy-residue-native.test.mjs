import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const PREFIX = "sps-legacy-native-";
const PAYLOAD = "approved legacy residue fixture\n";
const FIXTURE = fileURLToPath(new URL("../scripts/windows-e2e/LegacyResidueFixture.cs", import.meta.url));
const ENGINE = fileURLToPath(new URL("../src/legacy-recovery/VerifiedResidue.cs", import.meta.url));
const CASES = ["valid", "decline", "throw-confirm", "unexpected", "changed", "wrong-digest",
  "root-replaced", "locks", "long-path", "hardlink", "ads", "junction", "insert-during-confirm",
  "preexisting-writer", "confirm-write-denied", "root-ads", "readonly", "root-junction", "protected-root"];

function identity(directory) {
  const canonical = realpathSync.native(directory);
  const stat = lstatSync(canonical, { bigint: true });
  return { canonical, dev: stat.dev, ino: stat.ino, birthtimeNs: stat.birthtimeNs };
}

function assertNoLinkedAncestors(target) {
  const canonical = realpathSync.native(target);
  let current = path.parse(canonical).root;
  for (const part of canonical.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const item = lstatSync(current, { bigint: true });
    assert.equal(item.isSymbolicLink(), false);
    assert.equal(item.isDirectory(), true);
    assert.equal(realpathSync.native(current), current);
  }
  return canonical;
}

function createOwnedTemp(t) {
  const temp = assertNoLinkedAncestors(os.tmpdir());
  const created = mkdtempSync(path.join(temp, PREFIX));
  const canonical = assertNoLinkedAncestors(created);
  assert.equal(path.dirname(canonical), temp);
  assert.equal(path.basename(canonical).startsWith(PREFIX), true);
  const owned = identity(canonical);
  t.after(() => {
    const currentCanonical = assertNoLinkedAncestors(canonical);
    const current = lstatSync(currentCanonical, { bigint: true });
    assert.equal(currentCanonical, owned.canonical);
    assert.equal(current.dev, owned.dev);
    assert.equal(current.ino, owned.ino);
    assert.equal(current.birthtimeNs, owned.birthtimeNs);
    assert.equal(path.dirname(currentCanonical), temp);
    assert.equal(path.basename(currentCanonical).startsWith(PREFIX), true);
    rmSync(currentCanonical, { recursive: true });
  });
  return canonical;
}

function sourceTreePath(root, relative) {
  return path.join(root, ...relative.split("\\"));
}

test("Legacy residue native fixture verifies only its owned temporary trees", {
  skip: process.platform !== "win32",
  timeout: 30_000,
}, async t => {
  const compileRoot = createOwnedTemp(t);
  const csc = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  const executable = path.join(compileRoot, "LegacyResidueFixture.exe");
  try {
    await execFileAsync(csc, ["/nologo", "/target:exe", `/out:${executable}`, ENGINE, FIXTURE], {
      windowsHide: true, timeout: 30_000, maxBuffer: 32_768,
    });
  } catch (error) {
    const compilerOutput = `${error.stdout || ""}\n${error.stderr || ""}`;
    const diagnostics = [...compilerOutput.matchAll(/(?:^|\r?\n)[^\r\n]*?\((\d+),(\d+)\): error (CS\d+):/g)]
      .map(match => `${match[3]}@${match[1]}:${match[2]}`);
    assert.fail(`Legacy residue fixture compilation failed${diagnostics.length ? ` (${diagnostics.join(",")})` : "."}`);
  }

  for (const scenario of CASES) {
    await t.test(scenario, async subtest => {
      const ownedParent = createOwnedTemp(subtest);
      const root = path.join(ownedParent, "root");
      const sentinel = path.join(ownedParent, "outside-sentinel");
      writeFileSync(sentinel, "outside approved root");
      if (scenario === "long-path") {
        let relative = "resources\\sps-owner-host-runtime";
        for (let i = 0; i < 4; i++) relative += `\\segment-${i}-${String.fromCharCode(97 + i).repeat(74)}`;
        relative += "\\payload.bin";
        const target = sourceTreePath(root, relative);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, PAYLOAD, { encoding: "ascii" });
        assert.ok(target.length > 260);
      }

      try {
        const result = await execFileAsync(executable, [ownedParent, scenario], {
          windowsHide: true, timeout: 30_000, maxBuffer: 32_768, encoding: "utf8",
        });
        assert.equal(result.stderr, "");
        const record = JSON.parse(result.stdout);
        if ((scenario === "ads" || scenario === "root-ads") && record.skipped === "filesystem-unsupported") {
          subtest.skip("Alternate data streams are unsupported by this filesystem.");
          return;
        }
        assert.deepEqual(record, { ok: true, scenario });
      } catch (error) {
        const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";
        if (stdout) {
          let record;
          try { record = JSON.parse(stdout); } catch { assert.fail("Legacy residue fixture emitted invalid output."); }
          if ((scenario === "ads" || scenario === "root-ads") && record.skipped === "filesystem-unsupported") {
            subtest.skip("Alternate data streams are unsupported by this filesystem.");
            return;
          }
          assert.deepEqual(record, { ok: true, scenario });
        } else {
          assert.fail("Legacy residue fixture execution failed.");
        }
      }
      assert.equal(lstatSync(sentinel).isFile(), true);
      assert.equal(readFileSync(sentinel, "utf8"), "outside approved root");
      if (scenario === "root-junction") {
        assert.equal(readFileSync(path.join(ownedParent, "outside-target", "target-sentinel"), "utf8"),
          "outside target remains unchanged");
      }
      assert.equal(realpathSync.native(ownedParent), ownedParent);
    });
  }
});
