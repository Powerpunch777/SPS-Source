import assert from "node:assert/strict";
import { webcrypto, X509Certificate } from "node:crypto";
import test, { before } from "node:test";
import "reflect-metadata";
import {
  BasicConstraintsExtension, CertificatePolicyExtension, ExtendedKeyUsage,
  ExtendedKeyUsageExtension, KeyUsageFlags, KeyUsagesExtension,
  SubjectAlternativeNameExtension, SubjectKeyIdentifierExtension,
  X509CertificateGenerator,
} from "@peculiar/x509";
import { createSpsNativeHostIdentity, validateSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const START = Math.floor(Date.now() / 1000) * 1000 - 5_000;
const LEAF_END = START + 3_600_000;
const ISSUER_END = LEAF_END + 3_600_000;
const HOSTNAMES = ["127.0.0.1", "sps.test"];
const EXPECTED_SERVER_SUBJECT = `CN=SPS Native Host ${HOST}`;
const EXPECTED_ISSUER_SUBJECT = `CN=SPS Member Issuer ${HOST}`;
let serial = 1;
let baseline;

function encodePem(bytes, label) {
  const lines = Buffer.from(bytes).toString("base64").match(/.{1,64}/g);
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

async function makePair(options = {}) {
  const role = options.role ?? "server";
  const hostId = options.hostId ?? HOST;
  const curve = options.curve ?? "P-256";
  const keys = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: curve }, true, ["sign", "verify"],
  );
  const isIssuer = role === "issuer";
  const extensions = [
    new BasicConstraintsExtension(options.ca ?? isIssuer, isIssuer ? 0 : undefined, true),
    new KeyUsagesExtension(options.usages ?? (isIssuer
      ? KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign
      : KeyUsageFlags.digitalSignature), true),
    await SubjectKeyIdentifierExtension.create(keys.publicKey, options.skiCritical ?? false, webcrypto),
  ];
  if (!isIssuer) extensions.push(
    new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth], true),
    new SubjectAlternativeNameExtension(
      HOSTNAMES.map(value => ({ type: value === "127.0.0.1" ? "ip" : "dns", value })),
      options.sanCritical ?? false,
    ),
  );
  extensions.push(...(options.extraExtensions ?? []));

  const subject = options.subject ?? (isIssuer ? EXPECTED_ISSUER_SUBJECT : EXPECTED_SERVER_SUBJECT);
  const issuer = options.issuer ?? subject;
  const params = {
    serialNumber: (serial++).toString(16),
    notBefore: new Date(options.notBefore ?? START),
    notAfter: new Date(options.notAfter ?? (isIssuer ? ISSUER_END : LEAF_END)),
    signingAlgorithm: { name: "ECDSA", hash: options.signingHash ?? "SHA-256" },
    extensions,
  };
  const certificate = issuer === subject
    ? await X509CertificateGenerator.createSelfSigned({ ...params, name: subject, keys }, webcrypto)
    : await X509CertificateGenerator.create({
      ...params, subject, issuer, publicKey: keys.publicKey, signingKey: keys.privateKey,
    }, webcrypto);
  const privateDer = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", keys.privateKey));
  try {
    return {
      certificatePem: encodePem(certificate.rawData, "CERTIFICATE"),
      privateKeyPem: encodePem(privateDer, "PRIVATE KEY"),
    };
  } finally {
    privateDer.fill(0);
  }
}

function identityWith(pair, slot = "server") {
  return { ...baseline, [slot]: pair };
}

function assertInvalid(identity) {
  assert.throws(() => validateSpsNativeHostIdentity(identity), { code: "native_identity_invalid" });
}

before(async () => {
  baseline = await createSpsNativeHostIdentity({
    hostId: HOST, hostnames: HOSTNAMES, notBefore: START, notAfter: LEAF_END, issuerNotAfter: ISSUER_END,
  });
});

test("accepts generated identity as a baseline for adversarial certificate cases", () => {
  assert.equal(validateSpsNativeHostIdentity(baseline).hostId, HOST);
});

test("rejects a non-P-256 key and non-SHA-256 ECDSA signatures", async () => {
  assertInvalid(identityWith(await makePair({ curve: "P-384" })));
  assertInvalid(identityWith(await makePair({ signingHash: "SHA-384" })));
});

test("rejects CA constraints and usages in the server slot and server usage in the issuer slot", async () => {
  assertInvalid(identityWith(await makePair({
    ca: true, usages: KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign,
  })));
  assertInvalid(identityWith(await makePair({
    usages: KeyUsageFlags.digitalSignature | KeyUsageFlags.keyCertSign,
  })));
  assertInvalid(identityWith(await makePair({
    role: "issuer", usages: KeyUsageFlags.digitalSignature,
  }), "memberIssuer"));
});

test("rejects critical SKI or SAN extensions and unexpected certificate extensions", async () => {
  assertInvalid(identityWith(await makePair({ skiCritical: true })));
  assertInvalid(identityWith(await makePair({ sanCritical: true })));
  assertInvalid(identityWith(await makePair({
    extraExtensions: [new CertificatePolicyExtension(["1.3.6.1.4.1.55555.1"])],
  })));
});

test("rejects altered signatures, wrong subjects, and a distinct issuer name", async () => {
  const tampered = await makePair();
  const raw = Buffer.from(new X509Certificate(tampered.certificatePem).raw);
  raw[raw.length - 1] ^= 1;
  assertInvalid(identityWith({ ...tampered, certificatePem: encodePem(raw, "CERTIFICATE") }));

  const wrongSubject = await makePair({ subject: "CN=SPS Native Host 22222222-2222-4222-8222-222222222222" });
  assertInvalid(identityWith(wrongSubject));

  const wrongIssuer = await makePair({ issuer: "CN=Different Issuer" });
  assertInvalid(identityWith(wrongIssuer));
});

test("rejects issuer validity that does not contain the leaf validity", async () => {
  const issuerStartsLate = await makePair({ role: "issuer", notBefore: START + 1_000 });
  assertInvalid(identityWith(issuerStartsLate, "memberIssuer"));

  const issuerEndsEarly = await makePair({ role: "issuer", notAfter: LEAF_END - 1_000 });
  assertInvalid(identityWith(issuerEndsEarly, "memberIssuer"));
});

test("rejects SAN accessor and iterator properties without invoking them", async () => {
  let invoked = 0;
  const accessorNames = [];
  Object.defineProperty(accessorNames, "0", {
    enumerable: true,
    get() { invoked++; return "sps.test"; },
  });
  await assert.rejects(createSpsNativeHostIdentity({
    hostId: HOST, hostnames: accessorNames, notBefore: START, notAfter: LEAF_END, issuerNotAfter: ISSUER_END,
  }), { code: "native_identity_invalid_options" });
  assert.equal(invoked, 0);

  const iteratorNames = ["sps.test"];
  Object.defineProperty(iteratorNames, Symbol.iterator, {
    value() { invoked++; return ["sps.test"][Symbol.iterator](); },
  });
  await assert.rejects(createSpsNativeHostIdentity({
    hostId: HOST, hostnames: iteratorNames, notBefore: START, notAfter: LEAF_END, issuerNotAfter: ISSUER_END,
  }), { code: "native_identity_invalid_options" });
  assert.equal(invoked, 0);
});
