const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const PROFILE_VERSION = /^(\d+)\.(\d+)$/;

function parseSemver(value) {
  if (typeof value !== "string" || !SEMVER.test(value)) return null;
  const [core, prerelease = ""] = value.split("-", 2);
  const [major, minor, patch] = core.split(".").map(Number);
  return { major, minor, patch, prerelease };
}

function compareSemver(left, right) {
  for (const field of ["major", "minor", "patch"]) {
    if (left[field] !== right[field]) return left[field] - right[field];
  }
  if (!left.prerelease && !right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

function satisfiesComparator(version, token) {
  const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(token);
  if (!match) return null;
  const candidate = parseSemver(match[2]);
  if (!candidate) return null;
  const compared = compareSemver(version, candidate);
  switch (match[1] || "=") {
    case ">=": return compared >= 0;
    case "<=": return compared <= 0;
    case ">": return compared > 0;
    case "<": return compared < 0;
    default: return compared === 0;
  }
}

/**
 * SPS accepts explicit comparator ranges only. That small grammar keeps a
 * signed release preview readable and avoids treating an unfamiliar range as
 * compatible by accident.
 */
export function satisfiesSpsVersion(versionText, rangeText) {
  const version = parseSemver(versionText);
  if (!version || typeof rangeText !== "string" || rangeText.trim().length === 0) return null;
  const comparisons = rangeText.trim().split(/\s+/).map((token) => satisfiesComparator(version, token));
  if (comparisons.some((result) => result === null)) return null;
  return comparisons.every(Boolean);
}

export function assessSpsPluginCompatibility(releaseCompatibility, {
  desktopVersion,
  pluginApi = 1,
  extensionProfile,
  extensionProfiles,
} = {}) {
  if (!releaseCompatibility || typeof releaseCompatibility !== "object" || Array.isArray(releaseCompatibility)) {
    return { compatible: false, reason: "The signed release has no SPS compatibility declaration." };
  }
  if (!Number.isSafeInteger(releaseCompatibility.pluginApi) || releaseCompatibility.pluginApi !== pluginApi) {
    return { compatible: false, reason: `This SPS Desktop supports Plugin API ${pluginApi}, but the release requires Plugin API ${String(releaseCompatibility.pluginApi)}.` };
  }
  const requiredProfile = PROFILE_VERSION.exec(releaseCompatibility.extensionProfile ?? "");
  const supportedProfiles = Array.isArray(extensionProfiles)
    ? extensionProfiles
    : extensionProfile
      ? [extensionProfile]
      : ["1.0", "2.0"];
  const supportedMajors = supportedProfiles
    .map((profile) => PROFILE_VERSION.exec(profile))
    .filter(Boolean)
    .map((profile) => profile[1]);
  if (!requiredProfile || !supportedMajors.includes(requiredProfile[1])) {
    const supportedLabel = supportedProfiles.length > 0 ? supportedProfiles.join(", ") : "none";
    return { compatible: false, reason: `This SPS Desktop supports Extension Profiles ${supportedLabel}, but the release requires ${String(releaseCompatibility.extensionProfile)}.` };
  }
  const spsRangeResult = satisfiesSpsVersion(desktopVersion, releaseCompatibility.sps);
  if (spsRangeResult === null) {
    return { compatible: false, reason: "The signed SPS version range is unsupported. Use explicit comparators such as >=0.4.0 <0.5.0." };
  }
  if (!spsRangeResult) {
    return { compatible: false, reason: `This SPS Desktop is ${desktopVersion}, but the release supports ${releaseCompatibility.sps}.` };
  }
  return { compatible: true, reason: null };
}
