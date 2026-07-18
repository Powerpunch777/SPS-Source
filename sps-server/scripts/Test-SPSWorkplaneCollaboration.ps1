param(
  [string]$SPSConfigPath = (Join-Path $env:USERPROFILE ".sps\instances\default\config.json"),
  [switch]$SkipListenerCheck
)

$ErrorActionPreference = "Stop"

function Test-NonEmptyEnvironmentValue {
  param([hashtable]$Values, [string]$Name)
  $value = [string]$Values[$Name]
  return -not [string]::IsNullOrWhiteSpace($value)
}

function Read-EnvFileEntries {
  param([string]$Path)
  $entries = @{}
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $entries }

  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $match = [regex]::Match($trimmed, "^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$")
    if (-not $match.Success) { continue }
    $entries[$match.Groups["key"].Value] = $match.Groups["value"].Value.Trim().Trim('"')
  }
  return $entries
}

if (-not (Test-Path -LiteralPath $SPSConfigPath -PathType Leaf)) {
  throw "SPS config was not found: $SPSConfigPath"
}

try {
  $config = Get-Content -Raw -Encoding UTF8 -LiteralPath $SPSConfigPath | ConvertFrom-Json
} catch {
  throw "SPS config could not be read at '$SPSConfigPath': $($_.Exception.Message)"
}

$server = $config.server
$auth = $config.auth
$listenHost = [string]$server.host
$port = [int]$server.port
$mode = [string]$server.deploymentMode
$exposure = [string]$server.exposure
$bind = [string]$server.bind
if ([string]::IsNullOrWhiteSpace($bind)) {
  $bind = if ($listenHost -in @("127.0.0.1", "localhost", "::1")) { "loopback" } elseif ($listenHost -in @("0.0.0.0", "::")) { "lan" } else { "custom" }
}

$envPath = Join-Path (Split-Path -Parent $SPSConfigPath) ".env"
$envEntries = Read-EnvFileEntries -Path $envPath
$hasAuthSecret = (Test-NonEmptyEnvironmentValue -Values $envEntries -Name "BETTER_AUTH_SECRET") -or (Test-NonEmptyEnvironmentValue -Values $envEntries -Name "PAPERCLIP_AGENT_JWT_SECRET")
$allowedHostnames = @($server.allowedHostnames | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
$checks = [System.Collections.Generic.List[object]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

if ($mode -eq "local_trusted" -and $bind -eq "loopback") {
  $checks.Add([pscustomobject]@{ name = "Access mode"; status = "pass"; message = "Local-only mode is safely bound to loopback." })
} elseif ($mode -eq "authenticated") {
  if ($hasAuthSecret) {
    $checks.Add([pscustomobject]@{ name = "Authentication secret"; status = "pass"; message = "An authentication secret is configured." })
  } else {
    $checks.Add([pscustomobject]@{ name = "Authentication secret"; status = "fail"; message = "Authenticated access requires BETTER_AUTH_SECRET or PAPERCLIP_AGENT_JWT_SECRET in the SPS .env file." })
  }
} else {
  $checks.Add([pscustomobject]@{ name = "Access mode"; status = "fail"; message = "Non-loopback collaboration must use authenticated mode." })
}

if ($mode -eq "authenticated" -and $exposure -eq "private" -and $bind -eq "tailnet") {
  $checks.Add([pscustomobject]@{ name = "Private network"; status = "pass"; message = "Tailnet binding is configured for authenticated private collaboration." })
  if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    $warnings.Add("Tailscale was not found in PATH. The configured address may be stale until Tailscale is installed and connected.")
  }
} elseif ($mode -eq "authenticated" -and $exposure -eq "private" -and $bind -eq "lan") {
  $checks.Add([pscustomobject]@{ name = "Private network"; status = "warn"; message = "Authenticated LAN binding is configured. Prefer Tailnet when collaborators are not on the same trusted LAN." })
} elseif ($mode -eq "authenticated" -and $exposure -eq "public") {
  $publicBaseUrl = [string]$auth.publicBaseUrl
  if ($auth.baseUrlMode -eq "explicit" -and $publicBaseUrl.StartsWith("https://")) {
    $checks.Add([pscustomobject]@{ name = "Public URL"; status = "pass"; message = "Public authenticated access has an explicit HTTPS URL." })
  } else {
    $checks.Add([pscustomobject]@{ name = "Public URL"; status = "fail"; message = "Public access requires auth.baseUrlMode=explicit and an HTTPS auth.publicBaseUrl." })
  }
}

if ($mode -eq "authenticated" -and $exposure -eq "private") {
  if ($allowedHostnames.Count -gt 0) {
    $checks.Add([pscustomobject]@{ name = "Trusted hostname"; status = "pass"; message = "$($allowedHostnames.Count) trusted private hostname(s) are configured." })
  } else {
    $checks.Add([pscustomobject]@{ name = "Trusted hostname"; status = "fail"; message = "Add the Tailnet DNS name or trusted private hostname before inviting collaborators." })
  }
}

$listener = $null
if (-not $SkipListenerCheck -and $port -ge 1 -and $port -le 65535) {
  $listener = Get-NetTCPConnection -LocalAddress $listenHost -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $checks.Add([pscustomobject]@{ name = "Server listener"; status = "pass"; message = "SPS is listening on the configured host and port." })
  } else {
    $checks.Add([pscustomobject]@{ name = "Server listener"; status = "warn"; message = "No listener was found at the configured host and port. Start or restart the Workplane after changing access mode." })
  }
}

$hasFailures = @($checks | Where-Object { $_.status -eq "fail" }).Count -gt 0
$isLocalOnly = $mode -eq "local_trusted" -and $bind -eq "loopback"
$remoteConfigured = $mode -eq "authenticated" -and $bind -ne "loopback" -and -not $hasFailures
$state = if ($isLocalOnly) { "local_only" } elseif ($remoteConfigured) { "collaboration_ready" } else { "configuration_incomplete" }
$recommendation = switch ($state) {
  "local_only" { "Keep local-only mode for solo work. For a friend, use authenticated/private Tailnet access rather than exposing the local server directly." }
  "collaboration_ready" { "Invite the collaborator as an Operator, then run the two-person browser acceptance checklist in 93-collaboration-deployment-readiness-ko.md." }
  default { "Fix the failed checks, restart with Start-SPS.ps1, and run this preflight again before inviting collaborators." }
}

return [pscustomobject]@{
  state = $state
  localOnlySafeDefault = $isLocalOnly
  collaborationReady = $remoteConfigured
  configPath = $SPSConfigPath
  environmentPath = $envPath
  server = [pscustomobject]@{
    deploymentMode = $mode
    exposure = $exposure
    bind = $bind
    listenHost = $listenHost
    port = $port
    allowedHostnames = $allowedHostnames
    listenerProcessId = if ($listener) { $listener.OwningProcess } else { $null }
  }
  checks = @($checks)
  warnings = @($warnings)
  recommendation = $recommendation
}
