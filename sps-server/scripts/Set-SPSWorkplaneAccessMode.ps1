param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("LocalOnly", "PrivateTailnet", "PrivateLan", "Public")]
  [string]$Mode,
  [string]$SPSConfigPath = (Join-Path $env:USERPROFILE ".sps\instances\default\config.json"),
  [string]$EnvironmentPath,
  [string[]]$AllowedHostname = @(),
  [string]$PublicBaseUrl,
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

function Read-EnvFileEntries {
  param([string]$Path)

  $entries = @{}
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $entries }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $match = [regex]::Match($trimmed, "^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$")
    if ($match.Success) { $entries[$match.Groups["key"].Value] = $match.Groups["value"].Value.Trim().Trim('"') }
  }
  return $entries
}

function Set-ObjectProperty {
  param([object]$Object, [string]$Name, $Value)

  $property = $Object.PSObject.Properties[$Name]
  if ($property) { $property.Value = $Value } else { $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value }
}

function Normalize-Hostname {
  param([string]$Value)

  $candidate = ([string]$Value).Trim().TrimEnd('.').ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($candidate)) { return $null }
  if ($candidate.Contains("://") -or $candidate.Contains("/") -or $candidate.Contains("@") -or $candidate.Contains(":")) {
    throw "AllowedHostname must be a hostname only, without a scheme, path, port, or user info: '$Value'"
  }
  if ([System.Uri]::CheckHostName($candidate) -eq [System.UriHostNameType]::Unknown) {
    throw "AllowedHostname is not a valid hostname: '$Value'"
  }
  return $candidate
}

function Get-RequiredAllowedHostnames {
  param([string[]]$Values)

  $normalized = @($Values | ForEach-Object { Normalize-Hostname $_ } | Where-Object { $_ } | Select-Object -Unique)
  if ($normalized.Count -eq 0) {
    throw "$Mode requires at least one -AllowedHostname. Use the Tailnet DNS name, trusted LAN hostname, or public hostname users will open."
  }
  return $normalized
}

if (-not (Test-Path -LiteralPath $SPSConfigPath -PathType Leaf)) { throw "SPS config was not found: $SPSConfigPath" }
if ([string]::IsNullOrWhiteSpace($EnvironmentPath)) { $EnvironmentPath = Join-Path (Split-Path -Parent $SPSConfigPath) ".env" }

try {
  $config = Get-Content -LiteralPath $SPSConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  throw "SPS config could not be read at '$SPSConfigPath': $($_.Exception.Message)"
}
if (-not $config.server) { $config | Add-Member -NotePropertyName server -NotePropertyValue ([pscustomobject]@{}) }
if (-not $config.auth) { $config | Add-Member -NotePropertyName auth -NotePropertyValue ([pscustomobject]@{}) }

if ($Mode -ne "LocalOnly") {
  $environment = Read-EnvFileEntries -Path $EnvironmentPath
  $hasAuthenticationSecret = -not [string]::IsNullOrWhiteSpace([string]$environment["BETTER_AUTH_SECRET"]) -or -not [string]::IsNullOrWhiteSpace([string]$environment["PAPERCLIP_AGENT_JWT_SECRET"])
  if (-not $hasAuthenticationSecret) {
    throw "$Mode was not applied because '$EnvironmentPath' does not contain BETTER_AUTH_SECRET or PAPERCLIP_AGENT_JWT_SECRET. Add a strong secret outside SPS chat, then run this command again."
  }
}

$server = $config.server
$auth = $config.auth
switch ($Mode) {
  "LocalOnly" {
    Set-ObjectProperty $server "deploymentMode" "local_trusted"; Set-ObjectProperty $server "exposure" "private"; Set-ObjectProperty $server "bind" "loopback"; Set-ObjectProperty $server "host" "127.0.0.1"; Set-ObjectProperty $server "customBindHost" $null; Set-ObjectProperty -Object $server -Name "allowedHostnames" -Value ([string[]]@()); Set-ObjectProperty $auth "baseUrlMode" "auto"; Set-ObjectProperty $auth "publicBaseUrl" $null
  }
  "PrivateTailnet" {
    Set-ObjectProperty $server "deploymentMode" "authenticated"; Set-ObjectProperty $server "exposure" "private"; Set-ObjectProperty $server "bind" "tailnet"; Set-ObjectProperty $server "host" "127.0.0.1"; Set-ObjectProperty $server "customBindHost" $null; Set-ObjectProperty -Object $server -Name "allowedHostnames" -Value ([string[]]@(Get-RequiredAllowedHostnames $AllowedHostname)); Set-ObjectProperty $auth "baseUrlMode" "auto"; Set-ObjectProperty $auth "publicBaseUrl" $null
  }
  "PrivateLan" {
    Set-ObjectProperty $server "deploymentMode" "authenticated"; Set-ObjectProperty $server "exposure" "private"; Set-ObjectProperty $server "bind" "lan"; Set-ObjectProperty $server "host" "0.0.0.0"; Set-ObjectProperty $server "customBindHost" $null; Set-ObjectProperty -Object $server -Name "allowedHostnames" -Value ([string[]]@(Get-RequiredAllowedHostnames $AllowedHostname)); Set-ObjectProperty $auth "baseUrlMode" "auto"; Set-ObjectProperty $auth "publicBaseUrl" $null
  }
  "Public" {
    if ([string]::IsNullOrWhiteSpace($PublicBaseUrl)) { throw "Public requires -PublicBaseUrl with an HTTPS URL, for example https://workplane.example.com" }
    $publicUri = $null
    if (-not [System.Uri]::TryCreate($PublicBaseUrl, [System.UriKind]::Absolute, [ref]$publicUri) -or $publicUri.Scheme -ne "https") { throw "PublicBaseUrl must be an absolute HTTPS URL." }
    $hosts = @(Get-RequiredAllowedHostnames $AllowedHostname)
    $publicHost = Normalize-Hostname $publicUri.Host
    if ($hosts -notcontains $publicHost) { $hosts += $publicHost }
    Set-ObjectProperty $server "deploymentMode" "authenticated"; Set-ObjectProperty $server "exposure" "public"; Set-ObjectProperty $server "bind" "lan"; Set-ObjectProperty $server "host" "0.0.0.0"; Set-ObjectProperty $server "customBindHost" $null; Set-ObjectProperty -Object $server -Name "allowedHostnames" -Value ([string[]]$hosts); Set-ObjectProperty $auth "baseUrlMode" "explicit"; Set-ObjectProperty $auth "publicBaseUrl" $publicUri.AbsoluteUri.TrimEnd("/")
  }
}

$directory = Split-Path -Parent $SPSConfigPath
if (-not $NoBackup) {
  $backupPath = Join-Path $directory ("config.before-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
  Copy-Item -LiteralPath $SPSConfigPath -Destination $backupPath -ErrorAction Stop
} else { $backupPath = $null }

$json = $config | ConvertTo-Json -Depth 32
[System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $SPSConfigPath), $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

return [pscustomobject]@{
  applied = $true
  mode = $Mode
  configPath = $SPSConfigPath
  backupPath = $backupPath
  restartCommand = ".\scripts\Start-SPS.ps1 -Restart"
  preflightCommand = ".\scripts\Test-SPSWorkplaneCollaboration.ps1 | Format-List"
  message = "Access mode was saved. Restart the Workplane and run collaboration preflight before inviting anyone."
}
