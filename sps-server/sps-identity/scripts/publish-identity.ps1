param(
  [Parameter(Mandatory = $true)]
  [string]$GoogleClientId,
  [ValidateSet("Staging", "Production")]
  [string]$Environment = "Staging",
  [string]$StagingEvidencePath,
  [string]$FullOAuthEvidencePath,
  [string]$StagingDeploymentId,
  [string]$StagingVersionId,
  [string]$StagingReleaseId,
  [ValidateSet("Bridge", "Final")]
  [string]$RolloutPhase = "Bridge",
  [string]$BridgeVersionId,
  [string]$BridgeCloudflareDeploymentId,
  [string]$BridgeReleaseId,
  [switch]$ConfirmProduction
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sourceRoot = Resolve-Path (Join-Path $root "..\..")
Set-Location -LiteralPath $root

$configPath = if ($Environment -eq "Production") { "wrangler.toml" } else { "wrangler.staging.toml" }
$database = if ($Environment -eq "Production") { "sps-identity" } else { "sps-identity-staging" }
$databaseId = if ($Environment -eq "Production") { "9d1caea5-6043-40a7-93dc-273157b2e445" } else { "b0f62d9e-0f87-4ed2-ac99-ffc164c0892c" }
$identityUrl = if ($Environment -eq "Production") { "https://auth.redongames.com" } else { "https://auth-staging.redongames.com" }
$domain = ([Uri]$identityUrl).Host
$secretRoot = Join-Path $root ".secrets\$($Environment.ToLowerInvariant())"
$privateKeyPath = Join-Path $secretRoot "sps-identity-private.pem"
$publicJwkPath = Join-Path $secretRoot "sps-identity-public.jwk.json"

if ([string]::IsNullOrWhiteSpace($GoogleClientId)) {
  throw "Google OAuth client ID cannot be empty."
}

if ($Environment -eq "Production" -and -not $ConfirmProduction) {
  throw "Production deployment requires -ConfirmProduction after a successful staging smoke."
}
if ($Environment -eq "Production" -and $RolloutPhase -eq "Final" -and
    ([string]::IsNullOrWhiteSpace($BridgeVersionId) -or
     [string]::IsNullOrWhiteSpace($BridgeCloudflareDeploymentId) -or
     [string]::IsNullOrWhiteSpace($BridgeReleaseId))) {
  throw "Final rollout requires the exact Bridge version ID, Cloudflare deployment ID, and SPS release ID."
}
if ($Environment -ne "Production" -and $RolloutPhase -eq "Final") {
  throw "Final rollout is production-only; staging must establish the Bridge evidence first."
}
if (-not (Test-Path -LiteralPath $privateKeyPath) -or -not (Test-Path -LiteralPath $publicJwkPath)) {
  throw "Run `$env:SPS_IDENTITY_ENVIRONMENT=$($Environment.ToLowerInvariant()); npm run keygen` before publishing SPS Identity."
}
node scripts/validate-signing-material.mjs $privateKeyPath $publicJwkPath
if ($LASTEXITCODE -ne 0) { throw "SPS Identity signing material validation failed." }

$sourceRevision = (git -C $sourceRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $sourceRevision) { throw "Could not resolve the SPS Source revision." }
$sourceStatus = @(git -C $sourceRoot status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0 -or $sourceStatus.Count -gt 0) {
  throw "SPS Identity deployments require a clean tracked Source checkout."
}

if ($Environment -eq "Production") {
  if (-not $StagingEvidencePath) { throw "Production deployment requires -StagingEvidencePath from smoke:staging." }
  if (-not $FullOAuthEvidencePath) { throw "Production deployment requires -FullOAuthEvidencePath from the real staging Google sign-in smoke." }
  if ([string]::IsNullOrWhiteSpace($StagingDeploymentId) -or [string]::IsNullOrWhiteSpace($StagingVersionId) -or [string]::IsNullOrWhiteSpace($StagingReleaseId)) {
    throw "Production deployment requires the exact staging Cloudflare deployment ID, Worker version ID, and SPS release ID from the evidence."
  }
  $env:SPS_IDENTITY_STAGING_EVIDENCE = (Resolve-Path -LiteralPath $StagingEvidencePath).Path
  $env:SPS_IDENTITY_FULL_OAUTH_EVIDENCE = (Resolve-Path -LiteralPath $FullOAuthEvidencePath).Path
  $env:SPS_IDENTITY_SOURCE_REVISION = $sourceRevision
  $env:SPS_IDENTITY_EXPECTED_DEPLOYMENT_ID = $StagingDeploymentId
  $env:SPS_IDENTITY_EXPECTED_VERSION_ID = $StagingVersionId
  $env:SPS_IDENTITY_EXPECTED_RELEASE_ID = $StagingReleaseId
  try {
    npm run verify:staging-evidence
    if ($LASTEXITCODE -ne 0) { throw "Staging evidence validation failed." }
    npm run verify:oauth-evidence
    if ($LASTEXITCODE -ne 0) { throw "Full staging Google OAuth evidence validation failed." }
  } finally {
    Remove-Item Env:\SPS_IDENTITY_STAGING_EVIDENCE -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_FULL_OAUTH_EVIDENCE -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_SOURCE_REVISION -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_DEPLOYMENT_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_VERSION_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_RELEASE_ID -ErrorAction SilentlyContinue
  }
}

$config = Get-Content -LiteralPath $configPath -Raw
$replayVersionMatch = [regex]::Match($config, 'SPS_IDENTITY_REPLAY_KEY_VERSION\s*=\s*"(v[1-9][0-9]*)"')
if (-not $replayVersionMatch.Success) { throw "$configPath must define SPS_IDENTITY_REPLAY_KEY_VERSION." }
$replayVersion = $replayVersionMatch.Groups[1].Value
$replaySecretName = "SPS_IDENTITY_REPLAY_KEY_$($replayVersion.ToUpperInvariant())"
$releaseId = "sps-$($Environment.ToLowerInvariant())-$($RolloutPhase.ToLowerInvariant())-$($sourceRevision.Substring(0, 12))-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
$workerName = if ($Environment -eq "Production") { "sps-identity" } else { "sps-identity-staging" }
$uploadTag = "sps-$($Environment.ToLowerInvariant())-$($RolloutPhase.ToLowerInvariant())-$($sourceRevision.Substring(0, 12))-$([guid]::NewGuid().ToString('N'))"

if ($RolloutPhase -eq "Final") {
  $currentHealth = Invoke-RestMethod -Uri "$identityUrl/health" -Method Get
  if ($currentHealth.rollback_floor -ne "bridge-v2" -or
      $currentHealth.rollout_phase -ne "bridge" -or
      $currentHealth.release_id -ne $BridgeReleaseId) {
    throw "Final rollout requires the declared Bridge release to be the active rollback floor."
  }
  $bridgeDeployments = @(npx wrangler deployments list --name $workerName --config $configPath --json)
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect Cloudflare deployments before Final rollout." }
  ($bridgeDeployments -join "`n") | node scripts/validate-current-deployment.mjs $BridgeCloudflareDeploymentId $BridgeVersionId | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "The declared Bridge deployment is not the latest active Cloudflare rollback floor." }
}

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
$secretBundlePath = $null
try {
  $GoogleClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($GoogleClientSecret)) { throw "Google OAuth client secret cannot be empty." }
  $secretBundlePath = Join-Path $env:TEMP "sps-identity-$($Environment.ToLowerInvariant())-$([guid]::NewGuid().ToString('N')).json"
  $secretBundle = [ordered]@{
    GOOGLE_CLIENT_ID = $GoogleClientId
    GOOGLE_CLIENT_SECRET = $GoogleClientSecret
    SPS_IDENTITY_PRIVATE_KEY_PEM = Get-Content -LiteralPath $privateKeyPath -Raw
    SPS_IDENTITY_PUBLIC_JWK = Get-Content -LiteralPath $publicJwkPath -Raw
  }
  [System.IO.File]::WriteAllText($secretBundlePath, ($secretBundle | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))

  # Migrations 0003 and 0004 are additive. The previous Worker schema remains
  # valid, while active legacy refresh tokens receive safe family roots.
  npx wrangler d1 migrations apply $database --remote --config $configPath
  if ($LASTEXITCODE -ne 0) { throw "Could not apply $Environment SPS Identity migrations." }

  $deploymentListBefore = @(npx wrangler deployments list --name $workerName --config $configPath --json)
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect existing Cloudflare deployments before upload." }
  $existingDeploymentIds = @((($deploymentListBefore -join "`n") | ConvertFrom-Json) | ForEach-Object { $_.id })

  npx wrangler versions upload "src\worker.mjs" --name $workerName --tag $uploadTag `
    --config $configPath --secrets-file $secretBundlePath --strict --keep-vars --no-bundle `
    --var "SPS_IDENTITY_SOURCE_REVISION:$sourceRevision" `
    --var "SPS_IDENTITY_RELEASE_ID:$releaseId" `
    --var "SPS_IDENTITY_PROTOCOL_VERSION:2" `
    --var "SPS_IDENTITY_ROLLBACK_FLOOR:bridge-v2" `
    --var "SPS_IDENTITY_ROLLOUT_PHASE:$($RolloutPhase.ToLowerInvariant())"
  if ($LASTEXITCODE -ne 0) { throw "Could not upload the immutable SPS Identity $Environment version." }
  $versionList = @(npx wrangler versions list --name $workerName --config $configPath --json)
  if ($LASTEXITCODE -ne 0) { throw "Could not read the uploaded SPS Identity version ID." }
  $versionRecords = @(($versionList -join "`n") | ConvertFrom-Json)
  $version = ($versionRecords | Where-Object { $_.annotations.'workers/tag' -eq $uploadTag } | Select-Object -First 1).id
  if (-not $version) { throw "Wrangler did not return an immutable SPS Identity version ID." }
  npx wrangler versions deploy "$version@100" --name $workerName --config $configPath --yes
  if ($LASTEXITCODE -ne 0) { throw "Could not deploy the uploaded SPS Identity version to $Environment." }
  $deployments = @(npx wrangler deployments list --name $workerName --config $configPath --json)
  if ($LASTEXITCODE -ne 0) { throw "Could not read the Cloudflare deployment created by the exact Worker version." }
  $deploymentRecords = @(($deployments -join "`n") | ConvertFrom-Json)
  $newDeployments = @($deploymentRecords | Where-Object {
    $_.id -notin $existingDeploymentIds -and
    @($_.versions | Where-Object { $_.version_id -eq $version -and [double]$_.percentage -gt 0 }).Count -gt 0
  })
  if ($newDeployments.Count -ne 1) { throw "Wrangler did not return exactly one new deployment for the uploaded Worker version." }
  $cloudflareDeploymentId = $newDeployments[0].id
  if (-not $cloudflareDeploymentId) { throw "The exact uploaded version has no Cloudflare deployment ID." }
  ($deployments -join "`n") | node scripts/validate-current-deployment.mjs $cloudflareDeploymentId $version | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "The uploaded Worker version did not become the latest active Cloudflare deployment." }

  $env:SPS_IDENTITY_URL = $identityUrl
  $env:SPS_IDENTITY_WRANGLER_CONFIG = $configPath
  $env:SPS_IDENTITY_SOURCE_REVISION = $sourceRevision
  $env:SPS_IDENTITY_EXPECTED_CLOUDFLARE_DEPLOYMENT_ID = $cloudflareDeploymentId
  $env:SPS_IDENTITY_EXPECTED_RELEASE_ID = $releaseId
  $env:SPS_IDENTITY_VERSION_ID = $version
  $env:SPS_IDENTITY_EXPECTED_ROLLOUT_PHASE = $RolloutPhase.ToLowerInvariant()
  $env:SPS_IDENTITY_EXPECTED_DATABASE_ID = $databaseId
  $env:SPS_IDENTITY_EXPECTED_DATABASE_NAME = $database
  try {
    try {
      npm run verify:deployment
      if ($LASTEXITCODE -ne 0) { throw "SPS Identity $Environment deployment verification failed." }
    } catch {
      if ($RolloutPhase -eq "Final") {
        npx wrangler versions deploy "$BridgeVersionId@100" --name $workerName --config $configPath --yes
        if ($LASTEXITCODE -ne 0) { throw "Final verification failed and the exact Bridge version rollback also failed." }
        $rollbackHealth = Invoke-RestMethod -Uri "$identityUrl/health" -Method Get
        if ($rollbackHealth.release_id -ne $BridgeReleaseId -or $rollbackHealth.rollout_phase -ne "bridge") {
          throw "Final verification failed and the Bridge rollback could not be verified remotely."
        }
        throw "Final verification failed; traffic was rolled back only to the declared Bridge version $BridgeVersionId."
      }
      throw
    }

    if ($Environment -eq "Staging") {
      $evidencePath = Join-Path $root "artifacts\identity-staging-smoke-$sourceRevision.json"
      $env:SPS_IDENTITY_D1_DATABASE = $database
      $env:SPS_IDENTITY_DEPLOYMENT_ID = $cloudflareDeploymentId
      $env:SPS_IDENTITY_VERSION_ID = $version
      $env:SPS_IDENTITY_RELEASE_ID = $releaseId
      $env:SPS_IDENTITY_D1_DATABASE_ID = $env:SPS_IDENTITY_EXPECTED_DATABASE_ID
      $env:SPS_IDENTITY_SMOKE_EVIDENCE = $evidencePath
      npm run smoke:staging
      if ($LASTEXITCODE -ne 0) { throw "SPS Identity staging smoke failed." }
      Write-Output "Staging evidence: $evidencePath"
    }

    $rolloutEvidencePath = Join-Path $root "artifacts\identity-$($Environment.ToLowerInvariant())-$($RolloutPhase.ToLowerInvariant())-$sourceRevision.json"
    $rolloutEvidence = [ordered]@{
      schemaVersion = 1
      environment = $Environment.ToLowerInvariant()
      rolloutPhase = $RolloutPhase.ToLowerInvariant()
      sourceRevision = $sourceRevision
      cloudflareDeploymentId = $cloudflareDeploymentId
      versionId = $version
      releaseId = $releaseId
      rollbackFloor = "bridge-v2"
      generatedAt = [DateTime]::UtcNow.ToString("o")
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $rolloutEvidencePath) | Out-Null
    [System.IO.File]::WriteAllText($rolloutEvidencePath, ($rolloutEvidence | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
    Write-Output "Rollout evidence: $rolloutEvidencePath"
  } finally {
    if ($secretBundlePath) { Remove-Item -LiteralPath $secretBundlePath -Force -ErrorAction SilentlyContinue }
    Remove-Item Env:\SPS_IDENTITY_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_WRANGLER_CONFIG -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_SOURCE_REVISION -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_DEPLOYMENT_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_CLOUDFLARE_DEPLOYMENT_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_RELEASE_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_ROLLOUT_PHASE -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_VERSION_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_DATABASE_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_EXPECTED_DATABASE_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_D1_DATABASE -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_SMOKE_EVIDENCE -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_DEPLOYMENT_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_VERSION_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_RELEASE_ID -ErrorAction SilentlyContinue
    Remove-Item Env:\SPS_IDENTITY_D1_DATABASE_ID -ErrorAction SilentlyContinue
  }
} finally {
  if ($secretBundlePath) { Remove-Item -LiteralPath $secretBundlePath -Force -ErrorAction SilentlyContinue }
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable GoogleClientSecret -ErrorAction SilentlyContinue
}

if ($Environment -eq "Staging") {
  Write-Output "SPS Identity staging deployment and automated smoke completed. Use its evidence for production deployment."
} else {
  Write-Output "SPS Identity production deployment verified. Run finalization only after the legacy replay window has elapsed."
}
