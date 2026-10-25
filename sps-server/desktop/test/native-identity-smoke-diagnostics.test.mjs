import assert from "node:assert/strict";
import test from "node:test";
import {
  NATIVE_IDENTITY_FAILURE_PREFIX,
  createNativeIdentityFailureReport,
  formatNativeIdentityFailure,
  isNativeIdentityFingerprint,
  isNativeIdentityVersion,
  parseNativeIdentityFailure,
  serializeNativeIdentityFailure,
} from "../src/native-identity-smoke-diagnostics.mjs";

const reportKeys = [
  "phase",
  "stage",
  "errorCode",
  "electronRuntimeVersion",
  "nodeRuntimeVersion",
  "expectedElectronVersion",
];

function report(overrides = {}) {
  return {
    phase: "create",
    stage: "runtime_validation",
    errorCode: "electron_version_mismatch",
    electronRuntimeVersion: "43.7.7",
    nodeRuntimeVersion: "22.23.4",
    expectedElectronVersion: "43.8.3",
    ...overrides,
  };
}

test("failure payloads contain only allowlisted fields and discard private error data", () => {
  const payload = createNativeIdentityFailureReport({
    ...report(),
    message: "C:\\private\\profile token=secret",
    stack: "privateKeyPem=secret",
    path: "C:\\customer\\identity",
  });
  assert.deepEqual(Object.keys(payload), reportKeys);

  const line = serializeNativeIdentityFailure({
    ...report(),
    message: "C:\\private\\profile token=secret",
    privateKeyPem: "secret-key-material",
  });
  assert.ok(line.startsWith(NATIVE_IDENTITY_FAILURE_PREFIX));
  assert.deepEqual(Object.keys(JSON.parse(line.slice(NATIVE_IDENTITY_FAILURE_PREFIX.length))), reportKeys);
  assert.doesNotMatch(line, /private|secret|customer|token|stack|message|privateKeyPem/i);
  assert.equal(formatNativeIdentityFailure(payload),
    "Native identity smoke failed: phase=create stage=runtime_validation code=electron_version_mismatch Electron=43.7.7 Node=22.23.4 expectedElectron=43.8.3.");
});

test("startup, watchdog, and version mismatch diagnostics preserve actionable safe versions", () => {
  const cases = [
    report({ stage: "electron_startup", errorCode: "electron_startup_failed", electronRuntimeVersion: null, nodeRuntimeVersion: null }),
    report({ stage: "watchdog", errorCode: "smoke_watchdog_expired", electronRuntimeVersion: "43.8.3" }),
    report({ stage: "runtime_validation", errorCode: "electron_version_mismatch", electronRuntimeVersion: "43.7.7" }),
  ];
  for (const value of cases) {
    const parsed = parseNativeIdentityFailure(serializeNativeIdentityFailure(value), {
      phase: value.phase,
      expectedElectronVersion: "43.8.3",
    });
    assert.deepEqual(parsed, value);
    const formatted = formatNativeIdentityFailure(parsed);
    assert.ok(formatted.includes(`stage=${value.stage}`));
    assert.ok(formatted.includes(`code=${value.errorCode}`));
    assert.ok(formatted.includes("expectedElectron=43.8.3"));
  }
  assert.ok(formatNativeIdentityFailure(cases[0]).includes("Electron=unknown Node=unknown"));
});

test("parent parser extracts only one exact schema record from untrusted stderr", () => {
  const privateText = "startup failed at C:\\customer\\profile token=secret privateKeyPem=secret";
  const stderr = `${privateText}\r\n${serializeNativeIdentityFailure(report())}\r\n${privateText}`;
  const parsed = parseNativeIdentityFailure(stderr, { phase: "create", expectedElectronVersion: "43.8.3" });
  assert.deepEqual(parsed, report());
  assert.deepEqual(Object.keys(parsed), reportKeys);
  assert.doesNotMatch(formatNativeIdentityFailure(parsed), /customer|profile|secret|token|privateKeyPem/i);
});

test("malformed, duplicated, unexpected, or mismatched diagnostics are rejected", () => {
  const validLine = serializeNativeIdentityFailure(report());
  const withUnknownField = `${NATIVE_IDENTITY_FAILURE_PREFIX}${JSON.stringify({ ...report(), message: "raw" })}`;
  const duplicateKey = `${NATIVE_IDENTITY_FAILURE_PREFIX}${validLine.slice(NATIVE_IDENTITY_FAILURE_PREFIX.length).replace('"phase":"create"', '"phase":"create","phase":"reload"')}`;
  const nonCanonical = `${NATIVE_IDENTITY_FAILURE_PREFIX}${validLine.slice(NATIVE_IDENTITY_FAILURE_PREFIX.length).replace('"phase":', '"phase" : ')}`;
  const invalidStage = serializeNativeIdentityFailure(report({ stage: "C:\\private" }));
  const invalidCode = serializeNativeIdentityFailure(report({ errorCode: "raw-error-message" }));
  const invalidVersion = serializeNativeIdentityFailure(report({ electronRuntimeVersion: "C:\\private" }));
  const newlineVersion = serializeNativeIdentityFailure(report({ electronRuntimeVersion: "43.8.3\n" }));

  for (const stderr of [
    "no diagnostic",
    `${NATIVE_IDENTITY_FAILURE_PREFIX}{not-json}`,
    withUnknownField,
    duplicateKey,
    nonCanonical,
    `${validLine}\n${validLine}`,
    invalidStage,
    invalidCode,
    invalidVersion,
    newlineVersion,
    `${NATIVE_IDENTITY_FAILURE_PREFIX}${"x".repeat(1025)}`,
    `${"x".repeat(8 * 1024 + 1)}\n${validLine}`,
  ]) assert.equal(parseNativeIdentityFailure(stderr), null);

  assert.equal(parseNativeIdentityFailure(validLine, { phase: "reload" }), null);
  assert.equal(parseNativeIdentityFailure(validLine, { expectedElectronVersion: "43.8.4" }), null);
  assert.equal(parseNativeIdentityFailure(Buffer.from(validLine)), null);

  const fallback = createNativeIdentityFailureReport({
    phase: "create",
    stage: "electron_startup",
    errorCode: "electron_process_failed",
    electronRuntimeVersion: null,
    nodeRuntimeVersion: null,
    expectedElectronVersion: "43.8.3",
  });
  assert.equal(formatNativeIdentityFailure(fallback),
    "Native identity smoke failed: phase=create stage=electron_startup code=electron_process_failed Electron=unknown Node=unknown expectedElectron=43.8.3.");
});

test("runtime and fingerprint validators require bounded complete stable values", () => {
  assert.equal(isNativeIdentityVersion("43.8.3"), true);
  assert.equal(isNativeIdentityVersion("22.23.4"), true);
  assert.equal(isNativeIdentityVersion(`1.1.${"1".repeat(60)}`), true);
  assert.equal(isNativeIdentityVersion(`1.1.${"1".repeat(61)}`), false);
  assert.equal(isNativeIdentityVersion("43.8.3\n"), false);
  assert.equal(isNativeIdentityVersion("43.8.3-beta.1"), false);

  assert.equal(isNativeIdentityFingerprint("a".repeat(64)), true);
  assert.equal(isNativeIdentityFingerprint("a".repeat(63)), false);
  assert.equal(isNativeIdentityFingerprint("a".repeat(63) + "\n"), false);
  assert.equal(isNativeIdentityFingerprint("A".repeat(64)), false);
});
