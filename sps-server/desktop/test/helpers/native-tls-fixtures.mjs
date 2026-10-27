import { createHash, X509Certificate } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, lstat, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isIP } from 'node:net';

const execFileAsync = promisify(execFile);
const TEMP_PREFIX = 'sps-native-tls-';
const WINDOWS_OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe';
const OPENSSL_VERSION_TIMEOUT_MS = 5_000;
const OPENSSL_COMMAND_TIMEOUT_MS = 10_000;
const OPENSSL_MAX_BUFFER_BYTES = 1024 * 1024;

function validDnsName(value) {
  const name = value.startsWith('*.') ? value.slice(2) : value;
  if (!name || name.length > 253) return false;
  return name.split('.').every((label) => (
    label.length <= 63
    && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)
  ));
}

function validateSan(san) {
  if (typeof san !== 'string' || san.length === 0) {
    throw new TypeError('san must be a non-empty comma-separated DNS/IP list');
  }

  const entries = san.split(',');
  if (entries.some((entry) => {
    const separator = entry.indexOf(':');
    if (separator < 1) return true;
    const type = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (type === 'DNS') return !validDnsName(value);
    if (type === 'IP') return isIP(value) === 0;
    return true;
  })) {
    throw new TypeError('san may contain only valid DNS: and IP: entries');
  }

  return entries.join(',');
}

async function invokeOpenSsl(binary, args, cwd) {
  try {
    return await execFileAsync(binary, args, {
      cwd,
      windowsHide: true,
      encoding: 'utf8',
      timeout: OPENSSL_COMMAND_TIMEOUT_MS,
      maxBuffer: OPENSSL_MAX_BUFFER_BYTES,
    });
  } catch (error) {
    const detail = error.stderr?.trim();
    const limit = error.killed
      ? ` (timed out after ${OPENSSL_COMMAND_TIMEOUT_MS}ms or exceeded the output limit)`
      : '';
    throw new Error(
      `OpenSSL ${args[0]} failed${limit}${detail ? `: ${detail}` : ''}`,
      { cause: error },
    );
  }
}

async function resolveOpenSsl() {
  const candidates = ['openssl'];
  if (process.platform === 'win32') {
    // Git for Windows carries its own MSYS/MinGW tools, but their location
    // differs between runner images. Derive only the two known OpenSSL
    // locations from Git's bounded, shell-free --exec-path response.
    try {
      const { stdout } = await execFileAsync('git', ['--exec-path'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: OPENSSL_VERSION_TIMEOUT_MS,
        maxBuffer: 4096,
      });
      const gitExecPath = stdout.trim();
      if (path.isAbsolute(gitExecPath)
        && path.basename(gitExecPath).toLowerCase() === 'git-core'
        && path.basename(path.dirname(gitExecPath)).toLowerCase() === 'libexec') {
        const mingwRoot = path.resolve(gitExecPath, '..', '..');
        if (path.basename(mingwRoot).toLowerCase() === 'mingw64') {
          const gitRoot = path.dirname(mingwRoot);
          candidates.push(
            path.join(mingwRoot, 'bin', 'openssl.exe'),
            path.join(gitRoot, 'usr', 'bin', 'openssl.exe'),
          );
        }
      }
    } catch {
      // Fall back to the known standard Git for Windows locations below.
    }
    candidates.push(
      'C:/Program Files/Git/mingw64/bin/openssl.exe',
      WINDOWS_OPENSSL,
    );
  }

  const uniqueCandidates = [...new Map(candidates.map(candidate => [
    process.platform === 'win32' ? path.resolve(candidate).toLowerCase() : candidate,
    candidate,
  ])).values()];

  for (const candidate of uniqueCandidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ['version'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: OPENSSL_VERSION_TIMEOUT_MS,
        maxBuffer: OPENSSL_MAX_BUFFER_BYTES,
      });
      if (/^OpenSSL\s/i.test(stdout)) return candidate;
    } catch {
      // Try the next supported executable location.
    }
  }

  const locationHint = process.platform === 'win32'
    ? ` on PATH or at ${WINDOWS_OPENSSL}`
    : ' on PATH';
  throw new Error(`OpenSSL is required to create native TLS test fixtures; install it${locationHint}.`);
}

function pathsEqual(left, right) {
  const a = path.normalize(left);
  const b = path.normalize(right);
  return process.platform === 'win32'
    ? a.toLocaleLowerCase('en-US') === b.toLocaleLowerCase('en-US')
    : a === b;
}

function opensslUtcTime(date) {
  const twoDigits = (value) => String(value).padStart(2, '0');
  return `${String(date.getUTCFullYear()).padStart(4, '0')}`
    + `${twoDigits(date.getUTCMonth() + 1)}${twoDigits(date.getUTCDate())}`
    + `${twoDigits(date.getUTCHours())}${twoDigits(date.getUTCMinutes())}`
    + `${twoDigits(date.getUTCSeconds())}Z`;
}

async function removeOwnedDirectory(directory, tempRoot) {
  const resolvedRoot = path.resolve(tempRoot);
  const resolvedTarget = path.resolve(directory);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  const targetName = path.basename(resolvedTarget);

  if (
    !path.isAbsolute(directory)
    || !pathsEqual(directory, resolvedTarget)
    || !relative
    || path.isAbsolute(relative)
    || relative.startsWith(`..${path.sep}`)
    || relative !== targetName
    || !targetName.startsWith(TEMP_PREFIX)
    || !pathsEqual(path.dirname(resolvedTarget), resolvedRoot)
  ) {
    throw new Error('Refusing to remove a TLS fixture directory outside its owned temp child.');
  }

  let targetStat;
  try {
    targetStat = await lstat(resolvedTarget);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error('Refusing to remove a TLS fixture path that is no longer its owned directory.');
  }

  const [actualRoot, actualTarget] = await Promise.all([
    realpath(resolvedRoot),
    realpath(resolvedTarget),
  ]);
  if (
    !pathsEqual(actualRoot, resolvedRoot)
    || !pathsEqual(actualTarget, resolvedTarget)
    || !pathsEqual(path.dirname(actualTarget), actualRoot)
  ) {
    throw new Error('Refusing to remove a TLS fixture directory whose resolved path changed.');
  }

  await rm(resolvedTarget, { recursive: true, force: true });
}

export async function createNativeTlsFixture({
  expired = false,
  san = 'DNS:localhost,IP:127.0.0.1,IP:::1',
  ca = false,
  usage = 'serverAuth',
} = {}) {
  if (typeof expired !== 'boolean') {
    throw new TypeError('expired must be a boolean');
  }
  if (typeof ca !== 'boolean') {
    throw new TypeError('ca must be a boolean');
  }
  if (usage !== 'serverAuth' && usage !== 'clientAuth') {
    throw new TypeError('usage must be either serverAuth or clientAuth');
  }
  const subjectAltName = validateSan(san);
  const openssl = await resolveOpenSsl();
  const tempRoot = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(tempRoot, TEMP_PREFIX));
  const resolvedDirectory = path.resolve(directory);
  let disposed = false;

  const dispose = async () => {
    if (disposed) return;
    await removeOwnedDirectory(resolvedDirectory, tempRoot);
    disposed = true;
  };

  try {
    const keyPath = path.join(resolvedDirectory, 'key.pem');
    const requestPath = path.join(resolvedDirectory, 'request.pem');
    const certPath = path.join(resolvedDirectory, 'cert.pem');
    const extensionsPath = path.join(resolvedDirectory, 'extensions.cnf');
    const extensions = [
      '[server_cert]',
      `basicConstraints = critical,CA:${ca ? 'TRUE' : 'FALSE'}`,
      `keyUsage = critical,${ca ? 'keyCertSign,cRLSign' : 'digitalSignature'}`,
      `extendedKeyUsage = ${usage}`,
      `subjectAltName = ${subjectAltName}`,
      '',
    ].join('\n');

    await writeFile(extensionsPath, extensions, { encoding: 'utf8', mode: 0o600 });
    await invokeOpenSsl(openssl, [
      'genpkey', '-algorithm', 'EC', '-pkeyopt', 'ec_paramgen_curve:P-256', '-out', keyPath,
    ], resolvedDirectory);
    await invokeOpenSsl(openssl, [
      'req', '-new', '-key', keyPath, '-subj', '/CN=localhost', '-out', requestPath,
    ], resolvedDirectory);
    if (expired) {
      await mkdir(path.join(resolvedDirectory, 'newcerts'));
      await writeFile(path.join(resolvedDirectory, 'index.txt'), '', 'utf8');
      await writeFile(path.join(resolvedDirectory, 'serial.txt'), '1000\n', 'utf8');
      await writeFile(path.join(resolvedDirectory, 'ca.cnf'), [
        '[ca]',
        'default_ca = local_ca',
        '[local_ca]',
        'database = index.txt',
        'serial = serial.txt',
        'new_certs_dir = newcerts',
        'default_md = sha256',
        'policy = policy_any',
        'unique_subject = no',
        '[policy_any]',
        'commonName = supplied',
        '',
      ].join('\n'), 'utf8');

      const now = Date.now();
      await invokeOpenSsl(openssl, [
        'ca', '-batch', '-notext', '-selfsign',
        '-config', path.join(resolvedDirectory, 'ca.cnf'),
        '-in', requestPath, '-keyfile', keyPath,
        '-startdate', opensslUtcTime(new Date(now - 2 * 24 * 60 * 60 * 1000)),
        '-enddate', opensslUtcTime(new Date(now - 24 * 60 * 60 * 1000)),
        '-extfile', extensionsPath, '-extensions', 'server_cert', '-out', certPath,
      ], resolvedDirectory);
    } else {
      await invokeOpenSsl(openssl, [
        'x509', '-req', '-in', requestPath, '-signkey', keyPath,
        '-days', '2',
        '-extfile', extensionsPath, '-extensions', 'server_cert', '-out', certPath,
      ], resolvedDirectory);
    }

    const [certPem, keyPem] = await Promise.all([
      readFile(certPath, 'utf8'),
      readFile(keyPath, 'utf8'),
    ]);
    const certificate = new X509Certificate(certPem);
    const notBefore = Date.parse(certificate.validFrom);
    const notAfter = Date.parse(certificate.validTo);
    const now = Date.now();

    if (
      !Number.isFinite(notBefore)
      || !Number.isFinite(notAfter)
      || (expired ? notAfter >= now : notBefore > now || notAfter <= now)
    ) {
      throw new Error(`OpenSSL produced a certificate with unexpected validity dates: ${certificate.validFrom} to ${certificate.validTo}`);
    }
    if (certificate.ca !== ca) {
      throw new Error(`OpenSSL produced a certificate with unexpected CA status: expected ${ca}, received ${certificate.ca}.`);
    }
    if (!certificate.subjectAltName) {
      throw new Error('OpenSSL produced a certificate without a SAN extension.');
    }
    const expectedEku = usage === 'serverAuth'
      ? '1.3.6.1.5.5.7.3.1'
      : '1.3.6.1.5.5.7.3.2';
    if (!certificate.keyUsage?.includes(expectedEku)) {
      throw new Error(`OpenSSL produced a certificate without the expected ${usage} EKU.`);
    }

    const spkiDer = certificate.publicKey.export({ type: 'spki', format: 'der' });
    return {
      certPem,
      keyPem,
      serverCertificate: certificate.raw.toString('base64url'),
      spkiSha256: createHash('sha256').update(spkiDer).digest('hex'),
      dispose,
    };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'TLS fixture creation failed and its temp directory could not be removed.');
    }
    throw error;
  }
}
