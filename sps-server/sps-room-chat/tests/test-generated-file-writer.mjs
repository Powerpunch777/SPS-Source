import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeGeneratedFileAtomic } from "../scripts/generated-file-writer.mjs";

function fileError(code) {
  return Object.assign(new Error(code), { code });
}

test("retries transient temporary writes and replacement before succeeding", async () => {
  const events = [];
  let writeAttempts = 0;
  let moveAttempts = 0;
  await writeGeneratedFileAtomic("dist/worker.js", "complete", {
    temporaryPath: "dist/worker.js.test.tmp",
    async write(filePath, contents, encoding) {
      events.push(["write", filePath, contents, encoding]);
      writeAttempts += 1;
      if (writeAttempts < 3) throw fileError("EBUSY");
    },
    async move(source, target) {
      events.push(["move", source, target]);
      moveAttempts += 1;
      if (moveAttempts < 2) throw fileError("EPERM");
    },
    async remove(filePath, options) {
      events.push(["remove", filePath, options]);
    },
    async wait(milliseconds) {
      events.push(["wait", milliseconds]);
    },
  });

  assert.equal(writeAttempts, 3);
  assert.equal(moveAttempts, 2);
  assert.deepEqual(events.filter(([type]) => type === "wait"), [
    ["wait", 50],
    ["wait", 100],
    ["wait", 50],
  ]);
  assert.deepEqual(events.at(-1), ["remove", "dist/worker.js.test.tmp", { force: true }]);
});

test("removes the temporary file after transient retries are exhausted", async () => {
  let attempts = 0;
  let removed = false;
  await assert.rejects(
    writeGeneratedFileAtomic("dist/worker.js", "complete", {
      temporaryPath: "dist/worker.js.test.tmp",
      maxAttempts: 3,
      async write() {
        attempts += 1;
        throw fileError("EACCES");
      },
      async remove() {
        removed = true;
      },
      async wait() {},
    }),
    { code: "EACCES" },
  );
  assert.equal(attempts, 3);
  assert.equal(removed, true);
});

test("does not retry a non-transient file error", async () => {
  let attempts = 0;
  await assert.rejects(
    writeGeneratedFileAtomic("dist/worker.js", "complete", {
      temporaryPath: "dist/worker.js.test.tmp",
      async write() {
        attempts += 1;
        throw fileError("ENOSPC");
      },
      async remove() {},
      async wait() {
        assert.fail("A non-transient error must not wait for another attempt.");
      },
    }),
    { code: "ENOSPC" },
  );
  assert.equal(attempts, 1);
});

test("atomically replaces an existing generated file on the current platform", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sps-generated-writer-"));
  const targetPath = path.join(directory, "worker.js");
  try {
    await writeFile(targetPath, "old", "utf8");
    await writeGeneratedFileAtomic(targetPath, "new");
    assert.equal(await readFile(targetPath, "utf8"), "new");
    assert.deepEqual(await readdir(directory), ["worker.js"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
