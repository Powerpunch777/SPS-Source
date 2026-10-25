import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("the authoritative Native secure-storage smoke refuses an arbitrary runtime override", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL("../scripts/smoke-native-identity-storage.mjs", import.meta.url))], {
    env: { ...process.env, SPS_NATIVE_IDENTITY_SMOKE_ELECTRON_BINARY: "fixture-untrusted.exe" },
    windowsHide: true, timeout: 10_000,
  }), failure => {
    assert.match(failure.stderr, /runtime_override_disallowed/);
    assert.doesNotMatch(failure.stderr, /fixture-untrusted/);
    assert.doesNotMatch(failure.stdout, /realWindowsSafeStorage/);
    return true;
  });
});

test("only the trusted Core Settings confirmation can request Native identity preparation", async () => {
  assert.doesNotMatch(await read("../src/preload.cjs"), /prepareNativeIdentity|native-identity|core-settings-prepare/);
  assert.match(await read("../src/core-settings-preload.cjs"), /core-settings-prepare-native-identity/);
  const settings = await read("../src/core-settings-controller.mjs");
  assert.match(settings, /if \(await confirmNativeIdentity\(window, validated\)\) \{\s*assertSender\(event\);\s*await authorizeMutation\(\);\s*assertSender\(event\);/);
  const main = await read("../src/main.mjs");
  assert.doesNotMatch(main, /createSpsNativeHostIdentity\(/);
  assert.match(main, /buttons: \["Cancel", "Prepare identity"\], defaultId: 0, cancelId: 0/);
  assert.match(main, /nativeConnectivity: await ensureNativeIdentityController\(\)\.inspect\(\)/);
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
  assert.match(smoke, /createSpsNativeMemberPendingKeyStore\(memberStoreOptions\)/);
  assert.match(smoke, /report\.memberPendingSpkiSha256 !== created\.memberPendingSpkiSha256/);
  assert.match(smoke, /report\.memberIssuedCertificateSha256 !== created\.memberIssuedCertificateSha256/);
  assert.match(smoke, /await memberStore\.createIssued\(/);
  assert.match(smoke, /await memberStore\.readIssued\(\)/);
  assert.match(smoke, /sameMemberCertificateAfterRestart: true/);
  assert.match(smoke, /assert\.equal\(await anotherAccount\.read\(\), null\)/);
  assert.match(smoke, /assert\.rejects\(changedPin\.read\(\), \{ code: "ERR_SPS_NATIVE_MEMBER_PENDING_STORE_CORRUPT" \}\)/);
  assert.match(smoke, /if \(process\.versions\.electron\) \{\s*\/\/[^\n]*\n\s*void electronPhase\(\);/);
  assert.doesNotMatch(smoke, /await electronPhase\(\)/);
  assert.doesNotMatch(smoke, /--no-sandbox|new BrowserWindow|\.listen\(/);
});

test("the Native signer stays in owned Main-to-Core IPC, outside renderer and Plugin interfaces", async () => {
  for (const file of ["../src/preload.cjs", "../src/core-settings-preload.cjs", "../src/registry-preload.cjs",
    "../src/workspace-preload.cjs", "../src/plugin-preview-preload.cjs", "../src/official-extensions-preload.cjs"])
    assert.doesNotMatch(await read(file), /sps\.native\.signer|native-member-main-signer|native-member-signer-channel/);
  const main = await read("../src/main.mjs");
  assert.match(main, /createNativeSigner: \(\) => createSpsNativeMemberMainSigner/);
  assert.match(main, /generation: ownerVaultOperations\.connectionGeneration\(\)/);
  assert.match(main, /ownerVaultOperations\.isChangingConnection\(\)/);
  assert.match(main, /onInvalidation: \(\) => ownerHostManager\?\.invalidateNativeSigner\(\)/);
  assert.doesNotMatch(main, /ipcMain\.handle\(["'][^"']*(?:native.*sign|sign.*native)/);
  assert.doesNotMatch(main, /\.createIssued\(|\.readIssued\(/);
  const signer = await read("../src/native-member-main-signer.mjs");
  assert.doesNotMatch(signer, /createSpsNativeHostIdentity\(|\.writeFile\(|\.listen\(|setCertificateVerifyProc|process\.env/);
});

test("declares and retains the certificate library and reflection license notices", async () => {
  const manifest = JSON.parse(await read("../package.json"));
  assert.equal(manifest.dependencies["@peculiar/x509"], "2.2.0");
  assert.equal(manifest.dependencies["reflect-metadata"], "0.2.2");
  assert.equal(manifest.dependencies.asn1js, "3.0.10");
  assert.ok(manifest.build.files.includes("assets/**/*"));
  const notice = await read("../assets/NATIVE-PKI-NOTICE.txt");
  assert.match(notice, /Copyright \(c\) Peculiar Ventures/);
  assert.match(notice, /reflect-metadata 0\.2\.2/);
  assert.match(notice, /asn1js 3\.0\.10/);
  assert.match(notice, /Copyright \(c\) 2014, GMO GlobalSign/);
  assert.match(await read("../node_modules/@peculiar/x509/LICENSE"), /MIT License/);
  assert.match(await read("../node_modules/reflect-metadata/LICENSE"), /Apache License/);
  assert.match(await read("../node_modules/reflect-metadata/CopyrightNotice.txt"), /Microsoft Corporation/);
  assert.match(await read("../node_modules/asn1js/LICENSE"), /Redistribution and use in source and binary forms/);
});
