import { execFile } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { assertPlainDirectory } from './installer-ci-safety.mjs';

const exec = promisify(execFile);
const MAX_BYTES = 1024 * 1024;
const invalid = () => new Error('Installer registration inspection is unavailable.');

export function parseInstallerRegistrations(output) {
  if (typeof output !== 'string' || Buffer.byteLength(output, 'utf8') > MAX_BYTES) throw invalid();
  const entries = JSON.parse(output.replace(/^\uFEFF/, ''));
  if (!Array.isArray(entries)) throw invalid();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).sort().join(',') !== 'name,perUser,uninstall,version'
      || typeof entry.name !== 'string' || !/^SPS(?:\s|$)/i.test(entry.name)
      || typeof entry.perUser !== 'boolean'
      || !(entry.version === null || typeof entry.version === 'string')
      || !(entry.uninstall === null || typeof entry.uninstall === 'string')) throw invalid();
  }
  return entries;
}

// The restricted launcher supplies only its own already compiled executable.
// This fixed read-only subcommand never launches the installer or PowerShell.
export async function queryInstallerRegistrations({
  helper = process.env.SPS_INSTALLER_REGISTRY_QUERY_HELPER,
  temporaryRoot = os.tmpdir(), execute = exec,
} = {}) {
  if (typeof helper !== 'string' || !path.isAbsolute(helper)
    || path.basename(helper) !== 'RestrictedE2eRunner.exe') throw invalid();
  const directory = path.dirname(helper);
  const temp = await assertPlainDirectory(temporaryRoot);
  if (!/^sps-windows-e2e-helper-[a-f0-9]{32}$/.test(path.basename(directory))) throw invalid();
  const canonicalDirectory = await assertPlainDirectory(directory);
  if (path.dirname(canonicalDirectory).toLowerCase() !== temp.toLowerCase()
    || canonicalDirectory.toLowerCase() !== path.resolve(directory).toLowerCase()) throw invalid();
  const identity = async () => {
    const details = await lstat(helper, { bigint: true });
    if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1n
      || (await realpath(helper)).toLowerCase() !== path.resolve(helper).toLowerCase()) throw invalid();
    return [details.dev, details.ino, details.birthtimeNs, details.size, details.mtimeNs].join(':');
  };
  const before = await identity();
  const { stdout } = await execute(helper, ['--read-installer-registry'], {
    windowsHide: true, shell: false, timeout: 30000, maxBuffer: MAX_BYTES, encoding: 'utf8',
  });
  if (await identity() !== before) throw invalid();
  return parseInstallerRegistrations(stdout);
}
