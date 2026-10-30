import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOpenSsl } from './helpers/native-tls-fixtures.mjs';

const OFFICIAL_OPENSSL = 'C:/Program Files/OpenSSL/bin/openssl.exe';

function error(code, message = 'private diagnostic detail') {
  const value = new Error(message);
  value.code = code;
  return value;
}

test('Windows resolver falls back to official image OpenSSL after PATH and Git probes fail', async () => {
  const calls = [];
  const probes = [];
  const exec = async (binary, args, options) => {
    calls.push({ binary, args, options });
    if (binary === 'git') throw error('ENOENT');
    if (binary === OFFICIAL_OPENSSL) return { stdout: 'OpenSSL 3.6.5 29 Sep 2026' };
    throw error('ENOENT');
  };

  const resolved = await resolveOpenSsl({
    exec,
    platform: 'win32',
    onProbe: probe => { probes.push(probe); },
  });

  assert.equal(resolved, OFFICIAL_OPENSSL);
  assert.equal(calls[0].binary, 'git');
  assert.deepEqual(calls[0].args, ['--exec-path']);
  assert.ok(calls.some(call => call.binary === 'openssl' && call.args[0] === 'version'));
  assert.equal(calls.at(-1).binary, OFFICIAL_OPENSSL);
  assert.deepEqual(probes.map(({ sourceLabel, outcome }) => [sourceLabel, outcome]), [
    ['git-exec-path', 'unavailable'],
    ['path', 'unavailable'],
    ['git-standard-mingw', 'unavailable'],
    ['git-standard-usr', 'unavailable'],
    ['official-image', 'ok'],
  ]);
  assert.ok(probes.every(probe => probe.elapsedMs >= 0 && probe.elapsedMs <= 5_000));
  assert.ok(probes.every(probe => Object.keys(probe).sort().join(',') === 'elapsedMs,outcome,sourceLabel'));
});

test('failed probes report only bounded fixed categories and ignore diagnostic callback failures', async () => {
  const probes = [];
  const exec = async (binary, args) => {
    if (binary === 'git') throw error('ETIMEDOUT', 'private Git output');
    if (binary === 'openssl') return { stdout: 'not OpenSSL: private output' };
    if (binary === OFFICIAL_OPENSSL) throw error('ENOENT', 'private official path');
    throw error('EACCES', 'private candidate path and output');
  };

  await assert.rejects(
    resolveOpenSsl({
      exec,
      platform: 'win32',
      onProbe(probe) {
        probes.push(probe);
        return Promise.reject(new Error('private callback failure'));
      },
    }),
    error => {
      assert.equal(error.message.includes('private'), false);
      assert.match(error.message, /git-exec-path:timeout/);
      assert.match(error.message, /path:invalid-version/);
      assert.match(error.message, /official-image:unavailable/);
      assert.match(error.message, /git-standard-mingw:other/);
      assert.match(error.message, /git-standard-usr:other/);
      return true;
    },
  );
  assert.ok(probes.length >= 5);
  assert.ok(probes.every(({ elapsedMs }) => Number.isInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 5_000));
  assert.equal(JSON.stringify(probes).includes('private'), false);
  assert.equal(JSON.stringify(probes).includes('C:\\Program Files'), false);
});
