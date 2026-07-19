[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$Domain,
  [Parameter(Mandatory)]
  [string]$GoogleClientId,
  [string]$GoogleClientSecret,
  [string]$CloudflareTunnelToken,
  [switch]$PromptForGoogleClientSecret,
  [switch]$PromptForCloudflareTunnelToken,
  [string]$OutputPath = (Join-Path $PSScriptRoot ".env"),
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function New-UrlSafeSecret {
  param([int]$ByteCount = 48)
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function ConvertFrom-SPSSecretPrompt {
  param([Parameter(Mandatory)][string]$Prompt)

  $secureValue = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$normalizedDomain = $Domain.Trim().TrimEnd(".").ToLowerInvariant()
$domainLabels = @($normalizedDomain.Split("."))
$hasInvalidLabel = $domainLabels.Count -lt 2 -or @($domainLabels | Where-Object {
  $_.Length -gt 63 -or $_ -notmatch "^(?:[a-z0-9]|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9]))$"
}).Count -gt 0
if ($normalizedDomain -match "^https?://" -or $normalizedDomain -match "[/:\\]" -or $hasInvalidLabel) {
  throw "Domain must be a public hostname only, for example hub.example.com."
}
if ($normalizedDomain -in @("localhost", "127.0.0.1", "0.0.0.0")) {
  throw "A public SPS Hub requires a public HTTPS hostname, not a local address."
}
if ((Test-Path -LiteralPath $OutputPath) -and -not $Force) {
  throw "Refusing to overwrite $OutputPath. Pass -Force only when intentionally rotating all local deployment secrets."
}

if ($PromptForGoogleClientSecret -and -not [string]::IsNullOrWhiteSpace($GoogleClientSecret)) {
  throw "Pass either -GoogleClientSecret or -PromptForGoogleClientSecret, not both."
}
if ($PromptForCloudflareTunnelToken -and -not [string]::IsNullOrWhiteSpace($CloudflareTunnelToken)) {
  throw "Pass either -CloudflareTunnelToken or -PromptForCloudflareTunnelToken, not both."
}
if ($PromptForGoogleClientSecret) {
  $GoogleClientSecret = ConvertFrom-SPSSecretPrompt "Paste the Google OAuth client secret"
}
if ($PromptForCloudflareTunnelToken) {
  $CloudflareTunnelToken = ConvertFrom-SPSSecretPrompt "Paste the Cloudflare Tunnel connector token"
}
if ([string]::IsNullOrWhiteSpace($GoogleClientId) -or [string]::IsNullOrWhiteSpace($GoogleClientSecret)) {
  throw "Google OAuth client ID and client secret are required."
}
$normalizedGoogleClientId = $GoogleClientId.Trim()
$normalizedGoogleClientSecret = $GoogleClientSecret.Trim()
if ($normalizedGoogleClientId -notmatch "^[A-Za-z0-9._-]+$" -or $normalizedGoogleClientSecret -notmatch "^[A-Za-z0-9._-]+$") {
  throw "Google OAuth values must not contain whitespace, quotes, or Compose control characters."
}
if (-not [string]::IsNullOrWhiteSpace($CloudflareTunnelToken) -and $CloudflareTunnelToken.Trim() -match '[\s"'']') {
  throw "Cloudflare Tunnel token must not contain whitespace or quotes."
}

$lines = @(
  "SPS_DOMAIN=$normalizedDomain",
  "SPS_PUBLIC_URL=https://$normalizedDomain",
  "SPS_POSTGRES_PASSWORD=$(New-UrlSafeSecret)",
  "SPS_BETTER_AUTH_SECRET=$(New-UrlSafeSecret)",
  "SPS_GOOGLE_CLIENT_ID=$normalizedGoogleClientId",
  "SPS_GOOGLE_CLIENT_SECRET=$normalizedGoogleClientSecret"
)
if (-not [string]::IsNullOrWhiteSpace($CloudflareTunnelToken)) {
  $lines += "SPS_CLOUDFLARE_TUNNEL_TOKEN=$($CloudflareTunnelToken.Trim())"
}

$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
[System.IO.File]::WriteAllText($OutputPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Output "Created local SPS Hub configuration at $OutputPath. It contains secrets and is intentionally ignored by Git."
