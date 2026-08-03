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
  npx wrangler d1 migrations apply sps-identity --remote
  if ($LASTEXITCODE -ne 0) {
    throw "Could not apply SPS Identity D1 migrations. The Worker was not deployed."
  }
  npx wrangler deploy --keep-vars --domain auth.redongames.com
  if ($LASTEXITCODE -ne 0) {
    throw "Could not deploy SPS Identity."
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable GoogleClientSecret -ErrorAction SilentlyContinue
}

Write-Output "SPS Identity is deployed. Run npm run verify:deployment."
