[CmdletBinding()]
param(
  [string]$HubUrl = $env:SPS_PUBLIC_URL,
  [string]$InstallerPath,
  [switch]$SkipHubRequest
)

$ErrorActionPreference = "Stop"
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Detail
  )
  $checks.Add([pscustomobject]@{
    Check = $Name
    Status = if ($Passed) { "PASS" } else { "FAIL" }
    Detail = $Detail
  })
}

function Is-PrivateOrLoopbackHost {
  param([string]$HostName)
  if ([string]::IsNullOrWhiteSpace($HostName)) { return $true }
  if ($HostName -in @("localhost", "::1", "127.0.0.1", "0.0.0.0")) { return $true }
  if ($HostName -match "^10\." -or $HostName -match "^192\.168\." -or $HostName -match "^172\.(1[6-9]|2[0-9]|3[0-1])\.") { return $true }
  return $false
}

function Resolve-SPSDesktopInstallerPath {
  param([string]$RequestedPath)

  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    return $RequestedPath
  }

  $desktopDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) "desktop"
  if (-not (Test-Path -LiteralPath $desktopDirectory -PathType Container)) {
    return $null
  }

  $candidates = @(
    Get-ChildItem -LiteralPath $desktopDirectory -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like "dist*" } |
      ForEach-Object {
        Get-ChildItem -LiteralPath $_.FullName -File -Filter "SPS Desktop Setup *.exe" -ErrorAction SilentlyContinue
      } |
      Sort-Object -Property LastWriteTimeUtc -Descending
  )

  return $candidates | Select-Object -First 1 -ExpandProperty FullName
}

$hubUri = $null
try {
  if ([string]::IsNullOrWhiteSpace($HubUrl)) { throw "SPS_PUBLIC_URL is not set." }
  $hubUri = [Uri]$HubUrl
  $isHttps = $hubUri.Scheme -eq "https"
  Add-Check "Public HTTPS Hub URL" $isHttps "Use an HTTPS URL reachable from a friend's computer."
  Add-Check "Public Hub host" (-not (Is-PrivateOrLoopbackHost $hubUri.Host)) "Localhost and private LAN addresses cannot be used for a remote friend invitation."
} catch {
  Add-Check "Public HTTPS Hub URL" $false $_.Exception.Message
}

$googleId = $env:SPS_GOOGLE_CLIENT_ID
$googleSecret = $env:SPS_GOOGLE_CLIENT_SECRET
Add-Check "Google OAuth client ID" (-not [string]::IsNullOrWhiteSpace($googleId)) "Set SPS_GOOGLE_CLIENT_ID on the Hub host."
Add-Check "Google OAuth client secret" (-not [string]::IsNullOrWhiteSpace($googleSecret)) "Set SPS_GOOGLE_CLIENT_SECRET on the Hub host; never commit it."
Add-Check "Google-only login mode" ($env:SPS_AUTH_GOOGLE_ONLY -eq "true") "Set SPS_AUTH_GOOGLE_ONLY=true after OAuth credentials are configured."

if ($hubUri -and -not $SkipHubRequest) {
  try {
    $origin = "{0}://{1}" -f $hubUri.Scheme, $hubUri.Authority
    $health = Invoke-RestMethod -Uri "$origin/api/health" -TimeoutSec 15
    Add-Check "Hub health request" ($health.status -eq "ok") "Hub reports status '$($health.status)'."
  } catch {
    Add-Check "Hub health request" $false "Could not reach the Hub from this computer: $($_.Exception.Message)"
  }
}

$resolvedInstallerPath = Resolve-SPSDesktopInstallerPath -RequestedPath $InstallerPath
if ($resolvedInstallerPath -and (Test-Path -LiteralPath $resolvedInstallerPath -PathType Leaf)) {
  $installer = Get-Item -LiteralPath $resolvedInstallerPath
  Add-Check "SPS Desktop installer" ($installer.Length -gt 0) "$($installer.FullName) ($($installer.Length) bytes)"
  $signature = Get-AuthenticodeSignature -FilePath $installer.FullName
  Add-Check "Trusted Windows code signature" ($signature.Status -eq "Valid") "Current signature status: $($signature.Status)."
} else {
  $expectedInstaller = if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
    "No SPS Desktop Setup *.exe file was found below sps-server\desktop\dist*."
  } else {
    "Installer not found: $InstallerPath"
  }
  Add-Check "SPS Desktop installer" $false $expectedInstaller
  Add-Check "Trusted Windows code signature" $false "No installer was available to verify."
}

$checks | Format-Table -AutoSize
$failed = @($checks | Where-Object Status -eq "FAIL")
if ($failed.Count -gt 0) {
  Write-Error ("SPS multi-node release preflight failed: {0} required check(s) remain." -f $failed.Count)
}

Write-Output "After every check passes: create an SPS invite, install SPS Desktop on the second PC, accept the invite with Google, register and approve the Node, grant an Agent, then run one real Task."
