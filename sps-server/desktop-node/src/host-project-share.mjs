import { constants, createDecipheriv, privateDecrypt } from "node:crypto";
import { spawn } from "node:child_process";

const UNC_SHARE_PATH = /^\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+(?:\\|$)/;
const LOCAL_SHARE_ACCOUNT = /^(?:[^\\/:*?"<>|]+\\)?[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SUPPORTED_CREDENTIAL_ALGORITHMS = new Set(["rsa-oaep-sha256", "rsa-oaep-sha256+a256gcm"]);
const BASE64_VALUE = /^[A-Za-z0-9+/]+={0,2}$/;

function readEnvelopeValue(value, expectedSharePath) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("SPS Desktop received an invalid Host Workspace Source access descriptor.");
  }
  if (
    (value.kind !== "sps_host_share" && value.kind !== "sps_workspace_source")
    || !SUPPORTED_CREDENTIAL_ALGORITHMS.has(value.credentialAlgorithm)
  ) {
    throw new Error("SPS Desktop received an unsupported Host Workspace Source access descriptor.");
  }
  if (typeof value.sharePath !== "string" || !UNC_SHARE_PATH.test(value.sharePath.trim())) {
    throw new Error("SPS Desktop received an invalid Host project share path.");
  }
  if (expectedSharePath && value.sharePath.trim().toLowerCase() !== expectedSharePath.trim().toLowerCase()) {
    throw new Error("SPS Desktop rejected a Host project share path that did not match the command workspace.");
  }
  if (typeof value.credentialEnvelope !== "string" || !BASE64_VALUE.test(value.credentialEnvelope)) {
    throw new Error("SPS Desktop received an invalid encrypted Host project share credential.");
  }
  return value;
}

export function decryptSpsWorkspaceSourceCredential(workspaceAccess, transportPrivateKeyPem, expectedSharePath = null) {
  const descriptor = readEnvelopeValue(workspaceAccess, expectedSharePath);
  if (typeof transportPrivateKeyPem !== "string" || !transportPrivateKeyPem.includes("BEGIN PRIVATE KEY")) {
    throw new Error("This SPS Desktop Node has no transport key for Host project source access. Reconnect this computer as an SPS Node.");
  }
  let plaintext;
  try {
    const decryptKey = (encryptedKey) => privateDecrypt(
      {
        key: transportPrivateKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(encryptedKey, "base64"),
    );
    if (descriptor.credentialAlgorithm === "rsa-oaep-sha256") {
      plaintext = decryptKey(descriptor.credentialEnvelope).toString("utf8");
    } else {
      const envelope = JSON.parse(Buffer.from(descriptor.credentialEnvelope, "base64").toString("utf8"));
      if (
        envelope?.version !== 2
        || ![envelope.encryptedKey, envelope.initializationVector, envelope.ciphertext, envelope.authenticationTag].every((value) => typeof value === "string" && BASE64_VALUE.test(value))
      ) {
        throw new Error("Invalid hybrid envelope");
      }
      const contentEncryptionKey = decryptKey(envelope.encryptedKey);
      if (contentEncryptionKey.length !== 32) throw new Error("Invalid content-encryption key");
      const decipher = createDecipheriv("aes-256-gcm", contentEncryptionKey, Buffer.from(envelope.initializationVector, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64"));
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    }
  } catch {
    throw new Error("SPS Desktop could not decrypt this Host project source credential. Ask the Owner Host to grant this computer again.");
  }
  let credential;
  try {
    credential = JSON.parse(plaintext);
  } catch {
    throw new Error("SPS Desktop received an invalid Host project source credential.");
  }
  if (
    credential?.version !== 1
    || typeof credential?.sharePath !== "string"
    || credential.sharePath.trim().toLowerCase() !== descriptor.sharePath.trim().toLowerCase()
    || typeof credential?.username !== "string"
    || !LOCAL_SHARE_ACCOUNT.test(credential.username)
    || typeof credential?.password !== "string"
    || credential.password.length < 16
    || credential.password.length > 512
  ) {
    throw new Error("SPS Desktop rejected an invalid Host project source credential.");
  }
  return {
    sharePath: descriptor.sharePath.trim(),
    username: credential.username,
    password: credential.password,
  };
}

export function formatSpsWindowsNetUseError(stderr) {
  const detail = Buffer.isBuffer(stderr) ? stderr.toString("latin1") : String(stderr ?? "");
  const errorCode = detail.match(/\b(5|53|67|86|1219|1326)\b/)?.[1] ?? null;
  switch (errorCode) {
    case "5":
      return "Windows denied access to the SPS Host Source (system error 5).";
    case "53":
      return "Windows could not reach the SPS Host network path (system error 53).";
    case "67":
      return "Windows could not find the SPS Host Source share (system error 67).";
    case "86":
    case "1326":
      return `Windows rejected the SPS Host Source credential (system error ${errorCode}). Ask the Host to revoke and grant Source access again.`;
    case "1219":
      return "Windows already has a connection to this SPS Host with different credentials (system error 1219). Close that connection and retry.";
    default:
      return "Windows could not connect the SPS Host project share.";
  }
}

const SPS_WINDOWS_SMB_MAPPING_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
function Decode-SpsUtf8([string]$Value) {
  [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
}
$sharePath = Decode-SpsUtf8 ([string]$inputData.sharePath)
if ([string]$inputData.action -eq 'remove') {
  $localPath = Decode-SpsUtf8 ([string]$inputData.localPath)
  if ($localPath -notmatch '^[A-Za-z]:$') { throw 'SPS Source cleanup requires its owned local drive.' }
  $current = @(Get-SmbMapping -ErrorAction Stop | Where-Object { ([string]$_.LocalPath) -ieq $localPath })
  if ($current.Count -eq 0) { exit 0 }
  if ($current.Count -ne 1 -or ([string]$current[0].RemotePath) -ine $sharePath) { throw 'SPS Source mapping changed; preserving it.' }
  Remove-SmbMapping -LocalPath $localPath -Force -UpdateProfile -ErrorAction Stop | Out-Null
  $remaining = @(Get-SmbMapping -ErrorAction Stop | Where-Object { ([string]$_.LocalPath) -ieq $localPath })
  if ($remaining.Count -ne 0) { throw 'SPS Source mapping cleanup has not been confirmed.' }
  exit 0
}
$username = Decode-SpsUtf8 ([string]$inputData.username)
$password = Decode-SpsUtf8 ([string]$inputData.password)
try {
  $usedDriveNames = @(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object { $_.Name.ToUpperInvariant() })
  $usedLocalPaths = @(Get-SmbMapping -ErrorAction SilentlyContinue | ForEach-Object { ([string]$_.LocalPath).ToUpperInvariant() })
  foreach ($code in 90..68) {
    $candidate = ([char]$code).ToString() + ':'
    if ($usedDriveNames -contains $candidate.Substring(0, 1) -or $usedLocalPaths -contains $candidate) { continue }
    New-SmbMapping -LocalPath $candidate -RemotePath $sharePath -UserName $username -Password $password -Persistent $false -ErrorAction Stop | Out-Null
    [Console]::Out.WriteLine((@{ localPath = $candidate + '\' } | ConvertTo-Json -Compress))
    exit 0
  }
  throw 'No free drive letter is available for the SPS Host Source.'
} catch {
  $nativeCode = [Runtime.InteropServices.Marshal]::GetHRForException($_.Exception) -band 0xffff
  [Console]::Error.WriteLine("SPS_SMB_ERROR:$nativeCode")
  exit 1
}
`;

function encodeSpsWindowsSmbField(value) {
  return Buffer.from(String(value ?? ""), "utf8").toString("base64");
}

export function buildSpsWindowsSmbMappingRequest(args, password = null) {
  const sharePath = String(args?.[1] ?? "").trim();
  if (!sharePath.startsWith("\\\\")) throw new Error("SPS Host Source share path is invalid.");
  if (args.includes("/delete")) {
    const localPath = String(args.find((entry) => String(entry).startsWith("/local:")) ?? "").slice(7);
    return {
      action: "remove",
      sharePath: encodeSpsWindowsSmbField(sharePath),
      localPath: encodeSpsWindowsSmbField(localPath),
      username: "",
      password: "",
    };
  }
  const username = String(args.find((entry) => String(entry).startsWith("/user:")) ?? "").slice(6);
  if (!username || password == null) throw new Error("SPS Host Source credential is incomplete.");
  return {
    action: "map",
    sharePath: encodeSpsWindowsSmbField(sharePath),
    localPath: "",
    username: encodeSpsWindowsSmbField(username),
    password: encodeSpsWindowsSmbField(password),
  };
}

function runWindowsNetUse(args, password = null) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = buildSpsWindowsSmbMappingRequest(args, password);
    } catch (error) {
      reject(error);
      return;
    }
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      SPS_WINDOWS_SMB_MAPPING_SCRIPT,
    ], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => {
      stdout.push(Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      stderr.push(Buffer.from(chunk));
    });
    child.once("error", (error) => reject(error));
    child.once("close", (code) => {
      if (code === 0) {
        const output = Buffer.concat(stdout).toString("utf8").trim();
        if (!output) return resolve(null);
        try {
          return resolve(JSON.parse(output));
        } catch {
          return reject(new Error("Windows returned an invalid SPS Host Source mapping result."));
        }
      }
      reject(new Error(formatSpsWindowsNetUseError(Buffer.concat(stderr).subarray(-2_000))));
    });
    child.stdin?.end(JSON.stringify(request));
  });
}

export async function openSpsWorkspaceSourceRoute(workspaceAccess, transportPrivateKeyPem, options = {}) {
  if (!workspaceAccess) return null;
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    throw new Error("SPS Host project source sharing currently requires Windows on the Member Node.");
  }
  const credential = decryptSpsWorkspaceSourceCredential(
    workspaceAccess,
    transportPrivateKeyPem,
    options.expectedSharePath ?? null,
  );
  const runNetUse = options.runNetUse ?? runWindowsNetUse;
  // `*` keeps the password out of the process argument list. The private
  // PowerShell helper receives it through stdin, never the Agent environment.
  const mapping = await runNetUse(["use", credential.sharePath, `/user:${credential.username}`, "*"], credential.password);
  const workspacePath = typeof mapping?.localPath === "string" ? mapping.localPath.trim() : "";
  if (!/^[A-Za-z]:\\$/.test(workspacePath)) {
    throw new Error("Windows did not provide a local drive for the SPS Host Source.");
  }
  let closed = false;
  let closing = null;
  return {
    sharePath: credential.sharePath,
    workspacePath,
    close() {
      if (closed) return Promise.resolve();
      if (closing) return closing;
      const operation = Promise.resolve().then(() => runNetUse([
        "use", credential.sharePath, `/local:${workspacePath.slice(0, 2)}`, "/delete", "/y",
      ])).then(() => { closed = true; });
      closing = operation;
      void operation.then(() => { closing = null; }, () => { closing = null; });
      return operation;
    },
  };
}

// Keep the Project-share names available for the existing compatibility path.
export const decryptSpsHostProjectShareCredential = decryptSpsWorkspaceSourceCredential;
export const openSpsHostProjectShare = openSpsWorkspaceSourceRoute;
