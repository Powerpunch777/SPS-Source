import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const hostModule = new URL("../src/native-identity-certificates.mjs", import.meta.url).href;
const memberModule = new URL("../src/native-member-certificates.mjs", import.meta.url).href;
const credentialModule = new URL("../src/native-member-credential.mjs", import.meta.url).href;

test("certificate helpers import without loading PKI and retain synchronous validated identity behavior", async () => {
  // Existing certificate tests import PKI fixtures eagerly. Use a fresh process
  // so they cannot hide an accidental startup dependency through require.cache.
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { X509Certificate } from 'node:crypto';
    const require = createRequire(${JSON.stringify(import.meta.url)});
    const loadedPki = () => Object.keys(require.cache).filter(file => /[\\\\/](?:@peculiar|asn1js|reflect-metadata)[\\\\/]/.test(file));
    assert.deepEqual(loadedPki(), []);
    const host = await import(${JSON.stringify(hostModule)});
    await import(${JSON.stringify(memberModule)});
    await import(${JSON.stringify(credentialModule)});
    assert.deepEqual(loadedPki(), [], 'Importing Desktop certificate helpers eagerly loaded PKI');
    const now = Math.floor(Date.now() / 1000) * 1000;
    const identity = await host.createSpsNativeHostIdentity({
      hostId: '11111111-1111-4111-8111-111111111111', hostnames: ['127.0.0.1'],
      notBefore: now - 1000, notAfter: now + 3600000, issuerNotAfter: now + 7200000,
    });
    assert.ok(loadedPki().length > 0);
    const validated = host.validateSpsNativeHostIdentity(identity);
    assert.equal(typeof validated?.then, 'undefined', 'Synchronous validator became asynchronous');
    assert.deepEqual(validated, identity);
    for (const pair of [validated.server, validated.memberIssuer]) {
      const certificate = new X509Certificate(pair.certificatePem);
      assert.equal(certificate.verify(certificate.publicKey), true);
    }
    assert.throws(() => host.validateSpsNativeHostIdentity({ ...identity, hostId: '22222222-2222-4222-8222-222222222222' }),
      error => error.code === 'native_identity_invalid');
    console.log('Deferred PKI loading and synchronous validation passed.');
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "--eval", script], { timeout: 60000, windowsHide: true });
  assert.match(stdout, /Deferred PKI loading and synchronous validation passed/);
});
