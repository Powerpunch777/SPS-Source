param(
  [Parameter(Mandatory = $true)]
  [string]$GoogleClientId,
  [ValidateSet("Staging", "Production")]
  [string]$Environment = "Staging",
  [string]$StagingEvidencePath,
  [switch]$ConfirmProduction
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sourceRoot = Resolve-Path (Join-Path $root "..\..")
Set-Location -LiteralPath $root

$configPath = if ($Environment -eq "Production") { "wrangler.toml" } else { "wrangler.staging.toml" }
$database = if ($Environment -eq "Production") { "sps-identity" } else { "sps-identity-staging" }
$identityUrl = if ($Environment -eq "Production") { "https://auth.redongames.com" } else { "https://auth-staging.redongames.com" }
$domain = ([Uri]$identityUrl).Host

if ($Environment -eq "Production" -and -not $ConfirmProduction) {
  throw "Production deployment requires -ConfirmProduction after a successful staging smoke."
}
if (-not (Test-Path -LiteralPath ".secrets\sps-identity-private.pem") -or
    -not (Test-Path -LiteralPath ".secrets\sps-identity-public.jwk.json")) {
  throw "Run npm run keygen before publishing SPS Identity."
}

$sourceRevision = (git -C $sourceRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $sourceRevision) { throw "Could not resolve the SPS Source revision." }
$sourceStatus = @(git -C $sourceRoot status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0 -or $sourceStatus.Count -gt 0) {
  throw "SPS Identity deployments require a clean tracked Source checkout."
}

if ($Environment -eq "Production") {
  if (-not $StagingEvidencePath) { throw "Production deployment requires -StagingEvidencePath from smoke:staging." }
  $env:SPS_IDENTITY_STAGING_EVIDENCE = (Resolve-Path -LiteralPath $StagingEvidencePath).Path
  $env:SPS_IDENTITY_SOURCE_REVISION = $sourceRevision
  try {
    npm run verify:staging-evidence
    if ($LASTEXITCODE -ne 0) { throw "Staging evidence validation failed." }
  } finally {
    Remove-Item Env:\SPS_IDENTITY_STAGING_EVIDENCE -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_SOURCE_REVISION -ErrorAction SilentlyContinue
  }
}

$config = Get-Content -LiteralPath $configPath -Raw
$replayVersionMatch = [regex]::Match($config, 'SPS_IDENTITY_REPLAY_KEY_VERSION\s*=\s*"(v[1-9][0-9]*)"')
if (-not $replayVersionMatch.Success) { throw "$configPath must define SPS_IDENTITY_REPLAY_KEY_VERSION." }
$replayVersion = $replayVersionMatch.Groups[1].Value
$replaySecretName = "SPS_IDENTITY_REPLAY_KEY_$($replayVersion.ToUpperInvariant())"

npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw "Wrangler authentication is unavailable." }
$listed = @(npx wrangler secret list --config $configPath --format json)
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect $Environment secrets. Run scripts\initialize-replay-key.ps1 explicitly before the first deployment."
}
$remoteSecrets = ($listed -join "`n") | ConvertFrom-Json
if (@($remoteSecrets | Where-Object { $_.name -eq $replaySecretName }).Count -eq 0) {
  throw "$replaySecretName is missing for $Environment. Initialize it explicitly; normal deployment never creates or overwrites replay keys."
}

$googleSecret = Read-Host "Google OAuth web client secret for $Environment" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($googleSecret)
try {
  $GoogleClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $GoogleClientId | npx wrangler secret put GOOGLE_CLIENT_ID --config $configPath
  $GoogleClientSecret | npx wrangler secret put GOOGLE_CLIENT_SECRET --config $configPath
  Get-Content -LiteralPath ".secrets\sps-identity-private.pem" -Raw |
    npx wrangler secret put SPS_IDENTITY_PRIVATE_KEY_PEM --config $configPath
  if ($Environment -eq "Staging") {
    Get-Content -LiteralPath ".secrets\sps-identity-public.jwk.json" -Raw |
      npx wrangler secret put SPS_IDENTITY_PUBLIC_JWK --config $configPath
  }

  # Migrations 0003 and 0004 are additive. The previous Worker schema remains
  # valid, while active legacy refresh tokens receive safe family roots.
  npx wrangler d1 migrations apply $database --remote --config $configPath
  if ($LASTEXITCODE -ne 0) { throw "Could not apply $Environment SPS Identity migrations." }

  npx wrangler deploy --keep-vars --config $configPath --domain $domain --var "SPS_IDENTITY_SOURCE_REVISION:$sourceRevision"
  if ($LASTEXITCODE -ne 0) { throw "Could not deploy SPS Identity to $Environment." }

  $env:SPS_IDENTITY_URL = $identityUrl
  $env:SPS_IDENTITY_WRANGLER_CONFIG = $configPath
  $env:SPS_IDENTITY_SOURCE_REVISION = $sourceRevision
  try {
    npm run verify:deployment
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Run 'npx wrangler deployments list --config $configPath' and rollback the previous version. Legacy sessions have not been deleted."
      throw "SPS Identity $Environment deployment verification failed."
    }

    if ($Environment -eq "Staging") {
      $evidencePath = Join-Path $root "artifacts\identity-staging-smoke-$sourceRevision.json"
      $env:SPS_IDENTITY_D1_DATABASE = $database
      $env:SPS_IDENTITY_SMOKE_EVIDENCE = $evidencePath
      npm run smoke:staging
      if ($LASTEXITCODE -ne 0) { throw "SPS Identity staging smoke failed." }
      Write-Output "Staging evidence: $evidencePath"
    }
  } finally {
    Remove-Item Env:\SPS_IDENTITY_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_WRANGLER_CONFIG -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_SOURCE_REVISION -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_D1_DATABASE -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_SMOKE_EVIDENCE -ErrorAction SilentlyContinue
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable GoogleClientSecret -ErrorAction SilentlyContinue
}

if ($Environment -eq "Staging") {
  Write-Output "SPS Identity staging deployment and automated smoke completed. Use its evidence for production deployment."
} else {
  Write-Output "SPS Identity production deployment verified. Run finalization only after the legacy replay window has elapsed."
}
