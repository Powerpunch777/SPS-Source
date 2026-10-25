import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpsNativeInviteCode,
  parseSpsNativeInviteCode,
} from "../src/native-connection-invite.mjs";
import { createSpsRoutedInviteCode, parseSpsRoutedInviteCode } from "../src/invite.mjs";

const validRecord = Object.freeze({
  v: 2,
  kind: "sps.native-lan.pairing",
  hostId: "123e4567-e89b-42d3-a456-426614174000",
  origin: "https://host.example.test",
  spkiSha256: "a".repeat(64),
  // Opaque synthetic bytes exercise codec syntax only; they are not an X.509 certificate.
  serverCertificate: Buffer.from("synthetic public certificate bytes").toString("base64url"),
  pairingId: "987e6543-e21b-43d3-b456-426614174000",
  pairingSecret: Buffer.alloc(32, 7).toString("base64url"),
  issuedAt: 1_800_000_000_000,
  expiresAt: 1_800_000_060_000,
});

function encodeJson(json, prefix = "SPSLAN2-") {
  return `${prefix}${Buffer.from(json, "utf8").toString("base64url")}`;
}

function replacePayloadJson(code, transform) {
  const json = Buffer.from(code.slice("SPSLAN2-".length), "base64url").toString("utf8");
  return encodeJson(transform(json));
}

test("round-trips the exact fixed-order invitation record as a frozen value", () => {
  const original = { ...validRecord };
  const code = createSpsNativeInviteCode(validRecord);
  assert.match(code, /^SPSLAN2-[A-Za-z0-9_-]+$/);
  const parsed = parseSpsNativeInviteCode(code);
  assert.deepEqual(parsed, validRecord);
  assert.deepEqual(Object.keys(parsed), Object.keys(validRecord));
  assert.equal(Object.isFrozen(parsed), true);
  assert.deepEqual(validRecord, original);
  assert.equal(createSpsNativeInviteCode(validRecord), code);
});

test("does not accept or reinterpret the legacy routed invitation format", () => {
  assert.equal(parseSpsNativeInviteCode("SPS2-eyJ2IjoxfQ"), null);
  assert.throws(() => createSpsNativeInviteCode({ v: 1, hub: "https://host.example.test", code: "SPS-ABCD-EFGH" }), {
    name: "TypeError",
    message: "Invalid SPS native invitation record",
  });
});

test("distinguishes the rejected SPSLAN1 draft from the SPSLAN2 version-2 contract", () => {
  const v1Json = JSON.stringify(validRecord);
  const v1Record = { ...validRecord, v: 1 };
  assert.equal(parseSpsNativeInviteCode(encodeJson(JSON.stringify(v1Record), "SPSLAN1-")), null);
  assert.equal(parseSpsNativeInviteCode(encodeJson(v1Json, "SPSLAN1-")), null);
  assert.equal(parseSpsNativeInviteCode(encodeJson(JSON.stringify(v1Record))), null);
  assert.equal(parseSpsNativeInviteCode(createSpsNativeInviteCode(validRecord)).v, 2);
});

test("keeps native and legacy invitation formats separate in both directions", () => {
  const legacy = createSpsRoutedInviteCode("https://host.example.test", "SPS-AB12-CD34-EF56-GH78");
  assert.equal(parseSpsNativeInviteCode(legacy), null);
  assert.equal(parseSpsRoutedInviteCode(createSpsNativeInviteCode(validRecord)), null);
  assert.deepEqual(parseSpsRoutedInviteCode(legacy), {
    hub: "https://host.example.test", code: "SPS-AB12-CD34-EF56-GH78",
  });
});

test("accepts canonical IPv4 and IPv6 origin syntax without asserting connection trust", () => {
  for (const origin of ["https://192.0.2.10:31311", "https://[2001:db8::10]:31311"]) {
    const record = { ...validRecord, origin };
    const parsed = parseSpsNativeInviteCode(createSpsNativeInviteCode(record));
    assert.deepEqual(parsed, record);
    assert.equal(Object.hasOwn(parsed, "authorized"), false);
    assert.equal(Object.hasOwn(parsed, "connected"), false);
    assert.equal(Object.hasOwn(parsed, "authenticated"), false);
  }
});

test("accepts opaque synthetic certificate bytes without authenticating or validating X.509", () => {
  const opaque = Buffer.from("not an X.509 certificate").toString("base64url");
  const parsed = parseSpsNativeInviteCode(createSpsNativeInviteCode({ ...validRecord, serverCertificate: opaque }));
  assert.equal(parsed.serverCertificate, opaque);
  assert.equal(Object.hasOwn(parsed, "authorized"), false);
  assert.equal(Object.hasOwn(parsed, "connected"), false);
  assert.equal(Object.hasOwn(parsed, "authenticated"), false);
});

test("requires the exact own keys and a plain accessor-free data record", () => {
  for (const record of [null, [], new Date(), Object.create({ ...validRecord }), { ...validRecord, extra: true }]) {
    assert.throws(() => createSpsNativeInviteCode(record), /Invalid SPS native invitation record/);
  }

  const symbolRecord = { ...validRecord, [Symbol("extra")]: true };
  assert.throws(() => createSpsNativeInviteCode(symbolRecord), /Invalid SPS native invitation record/);

  let getterCalls = 0;
  const accessorRecord = { ...validRecord };
  Object.defineProperty(accessorRecord, "hostId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return validRecord.hostId;
    },
  });
  assert.throws(() => createSpsNativeInviteCode(accessorRecord), /Invalid SPS native invitation record/);
  assert.equal(getterCalls, 0);

  const nonEnumerableRecord = { ...validRecord };
  Object.defineProperty(nonEnumerableRecord, "hostId", { value: validRecord.hostId, enumerable: false });
  assert.throws(() => createSpsNativeInviteCode(nonEnumerableRecord), /Invalid SPS native invitation record/);
});

test("requires canonical lowercase UUIDs and SPKI SHA-256 hex", () => {
  for (const [key, value] of [
    ["hostId", "123E4567-E89B-42D3-A456-426614174000"],
    ["hostId", "123e4567e89b42d3a456426614174000"],
    ["pairingId", "not-a-uuid"],
    ["spkiSha256", "A".repeat(64)],
    ["spkiSha256", "a".repeat(63)],
  ]) {
    assert.throws(() => createSpsNativeInviteCode({ ...validRecord, [key]: value }), /Invalid SPS native invitation record/);
  }
});

test("requires a canonical HTTPS origin without paths, queries, or fragments", () => {
  for (const origin of [
    "http://host.example.test",
    "https://user:pass@host.example.test",
    "https://host.example.test/",
    "https://host.example.test/path",
    "https://host.example.test?query=1",
    "https://host.example.test#fragment",
    "https://host.example.test ",
    "https:\\\\host.example.test",
    "https://HOST.example.test",
    "https://host.example.test:443",
  ]) {
    assert.throws(() => createSpsNativeInviteCode({ ...validRecord, origin }), /Invalid SPS native invitation record/);
  }
});

test("rejects non-string code input, whitespace, and non-ASCII code characters", () => {
  for (const input of [null, undefined, 1, {}, ` ${createSpsNativeInviteCode(validRecord)}`, `${createSpsNativeInviteCode(validRecord)}\n`, "SPSLAN1-é"]) {
    assert.equal(parseSpsNativeInviteCode(input), null);
  }
});

test("enforces the 8192 ASCII-byte code limit in both directions", () => {
  const code = createSpsNativeInviteCode(validRecord);
  assert.ok(code.length <= 8192);
  assert.equal(parseSpsNativeInviteCode(`${code}${"A".repeat(8192 - code.length + 1)}`), null);

  const longOrigin = `https://${"a".repeat(7000)}.test`;
  assert.throws(() => createSpsNativeInviteCode({ ...validRecord, origin: longOrigin }), /Invalid SPS native invitation record/);
});

test("requires canonical unpadded base64url certificate bytes from 1 through 4096", () => {
  for (const certificateBytes of [Buffer.from([0]), Buffer.alloc(4096, 0xa5)]) {
    const serverCertificate = certificateBytes.toString("base64url");
    const code = createSpsNativeInviteCode({ ...validRecord, serverCertificate });
    assert.ok(code.length <= 8192);
    const parsed = parseSpsNativeInviteCode(code);
    assert.equal(parsed.serverCertificate, serverCertificate);
  }

  for (const serverCertificate of [
    "",
    "A",
    `${Buffer.from([1]).toString("base64url")}x`,
    `${Buffer.from([1]).toString("base64url")}==`,
    "+".repeat(16),
    Buffer.alloc(4097).toString("base64url"),
  ]) {
    assert.throws(
      () => createSpsNativeInviteCode({ ...validRecord, serverCertificate }),
      /Invalid SPS native invitation record/,
    );
  }
});

test("rejects overlong certificate text before base64 decoding", () => {
  const originalFrom = Buffer.from;
  const oversizedCertificate = "A".repeat(5463);
  const code = createSpsNativeInviteCode(validRecord);
  const oversizedCode = replacePayloadJson(code, (json) => {
    const record = JSON.parse(json);
    record.serverCertificate = oversizedCertificate;
    return JSON.stringify(record);
  });
  let decodeCalled = false;
  Buffer.from = (...args) => {
    if (args[0] === oversizedCertificate) decodeCalled = true;
    return originalFrom(...args);
  };
  try {
    assert.throws(
      () => createSpsNativeInviteCode({ ...validRecord, serverCertificate: "A".repeat(5463) }),
      /Invalid SPS native invitation record/,
    );
    assert.equal(parseSpsNativeInviteCode(oversizedCode), null);
    assert.equal(decodeCalled, false);
  } finally {
    Buffer.from = originalFrom;
  }
});

test("rejects noncanonical certificate encodings while parsing", () => {
  const code = createSpsNativeInviteCode(validRecord);
  for (const serverCertificate of ["AQ==", "A", Buffer.alloc(4097).toString("base64url")]) {
    const invalidCode = replacePayloadJson(code, (json) => {
      const record = JSON.parse(json);
      record.serverCertificate = serverCertificate;
      return JSON.stringify(record);
    });
    assert.equal(parseSpsNativeInviteCode(invalidCode), null);
  }
});

test("requires a 32-byte canonical unpadded base64url pairing secret", () => {
  for (const pairingSecret of ["", "A".repeat(42), `${validRecord.pairingSecret}=`, "+".repeat(43), "/".repeat(43)]) {
    assert.throws(() => createSpsNativeInviteCode({ ...validRecord, pairingSecret }), /Invalid SPS native invitation record/);
  }

  const padded = `SPSLAN2-${Buffer.from(JSON.stringify(validRecord), "utf8").toString("base64url")}`;
  const parsed = parseSpsNativeInviteCode(padded);
  assert.deepEqual(parsed, validRecord);
  const invalidSecret = replacePayloadJson(padded, (json) => json.replace(validRecord.pairingSecret, `${validRecord.pairingSecret}=`));
  assert.equal(parseSpsNativeInviteCode(invalidSecret), null);
});

test("bounds pairing secret length before decoding caller-provided data", () => {
  const originalFrom = Buffer.from;
  const oversizedSecret = "A".repeat(1024 * 1024);
  let oversizedSecretDecoded = false;
  Buffer.from = (...args) => {
    if (args[0] === oversizedSecret) oversizedSecretDecoded = true;
    return originalFrom(...args);
  };
  try {
    assert.throws(
      () => createSpsNativeInviteCode({ ...validRecord, pairingSecret: oversizedSecret }),
      /Invalid SPS native invitation record/,
    );
    assert.equal(oversizedSecretDecoded, false);
  } finally {
    Buffer.from = originalFrom;
  }
});

test("requires positive safe-integer timestamps and an increasing interval", () => {
  for (const [key, value] of [
    ["issuedAt", 0],
    ["issuedAt", -1],
    ["issuedAt", 1.5],
    ["issuedAt", Number.MAX_SAFE_INTEGER + 1],
    ["issuedAt", "1800000000000"],
    ["expiresAt", 0],
    ["expiresAt", 1_800_000_000_000],
    ["expiresAt", Number.POSITIVE_INFINITY],
  ]) {
    assert.throws(() => createSpsNativeInviteCode({ ...validRecord, [key]: value }), /Invalid SPS native invitation record/);
  }
});

test("does not make freshness or TTL policy decisions", () => {
  const elapsed = { ...validRecord, issuedAt: 1, expiresAt: 2 };
  assert.deepEqual(parseSpsNativeInviteCode(createSpsNativeInviteCode(elapsed)), elapsed);
});

test("rejects duplicate and escaped JSON keys and any noncanonical JSON byte form", () => {
  const code = createSpsNativeInviteCode(validRecord);
  assert.equal(parseSpsNativeInviteCode(replacePayloadJson(code, (json) => json.replace('"v":2', '"v":2,"v":2'))), null);
  assert.equal(parseSpsNativeInviteCode(replacePayloadJson(code, (json) => json.replace('"v":2', '"\\u0076":2'))), null);
  assert.equal(parseSpsNativeInviteCode(replacePayloadJson(code, (json) => ` ${json}`)), null);
  assert.equal(parseSpsNativeInviteCode(replacePayloadJson(code, (json) => json.replace('"origin":', '"origin" :'))), null);
});

test("rejects padded or otherwise noncanonical base64url payload encoding", () => {
  const code = createSpsNativeInviteCode(validRecord);
  assert.equal(parseSpsNativeInviteCode(`${code}=`), null);
  assert.equal(
    parseSpsNativeInviteCode(
      replacePayloadJson(code, (json) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(json)).reverse()))),
    ),
    null,
  );

  const encoded = code.slice("SPSLAN2-".length);
  const decoded = Buffer.from(encoded, "base64url");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  assert.equal(encoded.length % 4, 3);
  const lastIndex = alphabet.indexOf(encoded.at(-1));
  const alternative = `${encoded.slice(0, -1)}${alphabet[lastIndex ^ 1]}`;
  assert.equal(Buffer.from(alternative, "base64url").equals(decoded), true);
  assert.equal(parseSpsNativeInviteCode(`SPSLAN2-${alternative}`), null);
});

test("rejects a UTF-8 BOM before an otherwise canonical invitation JSON payload", () => {
  const json = Buffer.from(JSON.stringify(validRecord), "utf8");
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), json]);
  assert.equal(parseSpsNativeInviteCode(`SPSLAN2-${withBom.toString("base64url")}`), null);
});

test("rejects malformed UTF-8, UTF-16 payloads, NUL, and replacement characters", () => {
  for (const bytes of [
    Buffer.from([0xff, 0xfe, 0x7b]),
    Buffer.from(JSON.stringify(validRecord), "utf16le"),
    Buffer.from('{"bad":"\0"}', "utf8"),
    Buffer.from('{"bad":"\uFFFD"}', "utf8"),
  ]) {
    assert.equal(parseSpsNativeInviteCode(`SPSLAN2-${bytes.toString("base64url")}`), null);
  }
});

test("rejects malformed JSON, wrong schema values, and extra fields", () => {
  const code = createSpsNativeInviteCode(validRecord);
  assert.equal(parseSpsNativeInviteCode(encodeJson("{")), null);
  assert.equal(parseSpsNativeInviteCode(replacePayloadJson(code, (json) => json.replace('"v":2', '"v":1'))), null);
  assert.equal(parseSpsNativeInviteCode(replacePayloadJson(code, (json) => json.replace('"kind":"sps.native-lan.pairing"', '"kind":"other"'))), null);
  assert.equal(parseSpsNativeInviteCode(replacePayloadJson(code, (json) => json.replace('"expiresAt":', '"extra":true,"expiresAt":'))), null);
});

test("checks primitive fields before attempting URL parsing", () => {
  const originalURL = globalThis.URL;
  let urlCalls = 0;
  globalThis.URL = class extends originalURL {
    constructor(...args) {
      urlCalls += 1;
      super(...args);
    }
  };
  try {
    assert.throws(() => createSpsNativeInviteCode({ ...validRecord, spkiSha256: "bad" }), /Invalid SPS native invitation record/);
    assert.equal(urlCalls, 0);
  } finally {
    globalThis.URL = originalURL;
  }
});

test("returns null for invalid parse inputs without exposing parser errors", () => {
  const badPayload = `SPSLAN2-${Buffer.from("not json", "utf8").toString("base64url")}`;
  assert.equal(parseSpsNativeInviteCode(badPayload), null);
  assert.equal(parseSpsNativeInviteCode("SPSLAN2-%%%"), null);
});
