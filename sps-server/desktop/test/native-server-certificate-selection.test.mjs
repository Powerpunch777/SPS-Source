import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import test from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { nativeServerCertificateServername, parseNativeServerCertificateServername }
  from "../src/native-server-certificate-selection.mjs";

test("server certificate SNI alias is canonical and commits to the exact DER leaf", async () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const identity = await createSpsNativeHostIdentity({ hostId: "11111111-1111-4111-8111-111111111111",
    hostnames: ["127.0.0.1"], notBefore: now - 60_000, notAfter: now + 3_600_000, issuerNotAfter: now + 7_200_000 });
  const alias = nativeServerCertificateServername(identity.server.certificatePem);
  const hash = createHash("sha256").update(new X509Certificate(identity.server.certificatePem).raw).digest("hex");
  assert.equal(alias, `${hash.slice(0, 32)}.${hash.slice(32)}.sps-native.invalid`);
  assert.deepEqual(parseNativeServerCertificateServername(alias), { reserved: true, valid: true, certificateSha256: hash });
  assert.deepEqual(parseNativeServerCertificateServername(`${"0".repeat(32)}.${"0".repeat(32)}.sps-native.invalid`),
    { reserved: true, valid: true, certificateSha256: "0".repeat(64) });
  assert.deepEqual(parseNativeServerCertificateServername(`not-an-alias.sps-native.invalid`), { reserved: true, valid: false });
  assert.equal(parseNativeServerCertificateServername("ordinary.example.test"), null);
});
