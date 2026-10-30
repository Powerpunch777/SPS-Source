param(
  [ValidateSet("Staging", "Production")]
  [string]$Environment = "Staging",
  [switch]$GenerateNewKey
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$lockPath = Join-Path $root ".secrets\replay\$($Environment.ToLowerInvariant()).lock"
[System.IO.Directory]::CreateDirectory((Split-Path -Parent $lockPath)) | Out-Null
try {
  $lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
  throw "Replay key initialization for $Environment is already running. Refusing concurrent initialization."
}

try {
$environmentKey = $Environment.ToLowerInvariant()
$configPath = if ($Environment -eq "Production") { "wrangler.toml" } else { "wrangler.staging.toml" }
$database = if ($Environment -eq "Production") { "sps-identity" } else { "sps-identity-staging" }
$config = Get-Content -LiteralPath $configPath -Raw
$versionMatch = [regex]::Match($config, 'SPS_IDENTITY_REPLAY_KEY_VERSION\s*=\s*"(v[1-9][0-9]*)"')
if (-not $versionMatch.Success) {
  throw "$configPath must define SPS_IDENTITY_REPLAY_KEY_VERSION."
}

$version = $versionMatch.Groups[1].Value
$secretName = "SPS_IDENTITY_REPLAY_KEY_$($version.ToUpperInvariant())"
$secretPath = ".secrets\replay\$environmentKey\$version.key"

npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw "Wrangler authentication is unavailable." }

$listed = @(& npx wrangler secret list --config $configPath --format json)
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect $Environment secrets. Refusing to initialize a replay key after an unknown secret-list result."
}
$remoteSecrets = ($listed -join "`n") | ConvertFrom-Json
if (@($remoteSecrets | Where-Object { $_.name -eq $secretName }).Count -gt 0) {
  throw "$secretName already exists for $Environment. Never overwrite a replay key version; bump SPS_IDENTITY_REPLAY_KEY_VERSION before rotating."
}

if (-not (Test-Path -LiteralPath $secretPath)) {
  if (-not $GenerateNewKey) {
    throw "Replay key material is missing. Re-run with -GenerateNewKey only for an explicit first initialization or a new version."
  }
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  $encoded = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent (Join-Path $root $secretPath))) | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $root $secretPath), $encoded, [System.Text.UTF8Encoding]::new($false))
}

$createdAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$lockSql = "CREATE TABLE IF NOT EXISTS replay_key_initializations (secret_name TEXT PRIMARY KEY, created_at INTEGER NOT NULL, completed_at INTEGER); INSERT INTO replay_key_initializations (secret_name, created_at, completed_at) VALUES ('$secretName', $createdAt, NULL);"
npx wrangler d1 execute $database --remote --yes --config $configPath --command $lockSql
if ($LASTEXITCODE -ne 0) {
  throw "A remote initialization lock already exists for $secretName, or the lock could not be created. Inspect D1 and the Worker secret list before any manual recovery."
}

Get-Content -LiteralPath $secretPath -Raw | npx wrangler secret put $secretName --config $configPath
if ($LASTEXITCODE -ne 0) { throw "Could not initialize $secretName for $Environment." }

$completedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
npx wrangler d1 execute $database --remote --yes --config $configPath --command "UPDATE replay_key_initializations SET completed_at = $completedAt WHERE secret_name = '$secretName' AND completed_at IS NULL;"
if ($LASTEXITCODE -ne 0) { throw "$secretName was uploaded, but its remote initialization record could not be finalized. Stop and inspect both states before continuing." }

Write-Output "$secretName was initialized once for $Environment. Normal deployments will preserve it and fail closed if it is missing."
Write-Output "The local file lock and the D1 unique initialization record prevent same-machine and cross-machine duplicate initialization."
} finally {
  if ($lockStream) { $lockStream.Dispose() }
  Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
