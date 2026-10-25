import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSpsNativeCertificateValidity,
  defaultSpsNativePairingIssue,
  SPS_NATIVE_ISSUER_CA_CERT_VALIDITY_DAYS,
  SPS_NATIVE_MEMBER_DEVICE_CERT_VALIDITY_DAYS,
  SPS_NATIVE_PAIRING_DEFAULT_TTL_MS,
  SPS_NATIVE_SERVER_CERT_VALIDITY_DAYS,
} from "../src/native-connection-policy.mjs";

test("uses the approved one-hour any-verified-user Native invitation defaults", () => {
  const issue = defaultSpsNativePairingIssue("host-user-fixture");
  assert.equal(SPS_NATIVE_PAIRING_DEFAULT_TTL_MS, 3_600_000);
  assert.deepEqual(issue, { actorUserId: "host-user-fixture", target: { kind: "any_verified_user" }, ttlMs: 3_600_000 });
  assert.equal(Object.isFrozen(issue), true);
  assert.equal(Object.isFrozen(issue.target), true);
});

test("does not invent a Host identity or accept unbounded user labels", () => {
  for (const value of [undefined, null, "", "  ", "user\n", "x".repeat(201), { actorUserId: "host" }]) {
    assert.throws(() => defaultSpsNativePairingIssue(value), TypeError);
  }
});

test("uses the approved frozen certificate validity defaults", () => {
  assert.equal(SPS_NATIVE_SERVER_CERT_VALIDITY_DAYS, 90);
  assert.equal(SPS_NATIVE_MEMBER_DEVICE_CERT_VALIDITY_DAYS, 90);
  assert.equal(SPS_NATIVE_ISSUER_CA_CERT_VALIDITY_DAYS, 365);
  assert.equal(Object.isFrozen(defaultSpsNativeCertificateValidity), true);

  for (const [certificateKind, validityDays] of [
    ["server", 90],
    ["member-device", 90],
    ["issuer-ca", 365],
  ]) {
    const validity = defaultSpsNativeCertificateValidity(certificateKind, 1_000);
    assert.deepEqual(validity, {
      certificateKind,
      validityDays,
      notBeforeEpochSeconds: 1,
      notAfterEpochSeconds: 1 + validityDays * 24 * 60 * 60,
    });
    assert.equal(Object.isFrozen(validity), true);
  }
});

test("rounds both certificate boundaries down to whole X.509 seconds", () => {
  const validity = defaultSpsNativeCertificateValidity("server", 1_999);
  assert.equal(validity.notBeforeEpochSeconds, 1);
  assert.equal(validity.notAfterEpochSeconds, 1 + 90 * 24 * 60 * 60);
});

test("requires a valid explicit current epoch-millisecond value", () => {
  for (const value of [undefined, null, "1000", NaN, Infinity, -Infinity, 1.5]) {
    assert.throws(() => defaultSpsNativeCertificateValidity("server", value), TypeError);
  }
  for (const value of [-1, 0, 999, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => defaultSpsNativeCertificateValidity("server", value), RangeError);
  }
  for (const kind of ["unknown", "__proto__", "constructor"]) {
    assert.throws(() => defaultSpsNativeCertificateValidity(kind, 1_000), TypeError);
  }
  assert.throws(() => defaultSpsNativeCertificateValidity("server"), TypeError);
});

test("accepts the exact maximum date boundary and rejects expiry overflow", () => {
  const maxDateEpochMs = Date.UTC(9999, 11, 31, 23, 59, 59);
  const validityMs = 90 * 24 * 60 * 60 * 1_000;
  const boundary = defaultSpsNativeCertificateValidity("server", maxDateEpochMs - validityMs);
  assert.equal(boundary.notAfterEpochSeconds, maxDateEpochMs / 1_000);
  assert.throws(
    () => defaultSpsNativeCertificateValidity("server", maxDateEpochMs - validityMs + 1_000),
    RangeError,
  );
});
