param(
  [Parameter(Mandatory = $true)]
  [string]$StagingEvidencePath,
  [switch]$ConfirmLegacyReplayWindowElapsed
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sourceRoot = Resolve-Path (Join-Path $root "..\..")
Set-Location -LiteralPath $root

if (-not $ConfirmLegacyReplayWindowElapsed) {
  throw "Wait longer than the previous Worker's replay TTL, then supply -ConfirmLegacyReplayWindowElapsed."
}

$sourceRevision = (git -C $sourceRoot rev-parse HEAD).Trim()
$env:SPS_IDENTITY_STAGING_EVIDENCE = (Resolve-Path -LiteralPath $StagingEvidencePath).Path
$env:SPS_IDENTITY_SOURCE_REVISION = $sourceRevision
try {
  npm run verify:staging-evidence
  if ($LASTEXITCODE -ne 0) { throw "Staging evidence validation failed." }

  npx wrangler whoami
  if ($LASTEXITCODE -ne 0) { throw "Wrangler authentication is unavailable." }

  $env:SPS_IDENTITY_URL = "https://auth.redongames.com"
  $env:SPS_IDENTITY_WRANGLER_CONFIG = "wrangler.toml"
  npm run verify:deployment
  if ($LASTEXITCODE -ne 0) {
    throw "The active production SPS Identity deployment does not match this Source revision."
  }

  # Active legacy sessions were assigned family roots by migration 0004.
  # Finalization removes only consumed legacy rows and drained plaintext replay.
  npx wrangler d1 execute sps-identity --remote --config wrangler.toml --file "scripts/finalize-identity-v2.sql"
  if ($LASTEXITCODE -ne 0) { throw "Could not finalize SPS Identity v2 storage." }
} finally {
  Remove-Item Env:\SPS_IDENTITY_STAGING_EVIDENCE -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_SOURCE_REVISION -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_WRANGLER_CONFIG -ErrorAction SilentlyContinue
}

Write-Output "Consumed legacy refresh rows and drained plaintext replay rows were removed. Active migrated sessions remain valid."
