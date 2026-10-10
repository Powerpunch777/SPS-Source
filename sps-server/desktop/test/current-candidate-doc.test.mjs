import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  renderCurrentCandidateDocument,
  syncCurrentCandidateDocument,
} from "../scripts/current-candidate-doc.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");

test("keeps the current candidate document synchronized with the support matrix", async () => {
  await syncCurrentCandidateDocument({ spsServerRoot, check: true });
});

test("renders candidate identity separately from physical test evidence", async () => {
  const matrix = JSON.parse(await readFile(path.join(spsServerRoot, "release", "support-matrix.json"), "utf8"));
  const document = renderCurrentCandidateDocument(matrix);
  assert.ok(document.includes(`| SPS Desktop | \`${matrix.candidate.desktopVersion}\` |`));
  assert.match(document, new RegExp(matrix.candidate.core.revision));
  assert.match(document, /Physical multi-computer evidence must name that same Source revision and tuple/);
  assert.match(document, /evidence from an older candidate cannot be reused/);
});

test("check mode rejects a stale generated document", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-candidate-doc-"));
  try {
    await mkdir(path.join(root, "release"), { recursive: true });
    await mkdir(path.join(root, "docs", "current"), { recursive: true });
    await writeFile(
      path.join(root, "release", "support-matrix.json"),
      await readFile(path.join(spsServerRoot, "release", "support-matrix.json"), "utf8"),
      "utf8",
    );
    await writeFile(path.join(root, "docs", "current", "CURRENT-CANDIDATE.md"), "stale\n", "utf8");
    await assert.rejects(
      () => syncCurrentCandidateDocument({ spsServerRoot: root, check: true }),
      /out of date/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("check mode accepts an equivalent CRLF document", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-candidate-doc-crlf-"));
  try {
    await mkdir(path.join(root, "release"), { recursive: true });
    await mkdir(path.join(root, "docs", "current"), { recursive: true });
    const matrix = await readFile(path.join(spsServerRoot, "release", "support-matrix.json"), "utf8");
    await writeFile(path.join(root, "release", "support-matrix.json"), matrix, "utf8");
    const expected = renderCurrentCandidateDocument(JSON.parse(matrix));
    await writeFile(
      path.join(root, "docs", "current", "CURRENT-CANDIDATE.md"),
      expected.replace(/\n/g, "\r\n"),
      "utf8",
    );

    await syncCurrentCandidateDocument({ spsServerRoot: root, check: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
