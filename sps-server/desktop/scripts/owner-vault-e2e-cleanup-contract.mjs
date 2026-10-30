const fields = [
  "children",
  "exited",
  "orderly",
  "outputEnded",
  "outputFailed",
  "expectedCrashCount",
  "confirmedCrashCount",
  "fixtureProcessesAbsent",
  "identityClosed",
];

export function validateOwnerVaultE2eCleanup(summary) {
  // Validate direct cleanup evidence and explicit teardown confirmations.
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new TypeError("Expected an owner-vault cleanup summary object.");
  }
  const ownKeys = Reflect.ownKeys(summary);
  if (ownKeys.length !== fields.length || fields.some(field => !Object.hasOwn(summary, field))) {
    throw new TypeError("Cleanup summary fields do not match the contract.");
  }

  const boundedCounts = ["children", "exited", "orderly", "expectedCrashCount", "confirmedCrashCount"];
  for (const field of boundedCounts) {
    if (!Number.isInteger(summary[field]) || summary[field] < 0 || summary[field] > 32) {
      throw new RangeError(`${field} must be an integer from 0 through 32.`);
    }
  }
  if (!Number.isInteger(summary.outputEnded) || summary.outputEnded < 0 || summary.outputEnded > 64) {
    throw new RangeError("outputEnded must be an integer from 0 through 64.");
  }
  if (!Number.isInteger(summary.outputFailed) || summary.outputFailed < 0 || summary.outputFailed > 64) {
    throw new RangeError("outputFailed must be an integer from 0 through 64.");
  }
  if (summary.fixtureProcessesAbsent !== true || summary.identityClosed !== true) {
    throw new TypeError("Fixture process absence and identity closure must be confirmed.");
  }
  if (
    summary.exited !== summary.children ||
    summary.orderly + summary.expectedCrashCount !== summary.children ||
    summary.confirmedCrashCount !== summary.expectedCrashCount ||
    summary.outputEnded !== summary.children * 2 ||
    summary.outputFailed !== 0
  ) {
    throw new Error("Cleanup summary does not satisfy the contract.");
  }

  return Object.freeze(Object.fromEntries(fields.map(field => [field, summary[field]])));
}
