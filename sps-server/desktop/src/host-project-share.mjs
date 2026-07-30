import { constants, createCipheriv, publicEncrypt, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const SHARE_NAME_PREFIX = "SPS_";
const LOCAL_ACCOUNT_PREFIX = "spsws_";
const SAFE_SHARE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
// Windows local account names have a hard 20-character limit. Keep the
// generated Node suffix short enough for the Host share worker to provision it.
const SAFE_LOCAL_ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
const SAFE_TAILNET_HOSTNAME = /^[a-z0-9][a-z0-9.-]*\.ts\.net$/;

// RSA-OAEP alone cannot safely carry a full UNC path, account and generated
// password on every valid 2048-bit Node key. Keep the transport key as the
// key-encryption key and encrypt the credential payload with a fresh AES key.
export const SPS_HOST_SHARE_CREDENTIAL_ALGORITHM = "rsa-oaep-sha256+a256gcm";

export function spsHostProjectShareName(projectId) {
  const suffix = String(projectId ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 48);
  if (!suffix) throw new Error("SPS project source sharing requires a valid project identifier.");
  return `${SHARE_NAME_PREFIX}${suffix}`;
}

export function spsHostProjectSharePath(hostname, shareName) {
  const normalizedHostname = String(hostname ?? "").trim().toLowerCase().replace(/\.+$/, "");
  if (!SAFE_TAILNET_HOSTNAME.test(normalizedHostname)) {
    throw new Error("SPS Host project sharing requires this Owner Host's Tailscale MagicDNS hostname.");
  }
  if (!SAFE_SHARE_NAME.test(String(shareName ?? ""))) {
    throw new Error("SPS Host project sharing generated an invalid Windows share name.");
  }
  return `\\\\${normalizedHostname}\\${shareName}`;
}

export function createSpsHostProjectShareCredential(nodeId, random = randomBytes) {
  const nodeSuffixLength = 20 - LOCAL_ACCOUNT_PREFIX.length;
  const nodeSuffix = String(nodeId ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, nodeSuffixLength).toLowerCase();
  if (!nodeSuffix) throw new Error("Choose a valid SPS Member Node before granting project source access.");
  const username = `${LOCAL_ACCOUNT_PREFIX}${nodeSuffix}`;
  if (!SAFE_LOCAL_ACCOUNT.test(username)) throw new Error("SPS generated an invalid Windows project-share account name.");
  // Avoid whitespace and shell metacharacters. The password travels through
  // net.exe stdin, not a process argument, but this also makes Windows local
  // account provisioning predictable across supported versions.
  const password = random(30).toString("base64url");
  return { username, password };
}

export function sealSpsHostProjectShareCredential(input) {
  const sharePath = String(input?.sharePath ?? "").trim();
  const username = String(input?.username ?? "").trim();
  const password = String(input?.password ?? "");
  const publicKey = String(input?.transportPublicKey ?? "").trim();
  if (!sharePath.startsWith("\\\\") || !SAFE_LOCAL_ACCOUNT.test(username) || password.length < 16 || !publicKey.includes("BEGIN PUBLIC KEY")) {
    throw new Error("SPS cannot create this Member Node's encrypted project source credential.");
  }
  try {
    const plaintext = Buffer.from(JSON.stringify({
      version: 1,
      sharePath,
      username: input.hostAccountName ? `${input.hostAccountName}\\${username}` : username,
      password,
    }), "utf8");
    const contentEncryptionKey = randomBytes(32);
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", contentEncryptionKey, initializationVector);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const encryptedKey = publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      contentEncryptionKey,
    );
    return Buffer.from(JSON.stringify({
      version: 2,
      encryptedKey: encryptedKey.toString("base64"),
      initializationVector: initializationVector.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authenticationTag: cipher.getAuthTag().toString("base64"),
    }), "utf8").toString("base64");
  } catch {
    throw new Error("SPS could not encrypt project source access for this Member Node.");
  }
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

const HOST_SHARE_WORKER = String.raw`
param([Parameter(Mandatory = $true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$sourcePath = [System.IO.Path]::GetFullPath([string]$config.sourcePath)
$shareName = [string]$config.shareName
$accountName = [string]$config.accountName
$password = [string]$config.password
$action = [string]$config.action
$resultPath = [string]$config.resultPath
function Write-SpsHostShareResult([bool]$Ok, [string]$Reason = '') {
  if ([string]::IsNullOrWhiteSpace($resultPath)) { return }
  $payload = [pscustomobject]@{ ok = $Ok; reason = $Reason } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($resultPath, $payload, [System.Text.UTF8Encoding]::new($false))
}
trap {
  $reason = [string]$_.Exception.Message
  if ([string]::IsNullOrWhiteSpace($reason)) { $reason = 'The elevated Windows share worker failed without a diagnostic message.' }
  Write-SpsHostShareResult $false $reason
  exit 1
}
if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) { throw 'SPS project source folder no longer exists.' }
if ($shareName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$') { throw 'Invalid SPS project share name.' }
if ($accountName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') { throw 'Invalid SPS project share account.' }
$qualifiedAccount = "$env:COMPUTERNAME\$accountName"
if ($action -eq 'grant') {
  $secure = ConvertTo-SecureString $password -AsPlainText -Force
  $localUser = Get-LocalUser -Name $accountName -ErrorAction SilentlyContinue
  if ($null -eq $localUser) {
    New-LocalUser -Name $accountName -Password $secure -AccountNeverExpires -PasswordNeverExpires | Out-Null
  } else {
    Enable-LocalUser -Name $accountName
    Set-LocalUser -Name $accountName -Password $secure -PasswordNeverExpires $true
  }
  $service = Get-Service -Name 'LanmanServer' -ErrorAction Stop
  if ($service.Status -ne 'Running') { Start-Service -Name 'LanmanServer' }
  $share = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
  if ($null -eq $share) {
    New-SmbShare -Name $shareName -Path $sourcePath -ChangeAccess $qualifiedAccount | Out-Null
  } elseif ([System.IO.Path]::GetFullPath($share.Path) -ne $sourcePath) {
    throw 'An existing Windows share has the SPS share name but points to a different folder.'
  }
  Grant-SmbShareAccess -Name $shareName -AccountName $qualifiedAccount -AccessRight Change -Force | Out-Null
  & icacls.exe $sourcePath /grant "$($qualifiedAccount):(OI)(CI)M" /t /c | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Windows could not grant the SPS project-share account access to every source file.' }
  $rule = Get-NetFirewallRule -DisplayName 'SPS Host Project SMB (Tailscale)' -ErrorAction SilentlyContinue
  if ($null -eq $rule) {
    New-NetFirewallRule -DisplayName 'SPS Host Project SMB (Tailscale)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 445 -RemoteAddress '100.64.0.0/10' -Profile Any | Out-Null
  }
  Write-SpsHostShareResult $true ''
  [pscustomobject]@{ action = 'grant'; shareName = $shareName; accountName = $accountName } | ConvertTo-Json -Compress
  exit 0
}
if ($action -eq 'revoke') {
  $share = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
  if ($null -ne $share) {
    Revoke-SmbShareAccess -Name $shareName -AccountName $qualifiedAccount -Force -ErrorAction SilentlyContinue | Out-Null
  }
  & icacls.exe $sourcePath /remove:g $qualifiedAccount /t /c | Out-Null
  Disable-LocalUser -Name $accountName -ErrorAction SilentlyContinue
  Write-SpsHostShareResult $true ''
  [pscustomobject]@{ action = 'revoke'; shareName = $shareName; accountName = $accountName } | ConvertTo-Json -Compress
  exit 0
}
throw 'Invalid SPS Host project share action.'
`;

async function runPowerShell(command, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(options.command ?? "powershell.exe", command, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk.toString("utf8")}`.slice(-8_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk.toString("utf8")}`.slice(-8_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) return resolve(stdout);
      const detail = stderr.replace(/\s+/g, " ").trim() || stdout.replace(/\s+/g, " ").trim();
      reject(new Error(detail ? `Windows could not update SPS project source access: ${detail}` : "Windows could not update SPS project source access."));
    });
  });
}

export async function updateSpsHostProjectShareWindowsAccess(input, options = {}) {
  if ((options.platform ?? process.platform) !== "win32") {
    throw new Error("SPS Host project source sharing currently requires Windows on the Owner Host.");
  }
  const rawSourcePath = String(input?.sourcePath ?? "").trim();
  const sourcePath = rawSourcePath ? path.resolve(rawSourcePath) : "";
  const shareName = String(input?.shareName ?? "").trim();
  const accountName = String(input?.accountName ?? "").trim();
  const password = String(input?.password ?? "");
  const action = input?.action === "revoke" ? "revoke" : "grant";
  if (!rawSourcePath || !sourcePath || !SAFE_SHARE_NAME.test(shareName) || !SAFE_LOCAL_ACCOUNT.test(accountName) || (action === "grant" && password.length < 16)) {
    throw new Error("SPS Host project source access request is incomplete.");
  }
  const sourceInfo = await (options.stat ?? fs.stat)(sourcePath).catch(() => null);
  if (!sourceInfo?.isDirectory()) throw new Error("The selected SPS project source folder is not available on this Owner Host.");

  const random = options.random ?? randomBytes;
  const temporaryRoot = options.temporaryRoot ?? os.tmpdir();
  const nonce = random(16).toString("hex");
  const configPath = path.join(temporaryRoot, `sps-host-project-share-${nonce}.json`);
  const workerPath = path.join(temporaryRoot, `sps-host-project-share-${nonce}.ps1`);
  const resultPath = path.join(temporaryRoot, `sps-host-project-share-${nonce}.result.json`);
  const readWorkerDiagnostic = async () => {
    const raw = await fs.readFile(resultPath, "utf8").catch(() => "");
    if (!raw.trim()) return "";
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.ok === true) return "";
      const reason = String(parsed?.reason ?? "").replaceAll(password, "[redacted]").replace(/\s+/g, " ").trim();
      return reason.slice(0, 1000);
    } catch {
      return "The elevated Windows share worker returned an unreadable diagnostic.";
    }
  };
  await fs.writeFile(configPath, JSON.stringify({ sourcePath, shareName, accountName, password, action, resultPath }), { encoding: "utf8", mode: 0o600 });
  await fs.writeFile(workerPath, HOST_SHARE_WORKER, { encoding: "utf8", mode: 0o600 });
  try {
    const elevatedScript = [
      "$ErrorActionPreference = 'Stop'",
      `$result = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','${escapePowerShellSingleQuoted(workerPath)}','-ConfigPath','${escapePowerShellSingleQuoted(configPath)}')`,
      "exit $result.ExitCode",
    ].join("; ");
    const run = options.runPowerShell ?? runPowerShell;
    await run(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", elevatedScript], options);
    const diagnostic = await readWorkerDiagnostic();
    if (diagnostic) throw new Error(`Windows could not update SPS project source access: ${diagnostic}`);
    return { sourcePath, shareName, accountName, action };
  } catch (error) {
    const diagnostic = await readWorkerDiagnostic();
    if (diagnostic && !String(error?.message ?? "").includes(diagnostic)) {
      throw new Error(`${String(error?.message ?? "Windows could not update SPS project source access.")}: ${diagnostic}`);
    }
    throw error;
  } finally {
    await Promise.all([
      fs.rm(configPath, { force: true }).catch(() => undefined),
      fs.rm(workerPath, { force: true }).catch(() => undefined),
      fs.rm(resultPath, { force: true }).catch(() => undefined),
    ]);
  }
}
