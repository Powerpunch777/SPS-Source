import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("Native identity generation remains inactive outside its explicit isolated smoke", async () => {
  for (const name of ["main.mjs", "preload.cjs", "core-settings-preload.cjs", "core-settings-controller.mjs"]) {
    assert.doesNotMatch(await read(`../src/${name}`), /native-identity-(?:certificates|store)|createSpsNativeHostIdentity/);
  }
  const certificates = await read("../src/native-identity-certificates.mjs");
  assert.doesNotMatch(certificates, /node:(?:child_process|fs|tls)|safeStorage|setCertificateVerifyProc|certificate-error/);
});

test("Windows verification runs real secure-storage reload and preserves SDK synchronization", async () => {
  const manifest = JSON.parse(await read("../package.json"));
  assert.match(manifest.scripts["test:e2e:native-identity-storage"], /sync:plugin-sdk.*smoke-native-identity-storage\.mjs/);
  assert.match(await read("../../../.github/workflows/sps-verify.yml"), /run: npm run test:e2e:native-identity-storage/);
  const smoke = await read("../scripts/smoke-native-identity-storage.mjs");
  assert.match(smoke, /\["create", "reload"\]/);
  assert.match(smoke, /safeStorage\.isEncryptionAvailable\(\)/);
  assert.doesNotMatch(smoke, /--no-sandbox|new BrowserWindow|\.listen\(/);
});

test("declares and retains the certificate library and reflection license notices", async () => {
  const manifest = JSON.parse(await read("../package.json"));
  assert.equal(manifest.dependencies["@peculiar/x509"], "2.2.0");
  assert.equal(manifest.dependencies["reflect-metadata"], "0.2.2");
  assert.ok(manifest.build.files.includes("assets/**/*"));
  const notice = await read("../assets/NATIVE-PKI-NOTICE.txt");
  assert.match(notice, /Copyright \(c\) Peculiar Ventures/);
  assert.match(notice, /reflect-metadata 0\.2\.2/);
  assert.match(await read("../node_modules/@peculiar/x509/LICENSE"), /MIT License/);
  assert.match(await read("../node_modules/reflect-metadata/LICENSE"), /Apache License/);
  assert.match(await read("../node_modules/reflect-metadata/CopyrightNotice.txt"), /Microsoft Corporation/);
});
