param(
  [Parameter(Mandatory = $true)]
  [string]$GoogleClientId
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

if (-not (Test-Path -LiteralPath ".secrets\sps-identity-private.pem")) {
  throw "Run npm run keygen before publishing SPS Identity."
}

$wranglerConfig = Get-Content -LiteralPath "wrangler.toml" -Raw
$replayVersionMatch = [regex]::Match($wranglerConfig, 'SPS_IDENTITY_REPLAY_KEY_VERSION\s*=\s*"(v[1-9][0-9]*)"')
if (-not $replayVersionMatch.Success) {
  throw "wrangler.toml must define SPS_IDENTITY_REPLAY_KEY_VERSION (for example, v1)."
}
$replayVersion = $replayVersionMatch.Groups[1].Value
$replaySecretName = "SPS_IDENTITY_REPLAY_KEY_$($replayVersion.ToUpperInvariant())"
$replaySecretPath = ".secrets\sps-identity-replay-$replayVersion.key"
if (-not (Test-Path -LiteralPath $replaySecretPath)) {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  $encoded = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  [System.IO.Directory]::CreateDirectory((Join-Path $root ".secrets")) | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $root $replaySecretPath), $encoded, [System.Text.UTF8Encoding]::new($false))
}

npx wrangler whoami

if ((Get-Content -LiteralPath "wrangler.toml" -Raw).Contains("REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID")) {
  $created = @(npx wrangler d1 create sps-identity --location apac)
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the SPS Identity D1 database."
  }
  $databaseId = [regex]::Match(($created -join "`n"), "\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b", "IgnoreCase").Value
  if (-not $databaseId) {
    throw "Wrangler created the SPS Identity D1 database but did not return its id. Add the database id to wrangler.toml, then run this script again."
  }
  $toml = Get-Content -LiteralPath "wrangler.toml" -Raw
  $toml = $toml.Replace("REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID", $databaseId)
  [System.IO.File]::WriteAllText((Resolve-Path "wrangler.toml"), $toml, [System.Text.UTF8Encoding]::new($false))
}

$secret = Read-Host "Google OAuth web client secret" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $GoogleClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $GoogleClientId | npx wrangler secret put GOOGLE_CLIENT_ID
  $GoogleClientSecret | npx wrangler secret put GOOGLE_CLIENT_SECRET
  Get-Content -LiteralPath ".secrets\sps-identity-private.pem" -Raw | npx wrangler secret put SPS_IDENTITY_PRIVATE_KEY_PEM
  Get-Content -LiteralPath $replaySecretPath -Raw | npx wrangler secret put $replaySecretName

  # 0003 is additive: the previous Worker keeps its response_json replay
  # table while the new Worker uses identity_replay_results_v2.
  npx wrangler d1 migrations apply sps-identity --remote
  if ($LASTEXITCODE -ne 0) {
    throw "Could not apply SPS Identity D1 migrations. The Worker was not deployed."
  }
  npx wrangler deploy --keep-vars --domain auth.redongames.com
  if ($LASTEXITCODE -ne 0) {
    throw "Could not deploy SPS Identity."
  }
  npm run verify:deployment
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "The additive schema is rollback-safe. Run 'npx wrangler deployments list' and 'npx wrangler rollback <previous-version-id> -y'."
    throw "SPS Identity deployment verification failed. Legacy sessions were not revoked."
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable GoogleClientSecret -ErrorAction SilentlyContinue
}

Write-Output "SPS Identity v2 is deployed and the previous replay table is still available for rollback."
Write-Output "After staging token/refresh/revoke smoke passes and the previous replay TTL has elapsed, run scripts\finalize-identity-v2.ps1 with both confirmation switches."
