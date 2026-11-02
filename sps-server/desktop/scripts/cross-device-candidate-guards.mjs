import { createReadStream } from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { assertPlainDirectory } from "./installer-ci-safety.mjs";

const EXPECTED_KEYS = ["coreRevision", "desktopVersion", "sdkRevision", "sourceRevision"];
const OPTION_KEYS = ["expected", "fixtureRoot"];
const IDENTITY_FIELDS = ["dev", "ino", "birthtimeNs", "mtimeNs", "ctimeNs", "size", "nlink"];
const DIRECTORY_IDENTITY_FIELDS = ["dev", "ino", "birthtimeNs"];
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const REVISION = /^[a-f0-9]{40}$/;
const MAX_BASELINE_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 512n * 1024n * 1024n;
const ARTIFACTS = {
  executable: ["SPS Desktop.exe"],
  appAsar: ["resources", "app.asar"],
  runtimeArchive: ["resources", "sps-owner-host-runtime-package", "sps-owner-host-runtime.tgz"],
};

function readExactDataObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`${label} must be a plain object.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== "string")
    || ownKeys.slice().sort().join("\0") !== keys.slice().sort().join("\0")) {
    throw new Error(`${label} must contain exactly ${keys.join(", ")}.`);
  }
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
      throw new Error(`${label} fields must be enumerable data properties.`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function assertExpected(expectedInput) {
  const expected = readExactDataObject(expectedInput, EXPECTED_KEYS, "Expected candidate tuple");
  if (typeof expected.desktopVersion !== "string" || !SEMVER.test(expected.desktopVersion)
    || typeof expected.sourceRevision !== "string" || !REVISION.test(expected.sourceRevision)
    || typeof expected.coreRevision !== "string" || !REVISION.test(expected.coreRevision)
    || typeof expected.sdkRevision !== "string" || !REVISION.test(expected.sdkRevision)) {
    throw new Error("Expected candidate tuple has invalid version or revision values.");
  }
  return expected;
}

function assertBaseline(baseline, expected) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)
    || baseline.status !== "development-candidate"
    || baseline.desktopVersion !== expected.desktopVersion
    || baseline.sourceRevision !== expected.sourceRevision || baseline.sourceDirty !== false
    || baseline.core?.revision !== expected.coreRevision || baseline.core?.dirty !== false
    || baseline.pluginSdk?.revision !== expected.sdkRevision || baseline.pluginSdk?.dirty !== false) {
    throw new Error("Candidate baseline does not match the expected clean development candidate.");
  }
  return baseline;
}

function identityOf(stats) {
  return IDENTITY_FIELDS.map(field => stats[field]);
}

function sameIdentity(left, right) {
  return identityOf(left).every((value, index) => value === identityOf(right)[index]);
}

async function captureDirectoryChain(directory) {
  await assertPlainDirectory(directory);
  const parsed = path.parse(directory);
  const chain = [];
  let current = parsed.root;
  chain.push(current);
  for (const part of directory.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    chain.push(current);
  }
  const captures = [];
  for (const entry of chain) {
    const stats = await lstat(entry, { bigint: true });
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Candidate directory ancestry contains a linked or non-directory component.");
    }
    captures.push({ path: entry, identity: DIRECTORY_IDENTITY_FIELDS.map(field => stats[field]) });
  }
  return captures;
}

async function recheckDirectories(captures) {
  for (const capture of captures) {
    const current = await lstat(capture.path, { bigint: true });
    if (!current.isDirectory() || current.isSymbolicLink()
      || !DIRECTORY_IDENTITY_FIELDS.every((field, index) => current[field] === capture.identity[index])) {
      throw new Error("Candidate directory ancestry changed while it was being inspected.");
    }
  }
}

async function assertPlainFile(file) {
  const details = await lstat(file, { bigint: true });
  if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1n || details.size <= 0n) {
    throw new Error("Candidate artifact must be a nonempty plain file with one link.");
  }
  return details;
}

async function hashPlainFile(file, directoryCaptures) {
  await recheckDirectories(directoryCaptures);
  const before = await assertPlainFile(file);
  if (before.size > MAX_ARTIFACT_BYTES) throw new Error("Candidate artifact exceeds 512 MiB.");
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", chunk => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  const after = await assertPlainFile(file);
  await recheckDirectories(directoryCaptures);
  if (!sameIdentity(before, after)) throw new Error("Candidate artifact changed while it was being inspected.");
  return hash.digest("hex");
}

export async function inspectCrossDeviceCandidate(options) {
  const { fixtureRoot, expected: expectedInput } = readExactDataObject(options, OPTION_KEYS, "Candidate inspection options");
  const expected = assertExpected(expectedInput);
  if (typeof fixtureRoot !== "string" || !path.isAbsolute(fixtureRoot)
    || path.resolve(fixtureRoot) !== fixtureRoot
    || !/^sps-workspace-surfaces-e2e-[A-Za-z0-9]+$/.test(path.basename(fixtureRoot))) {
    throw new Error("Candidate fixture root must be an absolute direct temporary-directory child with the owned name format.");
  }

  const canonicalTmp = await realpath(os.tmpdir());
  if (path.dirname(fixtureRoot) !== canonicalTmp) {
    throw new Error("Candidate fixture root must be a direct child of the canonical temporary directory.");
  }
  const canonicalRoot = await assertPlainDirectory(fixtureRoot);
  if (canonicalRoot !== fixtureRoot) throw new Error("Candidate fixture root must not resolve through an alias.");

  const fixtureDirectories = await captureDirectoryChain(fixtureRoot);
  const candidateRoot = path.join(fixtureRoot, "candidate");
  const candidateDirectories = await captureDirectoryChain(candidateRoot);
  const allDirectoryCaptures = [...fixtureDirectories, ...candidateDirectories];

  const baselinePath = path.join(fixtureRoot, "candidate-baseline.json");
  await recheckDirectories(fixtureDirectories);
  const baselineStat = await assertPlainFile(baselinePath);
  if (baselineStat.size > BigInt(MAX_BASELINE_BYTES)) throw new Error("Candidate baseline exceeds 64 KiB.");
  const baselineBytes = await readFile(baselinePath);
  const baselineAfter = await assertPlainFile(baselinePath);
  await recheckDirectories(fixtureDirectories);
  if (!sameIdentity(baselineStat, baselineAfter)
    || BigInt(baselineBytes.length) !== baselineStat.size || baselineBytes.length > MAX_BASELINE_BYTES) {
    throw new Error("Candidate baseline changed while it was being read.");
  }
  let baseline;
  try {
    baseline = JSON.parse(baselineBytes.toString("utf8"));
  } catch {
    throw new Error("Candidate baseline is not valid JSON.");
  }
  // This only compares a supplied baseline with the expected tuple; it does not establish its origin. The parent must verify the baseline actually loaded after main starts.
  assertBaseline(baseline, expected);

  const installedArtifacts = {};
  for (const [key, relativeParts] of Object.entries(ARTIFACTS)) {
    let directory = candidateRoot;
    for (const part of relativeParts.slice(0, -1)) directory = path.join(directory, part);
    const directoryCaptures = await captureDirectoryChain(directory);
    allDirectoryCaptures.push(...directoryCaptures);
    installedArtifacts[key] = await hashPlainFile(path.join(directory, relativeParts.at(-1)), directoryCaptures);
  }

  await recheckDirectories(allDirectoryCaptures);
  return { baseline, installedArtifacts };
}
