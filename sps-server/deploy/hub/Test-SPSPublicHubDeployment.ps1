[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot ".env"),
  [switch]$CheckPublicHealth
)

$ErrorActionPreference = "Stop"
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
  param([string]$Name, [bool]$Passed, [string]$Detail)
  $checks.Add([pscustomobject]@{
    Check = $Name
    Status = if ($Passed) { "PASS" } else { "FAIL" }
    Detail = $Detail
  })
}

function Read-SafeDotEnv {
  param([string]$Path)
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) { throw "Deployment environment file contains an invalid line." }
    $values[$line.Substring(0, $separator)] = $line.Substring($separator + 1)
  }
  return $values
}

$composePath = Join-Path $PSScriptRoot "docker-compose.yml"
$repositoryRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$corePackagePath = Join-Path $repositoryRoot "external\sps-core\server\package.json"
if (Test-Path -LiteralPath $corePackagePath -PathType Leaf) {
  Add-Check "SPS Core source" $true "Pinned SPS Core submodule is available for the Docker build."
} else {
  Add-Check "SPS Core source" $false "SPS Core is missing. Run: git submodule update --init --recursive"
}
$environment = $null
if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
  try {
    $environment = Read-SafeDotEnv -Path $ConfigPath
    $required = @(
      "SPS_DOMAIN",
      "SPS_PUBLIC_URL",
      "SPS_POSTGRES_PASSWORD",
      "SPS_BETTER_AUTH_SECRET",
      "SPS_GOOGLE_CLIENT_ID",
      "SPS_GOOGLE_CLIENT_SECRET"
    )
    $missing = @($required | Where-Object { [string]::IsNullOrWhiteSpace($environment[$_]) })
    $configurationDetail = if ($missing.Count -eq 0) {
      "Required keys are present; secret values were not printed."
    } else {
      "Missing keys: $($missing -join ', ')."
    }
    Add-Check "Local deployment configuration" ($missing.Count -eq 0) $configurationDetail
    try {
      $publicUri = [Uri]$environment["SPS_PUBLIC_URL"]
      $matchesDomain = $publicUri.Host -eq $environment["SPS_DOMAIN"]
      Add-Check "Public HTTPS URL" ($publicUri.Scheme -eq "https" -and $matchesDomain) "SPS_PUBLIC_URL must be HTTPS and match SPS_DOMAIN."
    } catch {
      Add-Check "Public HTTPS URL" $false "SPS_PUBLIC_URL is not a valid URL."
    }
  } catch {
    Add-Check "Local deployment configuration" $false "Could not validate the local deployment configuration."
  }
} else {
  Add-Check "Local deployment configuration" $false "Configuration file not found: $ConfigPath"
}

try {
  $dockerVersion = (& docker version --format "{{.Server.Version}}" 2>$null).Trim()
  Add-Check "Docker Engine" (-not [string]::IsNullOrWhiteSpace($dockerVersion)) "Docker Engine is reachable."
} catch {
  Add-Check "Docker Engine" $false "Docker Engine is not running or is not accessible to this account."
}

if ($environment -and (Test-Path -LiteralPath $composePath -PathType Leaf)) {
  try {
    & docker compose --env-file $ConfigPath -f $composePath config --quiet
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose rejected the deployment configuration." }
    Add-Check "Docker Compose configuration" $true "Compose resolved without printing secret values."
  } catch {
    Add-Check "Docker Compose configuration" $false "Docker Compose could not resolve the deployment configuration."
  }
} else {
  Add-Check "Docker Compose configuration" $false "Compose configuration could not be evaluated without a local .env file."
}

if ($CheckPublicHealth) {
  if ($environment -and $environment["SPS_PUBLIC_URL"]) {
    try {
      $health = Invoke-RestMethod -Uri "$($environment['SPS_PUBLIC_URL'])/api/health" -TimeoutSec 15
      Add-Check "Public SPS Hub health" ($health.status -eq "ok") "Public Hub health endpoint returned a response."
    } catch {
      Add-Check "Public SPS Hub health" $false "The public Hub health endpoint could not be reached."
    }
  } else {
    Add-Check "Public SPS Hub health" $false "No public Hub URL is configured."
  }
}

$checks | Format-Table -AutoSize
$failed = @($checks | Where-Object Status -eq "FAIL")
if ($failed.Count -gt 0) {
  throw "SPS public Hub deployment preflight failed: $($failed.Count) required check(s) remain."
}
