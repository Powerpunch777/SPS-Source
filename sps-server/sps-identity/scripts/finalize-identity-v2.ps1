param(
  [Parameter(Mandatory = $true)]
  [string]$StagingEvidencePath,
  [Parameter(Mandatory = $true)]
  [string]$ProductionDeploymentId,
  [Parameter(Mandatory = $true)]
  [string]$ProductionVersionId,
  [Parameter(Mandatory = $true)]
  [string]$ProductionReleaseId,
  [string]$EvidencePath
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sourceRoot = Resolve-Path (Join-Path $root "..\..")
Set-Location -LiteralPath $root

$sourceRevision = (git -C $sourceRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $sourceRevision) { throw "Could not resolve the SPS Source revision." }
$sourceStatus = @(git -C $sourceRoot status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0 -or $sourceStatus.Count -gt 0) {
  throw "Identity finalization requires a clean tracked Source checkout."
}
$env:SPS_IDENTITY_STAGING_EVIDENCE = (Resolve-Path -LiteralPath $StagingEvidencePath).Path
$env:SPS_IDENTITY_SOURCE_REVISION = $sourceRevision
try {
  npm run verify:staging-evidence
  if ($LASTEXITCODE -ne 0) { throw "Staging evidence validation failed." }

  npx wrangler whoami
  if ($LASTEXITCODE -ne 0) { throw "Wrangler authentication is unavailable." }

  $env:SPS_IDENTITY_URL = "https://auth.redongames.com"
  $env:SPS_IDENTITY_WRANGLER_CONFIG = "wrangler.toml"
  $env:SPS_IDENTITY_EXPECTED_DEPLOYMENT_ID = $ProductionDeploymentId
  $env:SPS_IDENTITY_EXPECTED_CLOUDFLARE_DEPLOYMENT_ID = $ProductionDeploymentId
  $env:SPS_IDENTITY_VERSION_ID = $ProductionVersionId
  $env:SPS_IDENTITY_EXPECTED_RELEASE_ID = $ProductionReleaseId
  $env:SPS_IDENTITY_EXPECTED_ROLLOUT_PHASE = "final"
  $env:SPS_IDENTITY_EXPECTED_DATABASE_ID = "9d1caea5-6043-40a7-93dc-273157b2e445"
  $env:SPS_IDENTITY_EXPECTED_DATABASE_NAME = "sps-identity"
  npm run verify:deployment
  if ($LASTEXITCODE -ne 0) {
    throw "The active production SPS Identity deployment does not match this Source revision."
  }

  $replayWindowCheck = @(npx wrangler d1 execute sps-identity --remote --config wrangler.toml --json --command "SELECT COALESCE(MAX(expires_at), 0) AS max_expires_at FROM identity_replay_results;")
  if ($LASTEXITCODE -ne 0) { throw "Could not verify the previous Worker's replay expiry window." }
  $replayWindowJson = ($replayWindowCheck -join "`n") | ConvertFrom-Json
  $maxReplayExpiry = [long]($replayWindowJson[0].results[0].max_expires_at)
  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($maxReplayExpiry -ge $nowMs) {
    throw "Cannot finalize before the previous Worker's replay window expires at $maxReplayExpiry."
  }

  $legacyCheck = @(npx wrangler d1 execute sps-identity --remote --config wrangler.toml --json --command "SELECT COUNT(*) AS count FROM refresh_tokens WHERE family_id IS NULL AND consumed_at IS NULL;")
  if ($LASTEXITCODE -ne 0) { throw "Could not verify the active legacy refresh-token count." }
  $legacyJson = ($legacyCheck -join "`n") | ConvertFrom-Json
  $legacyCount = [int]($legacyJson[0].results[0].count)
  if ($legacyCount -ne 0) { throw "Cannot finalize while $legacyCount active family-less refresh tokens remain." }

  # Active legacy sessions were assigned family roots by migration 0004.
  # Finalization removes only consumed legacy rows and drained plaintext replay.
  npx wrangler d1 execute sps-identity --remote --config wrangler.toml --file "scripts/finalize-identity-v2.sql"
  if ($LASTEXITCODE -ne 0) { throw "Could not finalize SPS Identity v2 storage." }

  $finalCheck = @(npx wrangler d1 execute sps-identity --remote --config wrangler.toml --json --command "SELECT (SELECT COUNT(*) FROM refresh_tokens WHERE family_id IS NULL) AS familyless, (SELECT COUNT(*) FROM identity_replay_results) AS plaintext_replay;")
  if ($LASTEXITCODE -ne 0) { throw "Could not verify finalized SPS Identity storage." }
  $finalJson = ($finalCheck -join "`n") | ConvertFrom-Json
  $finalRow = $finalJson[0].results[0]
  if ([int]$finalRow.familyless -ne 0 -or [int]$finalRow.plaintext_replay -ne 0) {
    throw "SPS Identity finalization did not drain all legacy rows."
  }

  if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Join-Path $root "artifacts\identity-finalization-$sourceRevision.json"
  }
  $evidence = [ordered]@{
    schemaVersion = 1
    status = "passed"
    environment = "production"
    sourceRevision = $sourceRevision
    cloudflareDeploymentId = $ProductionDeploymentId
    versionId = $ProductionVersionId
    releaseId = $ProductionReleaseId
    previousReplayMaxExpiresAt = $maxReplayExpiry
    completedAt = [DateTime]::UtcNow.ToString("o")
    counts = [ordered]@{ familyless = 0; plaintextReplay = 0 }
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidencePath) | Out-Null
  [System.IO.File]::WriteAllText($EvidencePath, ($evidence | ConvertTo-Json -Depth 4), [System.Text.UTF8Encoding]::new($false))
  Write-Output "Finalization evidence: $EvidencePath"
} finally {
  Remove-Item Env:\SPS_IDENTITY_STAGING_EVIDENCE -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_SOURCE_REVISION -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_URL -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_WRANGLER_CONFIG -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_EXPECTED_DEPLOYMENT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_EXPECTED_CLOUDFLARE_DEPLOYMENT_ID -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_VERSION_ID -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_EXPECTED_RELEASE_ID -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_EXPECTED_ROLLOUT_PHASE -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_EXPECTED_DATABASE_ID -ErrorAction SilentlyContinue
  Remove-Item Env:\SPS_IDENTITY_EXPECTED_DATABASE_NAME -ErrorAction SilentlyContinue
}

Write-Output "Consumed legacy refresh rows and drained plaintext replay rows were removed. Active migrated sessions remain valid."
