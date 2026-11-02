import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createHistoricalInstallerValidator,
  HISTORICAL_INSTALLER_BASELINE,
  stageHistoricalInstaller,
} from "../scripts/historical-installer-baseline.mjs";

test("historical installer pin is frozen and explicitly not trusted as a Stable baseline", () => {
  assert.equal(Object.isFrozen(HISTORICAL_INSTALLER_BASELINE), true);
  assert.equal(HISTORICAL_INSTALLER_BASELINE.version, "0.4.86");
  assert.equal(HISTORICAL_INSTALLER_BASELINE.repository, "Powerpunch777/SPS-Desktop-Releases");
  assert.equal(HISTORICAL_INSTALLER_BASELINE.tag, "v0.4.86");
  assert.equal(HISTORICAL_INSTALLER_BASELINE.installerName, "SPS-Desktop-Setup-0.4.86.exe");
  assert.equal(HISTORICAL_INSTALLER_BASELINE.assetId, 494984665);
  assert.equal(HISTORICAL_INSTALLER_BASELINE.size, 225049104);
  assert.equal(HISTORICAL_INSTALLER_BASELINE.sha256, "d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56");
  assert.equal(Object.isFrozen(HISTORICAL_INSTALLER_BASELINE.source), true);
  assert.equal(Object.isFrozen(HISTORICAL_INSTALLER_BASELINE.core), true);
  assert.equal(HISTORICAL_INSTALLER_BASELINE.source.revision, "68ff23eb024bcc84854c5b7d4663816dc7660b78");
  assert.equal(HISTORICAL_INSTALLER_BASELINE.source.dirty, true);
  assert.equal(HISTORICAL_INSTALLER_BASELINE.core.revision, "95665eb49996cd0e9c13e2da817326dfffe0f2a3");
  assert.equal(HISTORICAL_INSTALLER_BASELINE.core.dirty, true);
  assert.equal(HISTORICAL_INSTALLER_BASELINE.withdrawn, true);
  assert.equal(HISTORICAL_INSTALLER_BASELINE.signingTrustQualified, false);
});

test("stream validator checks cumulative size and SHA-256 using small chunks", () => {
  const bytes = Buffer.from("historical installer fixture");
  const expectedSha256 = createHash("sha256").update(bytes).digest("hex");
  const validator = createHistoricalInstallerValidator({ expectedSize: bytes.length, expectedSha256 });
  validator.update(bytes.subarray(0, 8));
  validator.update(bytes.subarray(8));
  assert.deepEqual(validator.finish(), { size: bytes.length, sha256: expectedSha256 });
  assert.throws(() => validator.update(Buffer.from("late")), /already complete/);

  const oversized = createHistoricalInstallerValidator({ expectedSize: 2, expectedSha256 });
  assert.throws(() => oversized.update(Buffer.from("abc")), /exceeds its pinned size/);
  const wrongSize = createHistoricalInstallerValidator({ expectedSize: bytes.length + 1, expectedSha256 });
  wrongSize.update(bytes);
  assert.throws(() => wrongSize.finish(), /size does not match/);
  const wrongDigest = createHistoricalInstallerValidator({ expectedSize: bytes.length, expectedSha256: "0".repeat(64) });
  wrongDigest.update(bytes);
  assert.throws(() => wrongDigest.finish(), /SHA-256 does not match/);
});

test("production staging refuses a local invocation before fetching or touching a directory", async () => {
  let fetchCalled = false;
  await assert.rejects(
    stageHistoricalInstaller("not-a-real-staging-directory", {
      fetchImpl: async () => { fetchCalled = true; throw new Error("unexpected fetch"); },
    }),
    /requires the owned GitHub-hosted Windows CI launcher/,
  );
  assert.equal(fetchCalled, false);
});
