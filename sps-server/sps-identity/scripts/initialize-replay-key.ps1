param(
  [ValidateSet("Staging", "Production")]
  [string]$Environment = "Staging",
  [switch]$GenerateNewKey
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

$environmentKey = $Environment.ToLowerInvariant()
$configPath = if ($Environment -eq "Production") { "wrangler.toml" } else { "wrangler.staging.toml" }
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

$listed = @(& npx wrangler secret list --config $configPath --format json 2>$null)
if ($LASTEXITCODE -eq 0) {
  $remoteSecrets = ($listed -join "`n") | ConvertFrom-Json
  if (@($remoteSecrets | Where-Object { $_.name -eq $secretName }).Count -gt 0) {
    throw "$secretName already exists for $Environment. Never overwrite a replay key version; bump SPS_IDENTITY_REPLAY_KEY_VERSION before rotating."
  }
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

Get-Content -LiteralPath $secretPath -Raw | npx wrangler secret put $secretName --config $configPath
if ($LASTEXITCODE -ne 0) { throw "Could not initialize $secretName for $Environment." }

Write-Output "$secretName was initialized once for $Environment. Normal deployments will preserve it and fail closed if it is missing."
