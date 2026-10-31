import { createHash } from "node:crypto";
import { link, open, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertContained, assertHostedInstallerCi, assertPlainDirectory } from "./installer-ci-safety.mjs";

export const HISTORICAL_INSTALLER_BASELINE = Object.freeze({
  version: "0.4.86",
  repository: "Powerpunch777/SPS-Desktop-Releases",
  tag: "v0.4.86",
  installerName: "SPS-Desktop-Setup-0.4.86.exe",
  assetId: 494984665,
  size: 225049104,
  sha256: "d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56",
  source: Object.freeze({ revision: "68ff23eb024bcc84854c5b7d4663816dc7660b78", dirty: true }),
  core: Object.freeze({ revision: "95665eb49996cd0e9c13e2da817326dfffe0f2a3", dirty: true }),
  withdrawn: true,
  signingTrustQualified: false,
});

const DOWNLOAD_URL = "https://github.com/Powerpunch777/SPS-Desktop-Releases/releases/download/v0.4.86/SPS-Desktop-Setup-0.4.86.exe";
const DOWNLOAD_TIMEOUT_MS = 120_000;

export function createHistoricalInstallerValidator({ expectedSize, expectedSha256 }) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || !/^[0-9a-f]{64}$/.test(expectedSha256 ?? "")) {
    throw new Error("Invalid historical installer validation policy.");
  }
  const hash = createHash("sha256");
  let size = 0;
  let finished = false;
  return {
    update(chunk) {
      if (finished) throw new Error("Historical installer validation is already complete.");
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > expectedSize) throw new Error("Historical installer exceeds its pinned size.");
      hash.update(bytes);
    },
    finish() {
      if (finished) throw new Error("Historical installer validation is already complete.");
      finished = true;
      const sha256 = hash.digest("hex");
      if (size !== expectedSize) throw new Error("Historical installer size does not match its pinned size.");
      if (sha256 !== expectedSha256) throw new Error("Historical installer SHA-256 does not match its pinned digest.");
      return { size, sha256 };
    },
  };
}

export async function stageHistoricalInstaller(directory, { fetchImpl = fetch } = {}) {
  assertHostedInstallerCi();

  const temporaryRoot = await assertPlainDirectory(os.tmpdir());
  const ownedRoot = await assertPlainDirectory(directory);
  if (path.dirname(ownedRoot) !== temporaryRoot || !/^sps-installer-data-[^\\/]+$/.test(path.basename(ownedRoot))) {
    throw new Error("Historical installer staging requires an sps-installer-data-* directory directly under the system temp directory.");
  }

  const targetPath = path.join(ownedRoot, HISTORICAL_INSTALLER_BASELINE.installerName);
  const partialPath = `${targetPath}.partial`;
  assertContained(ownedRoot, targetPath);
  assertContained(ownedRoot, partialPath);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Historical installer download timed out.")), DOWNLOAD_TIMEOUT_MS);
  timeout.unref?.();
  let partialOwned = false;
  let targetOwned = false;
  let handle;
  try {
    const response = await fetchImpl(DOWNLOAD_URL, { signal: controller.signal });
    if (!response?.ok || response.status !== 200 || !response.body) {
      throw new Error(`Historical installer download failed with HTTP ${response?.status ?? "no response"}.`);
    }

    handle = await open(partialPath, "wx", 0o600);
    partialOwned = true;
    const validator = createHistoricalInstallerValidator({
      expectedSize: HISTORICAL_INSTALLER_BASELINE.size,
      expectedSha256: HISTORICAL_INSTALLER_BASELINE.sha256,
    });
    for await (const chunk of response.body) {
      if (controller.signal.aborted) throw controller.signal.reason;
      validator.update(chunk);
      await handle.writeFile(chunk);
    }
    const result = validator.finish();
    await handle.sync();
    await handle.close();
    handle = undefined;

    await link(partialPath, targetPath);
    targetOwned = true;
    await unlink(partialPath);
    partialOwned = false;
    return { path: targetPath, ...result };
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (partialOwned) await unlink(partialPath).catch(() => {});
    if (targetOwned) await unlink(targetPath).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
