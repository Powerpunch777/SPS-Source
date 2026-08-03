param(
  [switch]$ConfirmStagingSmokePassed,
  [switch]$ConfirmLegacyReplayWindowElapsed
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

if (-not $ConfirmStagingSmokePassed -or -not $ConfirmLegacyReplayWindowElapsed) {
  throw "Run this only after token/refresh/revoke staging smoke passes and the previous Worker's replay TTL has elapsed. Supply both confirmation switches."
}

npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
  throw "Wrangler authentication is unavailable."
}

npm run verify:deployment
if ($LASTEXITCODE -ne 0) {
  throw "The active SPS Identity deployment did not pass health and signing-key verification."
}

# Legacy tokens have no trustworthy family lineage. Revoking them is safer
# than silently adopting them into a new family. The old replay table remains
# structurally available so an emergency Worker rollback still starts; users
# must sign in again after this point.
npx wrangler d1 execute sps-identity --remote --file "scripts/finalize-identity-v2.sql"
if ($LASTEXITCODE -ne 0) {
  throw "Could not revoke legacy SPS Identity sessions."
}

Write-Output "Legacy refresh tokens and drained plaintext replay rows were removed. SPS Identity v2 finalization is complete."
Write-Output "For emergency rollback, run 'npx wrangler deployments list' followed by 'npx wrangler rollback <previous-version-id> -y'. All users must sign in again after rollback."
