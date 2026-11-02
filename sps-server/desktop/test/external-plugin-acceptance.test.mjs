import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadExternalPluginAcceptance, waitForPluginAcceptanceSelector } from "../scripts/external-plugin-acceptance.mjs";

test("external acceptance requires explicit trusted source-only operator mode", async () => {
  assert.equal(await loadExternalPluginAcceptance({ enabled: false, sourceOnly: true }), null);
  for (const options of [
    { enabled: false, sourceOnly: true, modulePath: "C:/operator.mjs" },
    { enabled: true, sourceOnly: false, modulePath: "C:/operator.mjs" },
    { enabled: true, sourceOnly: true, modulePath: "relative.mjs" },
    { enabled: true, sourceOnly: true, modulePath: path.resolve("operator.js") },
  ]) await assert.rejects(loadExternalPluginAcceptance(options), /source-only/);
});

test("external UI readiness uses the existing deadline and rejects invalid input", async () => {
  let reads = 0;
  const cdp = { async evaluate() { reads += 1; return true; } };
  await waitForPluginAcceptanceSelector(cdp, ".actual-ui", Date.now() + 1000);
  assert.equal(reads, 1);
  await assert.rejects(waitForPluginAcceptanceSelector(cdp, ".actual-ui", Date.now() - 1), /did not become ready/);
  assert.equal(reads, 1);
  await assert.rejects(waitForPluginAcceptanceSelector(cdp, null, Infinity), /original document deadline/);
});

test("loads only a bounded regular operator with the expected export", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-external-acceptance-"));
  try {
    const options = { enabled: true, sourceOnly: true };
    await assert.rejects(loadExternalPluginAcceptance({ ...options, modulePath: root + ".mjs" }), /ENOENT/);
    const good = path.join(root, "good.mjs");
    await writeFile(good, "export async function runAcceptance(value) { return value; }\n");
    assert.equal(await (await loadExternalPluginAcceptance({ ...options, modulePath: good }))(42), 42);
    const invalid = path.join(root, "invalid.mjs");
    await writeFile(invalid, "export const other = true;\n");
    await assert.rejects(loadExternalPluginAcceptance({ ...options, modulePath: invalid }), /runAcceptance/);
    const large = path.join(root, "large.mjs");
    await writeFile(large, " ".repeat(128 * 1024 + 1));
    await assert.rejects(loadExternalPluginAcceptance({ ...options, modulePath: large }), /bounded regular/);
  } finally { await rm(root, { recursive: true }); }
});
