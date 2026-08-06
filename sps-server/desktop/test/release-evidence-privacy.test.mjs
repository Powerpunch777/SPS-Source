import assert from "node:assert/strict";
import { access, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cleanObsoleteCandidateEvidence,
  releaseEvidencePrivacyFindings,
  verifyCandidateEvidenceDirectoryPrivacy,
} from "../scripts/release-evidence-privacy.mjs";

test("detects private account, network, hostname, and filesystem data", () => {
  const findings = releaseEvidencePrivacyFindings(String.raw`owner@example.com 100.116.73.36 fd7a:115c:a1e0::4b37:c225 owner.tailnet.ts.net C:\Users\owner\capture.json`);
  assert.deepEqual(findings, [
    "email address",
    "Tailscale hostname",
    "non-loopback IPv4 address",
    "non-loopback IPv6 address",
    "absolute Windows path",
  ]);
  assert.deepEqual(releaseEvidencePrivacyFindings("GET http://127.0.0.1:31311/ and http://[::1]:31311/<tailnet-host>"), []);
});

test("removes old and private Serve artifacts while retaining sanitized current evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-evidence-privacy-"));
  try {
    await writeFile(path.join(root, "sps-candidate-serve-evidence-0.4.132.json"), "{}", "utf8");
    await writeFile(path.join(root, "sps-candidate-serve-evidence-0.4.133.json"), "{}", "utf8");
    await writeFile(path.join(root, "sps-candidate-serve-20260805144442.out.log"), "private", "utf8");
    await writeFile(path.join(root, "sps-candidate-serve-smoke.mjs"), "private", "utf8");
    await writeFile(path.join(root, "sps-candidate-member-success.json"), "private", "utf8");
    await writeFile(path.join(root, "sps-candidate-direct-spoof.json"), "private", "utf8");
    await writeFile(path.join(root, "latest.yml"), "public", "utf8");
    const removed = await cleanObsoleteCandidateEvidence({ distDirectory: root, currentVersion: "0.4.133" });
    assert.deepEqual(removed, [
      "sps-candidate-direct-spoof.json",
      "sps-candidate-member-success.json",
      "sps-candidate-serve-20260805144442.out.log",
      "sps-candidate-serve-evidence-0.4.132.json",
      "sps-candidate-serve-smoke.mjs",
    ]);
    assert.deepEqual((await readdir(root)).sort(), ["latest.yml", "sps-candidate-serve-evidence-0.4.133.json"]);
    assert.deepEqual(await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails privacy verification for stale or sensitive public evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-evidence-privacy-"));
  try {
    await writeFile(path.join(root, "sps-candidate-serve-evidence-0.4.132.json"), "{}", "utf8");
    await writeFile(path.join(root, "sps-candidate-serve-evidence-0.4.133.json"), '{"host":"owner.tailnet.ts.net"}', "utf8");
    const errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("only the current candidate")));
    assert.ok(errors.some((error) => error.includes("Tailscale hostname")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("detects and removes mixed-case candidate artifact names", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-evidence-privacy-"));
  try {
    await writeFile(path.join(root, "SPS-CANDIDATE-MEMBER.JSON"), '{"email":"owner@example.com"}', "utf8");

    const errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("SPS-CANDIDATE-MEMBER.JSON: only the current candidate")));

    const removed = await cleanObsoleteCandidateEvidence({ distDirectory: root, currentVersion: "0.4.133" });
    assert.deepEqual(removed, ["SPS-CANDIDATE-MEMBER.JSON"]);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires strict UTF-8 JSON and accepts one UTF-8 BOM", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-evidence-privacy-"));
  const evidence = path.join(root, "sps-candidate-serve-evidence-0.4.133.json");
  try {
    await writeFile(evidence, Buffer.from(`\ufeff{"email":"owner@example.com"}`, "utf16le"));
    let errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("must use valid UTF-8 encoding")));

    const utf16be = Buffer.from(`\ufeff{"email":"owner@example.com"}`, "utf16le");
    utf16be.swap16();
    await writeFile(evidence, utf16be);
    errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("must use valid UTF-8 encoding")));

    await writeFile(evidence, Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x22, 0x7d]));
    errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("must use valid UTF-8 encoding")));

    await writeFile(evidence, Buffer.from('{"value":"\\u0000"}', "utf8"));
    errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("must not contain NUL characters")));

    await writeFile(evidence, Buffer.from('{"value":"\ufffd"}', "utf8"));
    errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("must not contain replacement characters")));

    await writeFile(evidence, Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('{"safe":{"value":"public"}}', "utf8"),
    ]));
    assert.deepEqual(await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parses JSON before recursively inspecting keys and string values", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-evidence-privacy-"));
  const evidence = path.join(root, "sps-candidate-serve-evidence-0.4.133.json");
  try {
    await writeFile(evidence, '{"nested":[{"owner":"owner@example.com"}]}', "utf8");
    let errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("email address")));

    await writeFile(evidence, '{"owner@example.com":"redacted"}', "utf8");
    errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("email address")));

    await writeFile(evidence, '{"broken":', "utf8");
    errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("must contain valid JSON")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects raw candidate files and linked candidate evidence", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-evidence-privacy-"));
  const outside = await mkdtemp(path.join(tmpdir(), "sps-evidence-private-target-"));
  const linkedEvidence = path.join(root, "sps-candidate-serve-evidence-0.4.133.json");
  try {
    await writeFile(path.join(root, "sps-candidate-member-success.json"), "{}", "utf8");
    await writeFile(path.join(outside, "private.json"), "{}", "utf8");
    await symlink(outside, linkedEvidence, process.platform === "win32" ? "junction" : "dir");

    const errors = await verifyCandidateEvidenceDirectoryPrivacy({ distDirectory: root, currentVersion: "0.4.133" });
    assert.ok(errors.some((error) => error.includes("sps-candidate-member-success.json: only the current candidate")));
    assert.ok(errors.some((error) => error.includes("candidate evidence must be a regular file")));

    const removed = await cleanObsoleteCandidateEvidence({
      distDirectory: root,
      currentVersion: "0.4.133",
      removeCurrentPublic: true,
    });
    assert.deepEqual(removed, ["sps-candidate-member-success.json", "sps-candidate-serve-evidence-0.4.133.json"]);
    await access(path.join(outside, "private.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
