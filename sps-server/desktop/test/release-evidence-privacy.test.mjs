import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cleanObsoleteServeEvidence,
  releaseEvidencePrivacyFindings,
  verifyServeEvidenceDirectoryPrivacy,
} from "../scripts/release-evidence-privacy.mjs";

test("detects private account, network, hostname, and filesystem data", () => {
  const findings = releaseEvidencePrivacyFindings(String.raw`owner@example.com 100.116.73.36 owner.tailnet.ts.net C:\Users\owner\capture.json`);
  assert.deepEqual(findings, ["email address", "Tailscale hostname", "non-loopback IPv4 address", "absolute Windows path"]);
  assert.deepEqual(releaseEvidencePrivacyFindings("GET http://127.0.0.1:31311/<tailnet-host>"), []);
});

test("removes old and private Serve artifacts while retaining sanitized current evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-evidence-privacy-"));
  try {
    await writeFile(path.join(root, "sps-candidate-serve-evidence-0.4.131.json"), "{}", "utf8");
    await writeFile(path.join(root, "sps-candidate-serve-evidence-0.4.132.json"), "{}", "utf8");
    await writeFile(path.join(root, "sps-candidate-serve-20260805144442.out.log"), "private", "utf8");
    await writeFile(path.join(root, "sps-candidate-serve-smoke.mjs"), "private", "utf8");
    const removed = await cleanObsoleteServeEvidence({ distDirectory: root, currentVersion: "0.4.132" });
    assert.deepEqual(removed, [
      "sps-candidate-serve-20260805144442.out.log",
      "sps-candidate-serve-evidence-0.4.131.json",
      "sps-candidate-serve-smoke.mjs",
    ]);
    assert.deepEqual(await readdir(root), ["sps-candidate-serve-evidence-0.4.132.json"]);
    assert.deepEqual(await verifyServeEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.132" }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails privacy verification for stale or sensitive public evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-evidence-privacy-"));
  try {
    await writeFile(path.join(root, "sps-candidate-serve-evidence-0.4.131.json"), "{}", "utf8");
    await writeFile(path.join(root, "sps-candidate-serve-evidence-0.4.132.json"), '{"host":"owner.tailnet.ts.net"}', "utf8");
    const errors = await verifyServeEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.132" });
    assert.ok(errors.some((error) => error.includes("only the current candidate")));
    assert.ok(errors.some((error) => error.includes("Tailscale hostname")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
