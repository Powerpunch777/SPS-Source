import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseInstallerProcessQuery, queryInstallerProcesses } from '../scripts/installer-process-query.mjs';

test('installer process query accepts only a nonnegative count and elapsed time', () => {
  assert.deepEqual(parseInstallerProcessQuery('{"count":0,"elapsedMs":17}'), { count: 0, elapsedMs: 17 });
  for (const invalid of [
    '[]', 'null', '{"count":-1,"elapsedMs":0}', '{"count":1.5,"elapsedMs":0}',
    '{"count":0,"elapsedMs":-1}', '{"count":0,"elapsedMs":9007199254740992}',
    '{"count":0,"elapsedMs":0,"pid":1}', '{"count":"0","elapsedMs":0}',
  ]) assert.throws(() => parseInstallerProcessQuery(invalid));
});

test('installer process query validates its owned helper and preserves native failures', async t => {
  // Hosted Windows can expose TEMP through an 8.3 alias. Valid fixtures must
  // use the canonical root, just like the compiled launcher's helper path.
  const temporaryParent = await realpath(os.tmpdir());
  const temporaryRoot = await mkdtemp(path.join(temporaryParent, 'installer-process-query-'));
  const temporaryRootIdentity = await lstat(temporaryRoot, { bigint: true });
  t.after(async () => {
    const resolvedRoot = path.resolve(temporaryRoot);
    const canonicalParent = await realpath(os.tmpdir());
    const canonicalRoot = await realpath(resolvedRoot);
    const current = await lstat(resolvedRoot, { bigint: true });
    const samePath = process.platform === 'win32'
      ? (value, expected) => value.toLowerCase() === expected.toLowerCase()
      : (value, expected) => value === expected;
    if (!/^installer-process-query-[a-z0-9-]+$/i.test(path.basename(resolvedRoot))
      || !samePath(path.dirname(resolvedRoot), canonicalParent)
      || !samePath(canonicalRoot, resolvedRoot)
      || !current.isDirectory() || current.isSymbolicLink()
      || current.dev !== temporaryRootIdentity.dev || current.ino !== temporaryRootIdentity.ino
      || current.birthtimeNs !== temporaryRootIdentity.birthtimeNs) {
      throw new Error('Refusing to remove a changed installer process test directory.');
    }
    await rm(resolvedRoot, { recursive: true, force: false });
  });
  const ownedDirectory = path.join(temporaryRoot, `sps-windows-e2e-helper-${'a'.repeat(32)}`);
  await mkdir(ownedDirectory);
  const helper = path.join(ownedDirectory, 'RestrictedE2eRunner.exe');
  await writeFile(helper, 'readonly test fixture');

  await assert.rejects(queryInstallerProcesses({ helper: path.join(temporaryRoot, 'other.exe'), temporaryRoot,
    execute: async () => { throw new Error('must not execute an unowned helper'); } }));
  const unownedDirectory = path.join(temporaryRoot, 'unowned-helper');
  await mkdir(unownedDirectory);
  const misplacedHelper = path.join(unownedDirectory, 'RestrictedE2eRunner.exe');
  await writeFile(misplacedHelper, 'unowned test fixture');
  await assert.rejects(queryInstallerProcesses({ helper: misplacedHelper, temporaryRoot,
    execute: async () => { throw new Error('must not execute a misplaced helper'); } }));

  let invocation;
  const result = await queryInstallerProcesses({ helper, temporaryRoot, execute: async (...args) => {
    invocation = args;
    return { stdout: '{"count":2,"elapsedMs":4}' };
  } });
  assert.deepEqual(result, { count: 2, elapsedMs: 4 });
  assert.deepEqual(invocation[0], helper);
  assert.deepEqual(invocation[1], ['--read-installer-processes']);
  assert.equal(invocation[2].shell, false);

  const nativeFailure = new Error('native readonly query failed');
  await assert.rejects(queryInstallerProcesses({ helper, temporaryRoot,
    execute: async () => { throw nativeFailure; } }), error => error === nativeFailure);

  await assert.rejects(queryInstallerProcesses({ helper, temporaryRoot, execute: async () => {
    await writeFile(helper, 'changed fixture identity');
    return { stdout: '{"count":0,"elapsedMs":0}' };
  } }));
});

test('installer process query rejects output containing private process details', () => {
  assert.throws(() => parseInstallerProcessQuery('{"count":1,"elapsedMs":2,"processId":42}'));
});
