param(
  [string]$SPSHost = "",
  [int]$SPSPort = 0,
  [string]$SPSConfigPath = (Join-Path $env:USERPROFILE ".sps\instances\default\config.json"),
  [string]$SidecarHost = "127.0.0.1",
  [int]$SidecarPort = 3188,
  [string]$CorePath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "external\sps-core"),
  [int]$TimeoutSec = 30,
  [switch]$EnableLegacyDirectTaskBroker,
  [switch]$SkipDirectTaskBroker,
  # These legacy migration helpers mutate third-party adapter or Agent settings.
  # They are opt-in so a normal product restart never rewrites Organization data.
  [switch]$EnableAgyPromptSync,
  [switch]$EnableAgyQuotaCompatibility,
  [switch]$EnableFlatOrganizationSync,
  [switch]$SkipAgyPromptSync,
  [switch]$SkipAgyQuotaCompatibility,
  [switch]$SkipFlatOrganizationSync,
  [switch]$SkipRoomChatPluginBuild,
  [switch]$Restart,
  [switch]$DryRun
)

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
try {
  [Console]::InputEncoding = $utf8NoBom
  [Console]::OutputEncoding = $utf8NoBom
} catch {
  # Hidden bootstrap processes may not have an attached console.
}
$OutputEncoding = $utf8NoBom

$ErrorActionPreference = "Stop"

if ($EnableAgyPromptSync -and $SkipAgyPromptSync) {
  throw "EnableAgyPromptSync and SkipAgyPromptSync cannot be used together."
}
if ($EnableAgyQuotaCompatibility -and $SkipAgyQuotaCompatibility) {
  throw "EnableAgyQuotaCompatibility and SkipAgyQuotaCompatibility cannot be used together."
}
if ($EnableFlatOrganizationSync -and $SkipFlatOrganizationSync) {
  throw "EnableFlatOrganizationSync and SkipFlatOrganizationSync cannot be used together."
}

function Resolve-SPSServerEndpoint {
  param(
    [string]$ConfigPath,
    [bool]$HostWasExplicit,
    [string]$RequestedHost,
    [bool]$PortWasExplicit,
    [int]$RequestedPort
  )

  $configHost = "127.0.0.1"
  $configPort = 3100
  if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
    try {
      $config = Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigPath | ConvertFrom-Json
      $configuredHost = [string]$config.server.host
      $configuredPort = [int]$config.server.port
      if (-not [string]::IsNullOrWhiteSpace($configuredHost)) {
        $configHost = $configuredHost.Trim()
      }
      if ($configuredPort -ge 1 -and $configuredPort -le 65535) {
        $configPort = $configuredPort
      }
    } catch {
      throw "SPS server config could not be read at '$ConfigPath': $($_.Exception.Message)"
    }
  }

  $listenHost = if ($HostWasExplicit) { $RequestedHost.Trim() } else { $configHost }
  $port = if ($PortWasExplicit) { $RequestedPort } else { $configPort }
  if ([string]::IsNullOrWhiteSpace($listenHost)) {
    throw "SPSHost must be non-empty when supplied explicitly."
  }
  if ($port -lt 1 -or $port -gt 65535) {
    throw "SPSPort must be between 1 and 65535."
  }

  # A server bound to every interface can still be health-checked locally, but
  # 0.0.0.0 itself is not a browser destination. Tailnet/custom addresses are
  # checked at their configured address so the bootstrap notices a bad bind.
  $healthHost = if ($listenHost -in @("0.0.0.0", "::", "[::]")) { "127.0.0.1" } else { $listenHost }
  return [pscustomobject]@{
    listenHost = $listenHost
    healthHost = $healthHost
    port = $port
    configPath = $ConfigPath
    resolvedFromConfig = (-not $HostWasExplicit -or -not $PortWasExplicit)
  }
}

$paperclipHostWasExplicit = $PSBoundParameters.ContainsKey("SPSHost")
$paperclipPortWasExplicit = $PSBoundParameters.ContainsKey("SPSPort")
$paperclipEndpoint = Resolve-SPSServerEndpoint `
  -ConfigPath $SPSConfigPath `
  -HostWasExplicit $paperclipHostWasExplicit `
  -RequestedHost $SPSHost `
  -PortWasExplicit $paperclipPortWasExplicit `
  -RequestedPort $SPSPort
$SPSHost = $paperclipEndpoint.listenHost
$SPSPort = $paperclipEndpoint.port
$paperclipHealthHost = $paperclipEndpoint.healthHost

# Helper to check if a TCP port is listening on the local address
function Get-ListeningConnection {
  param(
    [string]$HostName,
    [int]$Port
  )
  Get-NetTCPConnection -LocalAddress $HostName -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" } |
    Select-Object -First 1
}

function Get-SPSProcessIdentity {
  param(
    [int]$ProcessId,
    [string]$ExpectedCorePath
  )

  $expectedPath = [IO.Path]::GetFullPath($ExpectedCorePath).TrimEnd('\')
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
    $commandLine = [string]$process.CommandLine
    return [pscustomobject]@{
      processId = $ProcessId
      commandLine = $commandLine
      localCore = ($commandLine.IndexOf($expectedPath, [StringComparison]::OrdinalIgnoreCase) -ge 0)
      expectedCorePath = $expectedPath
    }
  } catch {
    return [pscustomobject]@{
      processId = $ProcessId
      commandLine = $null
      localCore = $false
      expectedCorePath = $expectedPath
    }
  }
}

function Get-SPSLauncherRoot {
  param(
    [int]$ProcessId,
    [string]$LauncherPath
  )

  $expectedLauncher = [IO.Path]::GetFullPath($LauncherPath)
  $currentId = $ProcessId
  $visited = @{}
  while ($currentId -gt 0 -and -not $visited.ContainsKey($currentId)) {
    $visited[$currentId] = $true
    try {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId=$currentId" -ErrorAction Stop
    } catch {
      break
    }
    $commandLine = [string]$process.CommandLine
    if ($commandLine.IndexOf($expectedLauncher, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return [pscustomobject]@{
        processId = [int]$process.ProcessId
        commandLine = $commandLine
      }
    }
    $currentId = [int]$process.ParentProcessId
  }
  return $null
}

function Stop-VerifiedProcessTree {
  param([int]$RootProcessId)

  $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootProcessId)
  do {
    $added = $false
    foreach ($process in $processes) {
      if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) {
        $added = $true
      }
    }
  } while ($added)

  $orderedIds = @($ids) | Sort-Object -Descending
  foreach ($id in $orderedIds) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}

function Stop-VerifiedEmbeddedPostgresProcesses {
  param([string]$ExpectedCorePath)

  # Embedded PostgreSQL can outlive its Node launcher on Windows. This sweep is
  # only called immediately after stopping the verified launcher for this core.
  $normalizedCore = [IO.Path]::GetFullPath($ExpectedCorePath).TrimEnd('\').Replace('\', '/')
  $embeddedToken = "$normalizedCore/node_modules/.pnpm/@embedded-postgres+"
  $stoppedIds = @()
  foreach ($process in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
    if ($process.Name -notmatch '^postgres(\.exe)?$') { continue }
    $commandLine = ([string]$process.CommandLine).Replace('\', '/')
    if ($commandLine.IndexOf($embeddedToken, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
    Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
    $stoppedIds += [int]$process.ProcessId
  }
  return $stoppedIds
}

function Remove-StaleEmbeddedPostgresPidFile {
  param([string]$DataDirectory)

  $pidFile = Join-Path $DataDirectory 'postmaster.pid'
  if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) { return $false }

  $lines = @(Get-Content -LiteralPath $pidFile -Encoding UTF8 -ErrorAction SilentlyContinue)
  $postmasterPid = 0
  [void][int]::TryParse([string]$lines[0], [ref]$postmasterPid)
  $port = 0
  if ($lines.Count -ge 4) {
    [void][int]::TryParse([string]$lines[3], [ref]$port)
  }

  $processExists = $postmasterPid -gt 0 -and $null -ne (Get-Process -Id $postmasterPid -ErrorAction SilentlyContinue)
  $portListening = $port -ge 1 -and $port -le 65535 -and $null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($processExists -or $portListening) { return $false }

  # A verified launcher stop can leave this lock behind after PostgreSQL exits.
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction Stop
  return $true
}

function Invoke-RoomChatPluginBuild {
  param(
    [string]$PluginRoot,
    [string]$BuildLogPath
  )

  $packageJson = Join-Path $PluginRoot 'package.json'
  $esbuildCommand = Join-Path $PluginRoot 'node_modules/.bin/esbuild.cmd'
  if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
    throw "Room Chat plugin package.json was not found at: $packageJson"
  }
  if (-not (Test-Path -LiteralPath $esbuildCommand -PathType Leaf)) {
    throw "Room Chat plugin dependencies are missing. Run 'npm ci' in: $PluginRoot"
  }

  Push-Location $PluginRoot
  try {
    # npm can emit non-fatal warnings on stderr. Preserve the complete build log
    # and decide success from the native process exit code.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & npm.cmd run build *>> $BuildLogPath
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
  } finally {
    Pop-Location
  }
  if ($exitCode -ne 0) {
    throw "Room Chat plugin build failed with exit code $exitCode. See: $BuildLogPath"
  }
  return [pscustomobject]@{ enabled = $true; ready = $true; built = $true; reason = 'built'; logPath = $BuildLogPath }
}

# Helper to check if a HTTP endpoint is returning status:ok or ok:true
function Get-MemorySidecarHealthHeaders {
  param([string]$ConfigPath)

  $token = [string]$env:MEMORY_SIDECAR_TOKEN
  if ([string]::IsNullOrWhiteSpace($token) -and (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    try {
      $config = Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigPath | ConvertFrom-Json
      $token = [string]$config.security.token
    } catch {
      throw "Memory Sidecar config could not be read for health verification: $($_.Exception.Message)"
    }
  }
  if ([string]::IsNullOrWhiteSpace($token)) { return @{} }
  return @{ "x-sidecar-token" = $token }
}

function Test-HttpHealth {
  param(
    [string]$Url,
    [hashtable]$Headers = @{}
  )
  try {
    $resp = Invoke-RestMethod -Uri $Url -Method Get -Headers $Headers -TimeoutSec 3 -ErrorAction Stop
    if ($null -eq $resp) {
      return $false
    }
    if ($resp.PSObject.Properties.Name -contains "ok") {
      return [bool]$resp.ok
    }
    if ($resp.PSObject.Properties.Name -contains "status") {
      return $resp.status -eq "ok"
    }
    return $true
  } catch {
    return $false
  }
}

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $workspaceRoot "logs"
$roomChatPluginRoot = Join-Path $workspaceRoot 'sps-room-chat'
$memorySidecarConfigPath = Join-Path $workspaceRoot "memory-sidecar\config.local.json"
$memorySidecarHealthHeaders = Get-MemorySidecarHealthHeaders -ConfigPath $memorySidecarConfigPath
$agyQuotaCompatibility = [pscustomobject]@{ enabled = ($EnableAgyQuotaCompatibility -and -not $SkipAgyQuotaCompatibility); ready = $true; changed = $false; reason = if ($EnableAgyQuotaCompatibility -and -not $SkipAgyQuotaCompatibility) { 'not_checked' } else { 'disabled_by_default' } }

# Ensure logs directory exists if not dry-running
if (-not $DryRun) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

if ($EnableAgyQuotaCompatibility -and -not $SkipAgyQuotaCompatibility) {
  $agyQuotaCompatibilityScript = Join-Path $PSScriptRoot 'Apply-SPSAgyQuotaCompatibility.ps1'
  if (-not (Test-Path -LiteralPath $agyQuotaCompatibilityScript -PathType Leaf)) {
    $agyQuotaCompatibility = [pscustomobject]@{ enabled = $true; ready = $false; changed = $false; reason = 'compatibility_script_missing' }
  } else {
    try {
      $compatibilityResult = & $agyQuotaCompatibilityScript -DryRun:$DryRun
      $agyQuotaCompatibility = [pscustomobject]@{
        enabled = $true
        ready = [bool]$compatibilityResult.ready
        changed = [bool]$compatibilityResult.changed
        reason = if ($DryRun) { 'dry_run' } elseif ($compatibilityResult.changed) { 'patched' } else { 'verified' }
      }
    } catch {
      $agyQuotaCompatibility = [pscustomobject]@{ enabled = $true; ready = $false; changed = $false; reason = $_.Exception.Message }
    }
  }
}

$paperclipUrl = "http://${paperclipHealthHost}:${SPSPort}"
$paperclipListenUrl = "http://${SPSHost}:${SPSPort}"
$sidecarUrl = "http://${SidecarHost}:${SidecarPort}"

# 1. Detect Initial Status
$paperclipConn = Get-ListeningConnection -HostName $SPSHost -Port $SPSPort
$sidecarConn = Get-ListeningConnection -HostName $SidecarHost -Port $SidecarPort

$paperclipAlreadyRunning = $null -ne $paperclipConn
$sidecarAlreadyRunning = $null -ne $sidecarConn

$paperclipStarted = $false
$paperclipRestartedUnhealthy = $false
$sidecarStarted = $false
$directTaskBroker = [pscustomobject]@{ enabled = $false; ready = $true; alreadyRunning = $false; started = $false; processId = $null; reason = 'disabled_by_default' }
$agyPromptSync = [pscustomobject]@{ enabled = ($EnableAgyPromptSync -and -not $SkipAgyPromptSync); ready = $true; checkedCount = 0; updatedCount = 0; reason = if ($EnableAgyPromptSync -and -not $SkipAgyPromptSync) { 'not_checked' } else { 'disabled_by_default' } }
$flatOrganizationSync = [pscustomobject]@{ enabled = ($EnableFlatOrganizationSync -and -not $SkipFlatOrganizationSync); ready = $true; companyCount = 0; checkedCount = 0; updatedCount = 0; reason = if ($EnableFlatOrganizationSync -and -not $SkipFlatOrganizationSync) { 'not_checked' } else { 'disabled_by_default' } }
$roomChatPlugin = [pscustomobject]@{ enabled = (-not $SkipRoomChatPluginBuild); ready = $true; built = $false; reason = if ($SkipRoomChatPluginBuild) { 'skipped' } else { 'not_needed' }; logPath = $null }
$coreUiBundle = [pscustomobject]@{ ready = $true; built = $false; copied = $false; reason = 'not_needed'; buildLogPath = $null }

$paperclipPid = if ($paperclipAlreadyRunning) { $paperclipConn.OwningProcess } else { $null }
$sidecarPid = if ($sidecarAlreadyRunning) { $sidecarConn.OwningProcess } else { $null }
$paperclipIdentity = if ($paperclipAlreadyRunning) {
  Get-SPSProcessIdentity -ProcessId $paperclipPid -ExpectedCorePath $CorePath
} else {
  $null
}

if ($paperclipAlreadyRunning -and -not $paperclipIdentity.localCore) {
  throw "Workplane Bootstrap Failed: port $SPSPort is owned by PID $paperclipPid, but that process is not the local Workplane core at '$($paperclipIdentity.expectedCorePath)'. Command: $($paperclipIdentity.commandLine)"
}

# Build before stopping an existing server. A failed build must leave the
# verified running Workplane intact instead of taking the development UI down.
if (-not $SkipRoomChatPluginBuild -and ($Restart -or -not $paperclipAlreadyRunning)) {
  if ($DryRun) {
    $roomChatPlugin = [pscustomobject]@{ enabled = $true; ready = $true; built = $false; reason = 'dry_run'; logPath = $null }
  } else {
    $roomChatPluginBuildLog = Join-Path $logDir 'room-chat-plugin-build.log'
    $roomChatPlugin = Invoke-RoomChatPluginBuild -PluginRoot $roomChatPluginRoot -BuildLogPath $roomChatPluginBuildLog
    Write-Output "[sps] Built the local Room Chat plugin."
  }
}

# The local server intentionally serves the production UI bundle. Synchronize it
# before stopping a healthy process so a failed frontend build never takes the
# currently working Workplane offline.
if ($Restart -or -not $paperclipAlreadyRunning) {
  if ($DryRun) {
    $coreUiBundle = [pscustomobject]@{ ready = $true; built = $false; copied = $false; reason = 'dry_run'; buildLogPath = $null }
  } else {
    $coreUiBundleScript = Join-Path $PSScriptRoot 'Ensure-SPSCoreUiBundle.ps1'
    if (-not (Test-Path -LiteralPath $coreUiBundleScript -PathType Leaf)) {
      throw "SPS Core UI bundle synchronizer was not found at: $coreUiBundleScript"
    }
    $coreUiBundleLog = Join-Path $logDir 'sps-core-ui-build.log'
    $coreUiBundle = & $coreUiBundleScript -CorePath $CorePath -BuildLogPath $coreUiBundleLog
    $coreUiBundle | Add-Member -NotePropertyName reason -NotePropertyValue 'synchronized' -Force
    Write-Output "[sps] Core UI bundle is current (built=$($coreUiBundle.built), copied=$($coreUiBundle.copied))."
  }
}

if ($Restart -and $paperclipAlreadyRunning -and -not $DryRun) {
  Write-Output "[sps] Restarting the verified local Workplane process."
  $paperclipStarter = Join-Path $PSScriptRoot "Start-SPSLocalServer.ps1"
  $launcherRoot = Get-SPSLauncherRoot -ProcessId $paperclipPid -LauncherPath $paperclipStarter
  if (-not $launcherRoot) {
    throw "Workplane Bootstrap Failed: could not find the verified local launcher ancestor for PID $paperclipPid."
  }
  Stop-VerifiedProcessTree -RootProcessId $launcherRoot.processId
  $stoppedPostgresIds = Stop-VerifiedEmbeddedPostgresProcesses -ExpectedCorePath $CorePath
  if ($stoppedPostgresIds.Count -gt 0) {
    Write-Output "[sps] Stopped $($stoppedPostgresIds.Count) orphaned embedded PostgreSQL process(es)."
  }
  $releaseWatch = [System.Diagnostics.Stopwatch]::StartNew()
  while ($releaseWatch.Elapsed.TotalSeconds -lt 10 -and (Get-ListeningConnection -HostName $SPSHost -Port $SPSPort)) {
    Start-Sleep -Milliseconds 250
  }
  $releaseWatch.Stop()
  if (Get-ListeningConnection -HostName $SPSHost -Port $SPSPort) {
    throw "Workplane Bootstrap Failed: verified local core PID $paperclipPid did not release port $SPSPort."
  }
  $paperclipAlreadyRunning = $false
  $paperclipConn = $null
  $paperclipPid = $null
  $paperclipIdentity = $null
  $paperclipRestartedUnhealthy = $true
}

# The external adapter module is loaded into the SPS process. Restart only
# the verified local launcher tree when a newly applied compatibility patch must
# be loaded; an already verified patch never causes a restart.
if ($paperclipAlreadyRunning -and $agyQuotaCompatibility.changed -and -not $DryRun) {
  Write-Warning "[sps] Agy quota compatibility changed; restarting the verified local Workplane process."
  $paperclipStarter = Join-Path $PSScriptRoot "Start-SPSLocalServer.ps1"
  $launcherRoot = Get-SPSLauncherRoot -ProcessId $paperclipPid -LauncherPath $paperclipStarter
  if ($launcherRoot) {
    Stop-VerifiedProcessTree -RootProcessId $launcherRoot.processId
    Stop-VerifiedEmbeddedPostgresProcesses -ExpectedCorePath $CorePath | Out-Null
  } else {
    Stop-Process -Id $paperclipPid -Force -ErrorAction Stop
  }
  $releaseWatch = [System.Diagnostics.Stopwatch]::StartNew()
  while ($releaseWatch.Elapsed.TotalSeconds -lt 10 -and (Get-ListeningConnection -HostName $SPSHost -Port $SPSPort)) {
    Start-Sleep -Milliseconds 250
  }
  $releaseWatch.Stop()
  if (Get-ListeningConnection -HostName $SPSHost -Port $SPSPort) {
    throw "Workplane Bootstrap Failed: patched local core PID $paperclipPid did not release port $SPSPort."
  }
  $paperclipAlreadyRunning = $false
  $paperclipConn = $null
  $paperclipPid = $null
  $paperclipIdentity = $null
  $paperclipRestartedUnhealthy = $true
}

# A listener is not enough: a wedged local Node process can keep the port while
# every HTTP request times out. Only recycle it after verifying its exact core path.
if ($paperclipAlreadyRunning -and -not $DryRun) {
  $existingServerHealthy = $false
  foreach ($attempt in 1..3) {
    if (Test-HttpHealth -Url "$paperclipUrl/api/health") {
      $existingServerHealthy = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $existingServerHealthy) {
    Write-Warning "[sps] Local Workplane PID $paperclipPid is listening but unhealthy; restarting it."
    $paperclipStarter = Join-Path $PSScriptRoot "Start-SPSLocalServer.ps1"
    $launcherRoot = Get-SPSLauncherRoot -ProcessId $paperclipPid -LauncherPath $paperclipStarter
    if ($launcherRoot) {
      Stop-VerifiedProcessTree -RootProcessId $launcherRoot.processId
      Stop-VerifiedEmbeddedPostgresProcesses -ExpectedCorePath $CorePath | Out-Null
    } else {
      Stop-Process -Id $paperclipPid -Force -ErrorAction Stop
    }
    $releaseWatch = [System.Diagnostics.Stopwatch]::StartNew()
    while ($releaseWatch.Elapsed.TotalSeconds -lt 10 -and (Get-ListeningConnection -HostName $SPSHost -Port $SPSPort)) {
      Start-Sleep -Milliseconds 250
    }
    $releaseWatch.Stop()
    if (Get-ListeningConnection -HostName $SPSHost -Port $SPSPort) {
      throw "Workplane Bootstrap Failed: unhealthy local core PID $paperclipPid did not release port $SPSPort."
    }

    $paperclipAlreadyRunning = $false
    $paperclipConn = $null
    $paperclipPid = $null
    $paperclipIdentity = $null
    $paperclipRestartedUnhealthy = $true
  }
}

# 2. Launch Unavailable Components
if (-not $paperclipAlreadyRunning) {
  if ($DryRun) {
    Write-Output "[DryRun] Would start SPS on $paperclipUrl"
  } else {
    $embeddedPostgresDataDir = Join-Path $env:USERPROFILE '.sps\instances\default\db'
    if (Remove-StaleEmbeddedPostgresPidFile -DataDirectory $embeddedPostgresDataDir) {
      Write-Output "[sps] Removed a stale embedded PostgreSQL postmaster.pid after verifying no process or port listener remains."
    }
    $paperclipStarter = Join-Path $PSScriptRoot "Start-SPSLocalServer.ps1"
    if (-not (Test-Path -LiteralPath $paperclipStarter -PathType Leaf)) {
      throw "SPS local server launcher not found at: $paperclipStarter"
    }

    # Keep a path containing spaces intact when starting the background PowerShell process.
    $paperclipLaunchArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$paperclipStarter`" -SPSConfigPath `"$SPSConfigPath`""
    $paperclipLauncherOutput = Join-Path $logDir "sps-launcher.out.log"
    $paperclipLauncherError = Join-Path $logDir "sps-launcher.err.log"
    $process = Start-Process -FilePath "powershell.exe" `
      -ArgumentList $paperclipLaunchArgs `
      -WorkingDirectory $workspaceRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $paperclipLauncherOutput `
      -RedirectStandardError $paperclipLauncherError `
      -PassThru
    $paperclipStarted = $true
    $paperclipPid = $process.Id
  }
}

if (-not $sidecarAlreadyRunning) {
  if ($DryRun) {
    Write-Output "[DryRun] Would start Memory Sidecar on $sidecarUrl"
  } else {
    $sidecarScript = Join-Path $workspaceRoot "memory-sidecar\Start-MemorySidecarBackground.ps1"
    if (-not (Test-Path -LiteralPath $sidecarScript)) {
      throw "Memory Sidecar start script not found at: $sidecarScript"
    }
    
    # Established local launch path: Start-MemorySidecarBackground.ps1
    # Run the script. It returns a pscustomobject and doesn't block.
    $sidecarRes = & $sidecarScript -HostName $SidecarHost -Port $SidecarPort
    $sidecarStarted = $true
    if ($sidecarRes -and $sidecarRes.processId) {
      $sidecarPid = $sidecarRes.processId
    }
  }
}

# 3. Wait/Poll for Health responses
$paperclipReady = $false
$sidecarReady = $false

if ($DryRun) {
  # In dry run, simulate status based on detection
  $paperclipReady = $paperclipAlreadyRunning
  $sidecarReady = $sidecarAlreadyRunning
} else {
  $startTime = [System.Diagnostics.Stopwatch]::StartNew()
  while ($startTime.Elapsed.TotalSeconds -lt $TimeoutSec) {
    if (-not $paperclipReady) {
      $healthOk = Test-HttpHealth -Url "$paperclipUrl/api/health"
      if ($healthOk) {
        $liveConnection = Get-ListeningConnection -HostName $SPSHost -Port $SPSPort
        if ($liveConnection) {
          $paperclipIdentity = Get-SPSProcessIdentity -ProcessId $liveConnection.OwningProcess -ExpectedCorePath $CorePath
          $paperclipReady = [bool]$paperclipIdentity.localCore
        }
      }
    }
    if (-not $sidecarReady) {
      $sidecarReady = Test-HttpHealth -Url "$sidecarUrl/health" -Headers $memorySidecarHealthHeaders
    }
    
    if ($paperclipReady -and $sidecarReady) {
      break
    }
    Start-Sleep -Seconds 1
  }
  $startTime.Stop()
}

if ($EnableLegacyDirectTaskBroker -and -not $SkipDirectTaskBroker) {
  $brokerStarter = Join-Path $workspaceRoot 'direct-task-pipe-broker\Start-DirectTaskPipeBrokerBackground.ps1'
  if (Test-Path -LiteralPath $brokerStarter -PathType Leaf) {
    $directTaskBroker = & $brokerStarter -TimeoutSec $TimeoutSec -DryRun:$DryRun
  }
}

if ($EnableAgyPromptSync -and -not $SkipAgyPromptSync -and $paperclipReady) {
  $agyPromptSyncScript = Join-Path $PSScriptRoot 'Sync-SPSAgyPromptTemplate.ps1'
  if (-not (Test-Path -LiteralPath $agyPromptSyncScript -PathType Leaf)) {
    $agyPromptSync = [pscustomobject]@{ enabled = $true; ready = $false; checkedCount = 0; updatedCount = 0; reason = 'sync_script_missing' }
  } elseif ($DryRun) {
    $agyPromptSync = [pscustomobject]@{ enabled = $true; ready = $true; checkedCount = 0; updatedCount = 0; reason = 'dry_run' }
  } else {
    try {
      $syncResult = & $agyPromptSyncScript -SPSBaseUrl $paperclipUrl
      $agyPromptSync = [pscustomobject]@{
        enabled = $true
        ready = $true
        checkedCount = [int]$syncResult.checkedCount
        updatedCount = [int]$syncResult.updatedCount
        reason = 'synced'
      }
    } catch {
      $agyPromptSync = [pscustomobject]@{ enabled = $true; ready = $false; checkedCount = 0; updatedCount = 0; reason = $_.Exception.Message }
    }
  }
}

if ($EnableFlatOrganizationSync -and -not $SkipFlatOrganizationSync -and $paperclipReady) {
  $flatOrganizationSyncScript = Join-Path $PSScriptRoot 'Sync-SPSFlatOrganization.ps1'
  if (-not (Test-Path -LiteralPath $flatOrganizationSyncScript -PathType Leaf)) {
    $flatOrganizationSync = [pscustomobject]@{ enabled = $true; ready = $false; companyCount = 0; checkedCount = 0; updatedCount = 0; reason = 'sync_script_missing' }
  } elseif ($DryRun) {
    $flatOrganizationSync = [pscustomobject]@{ enabled = $true; ready = $true; companyCount = 0; checkedCount = 0; updatedCount = 0; reason = 'dry_run' }
  } else {
    try {
      $syncResult = & $flatOrganizationSyncScript -SPSBaseUrl $paperclipUrl
      $flatOrganizationSync = [pscustomobject]@{
        enabled = $true
        ready = [bool]$syncResult.ready
        companyCount = [int]$syncResult.companyCount
        checkedCount = [int]$syncResult.checkedCount
        updatedCount = [int]$syncResult.updatedCount
        reason = 'synced'
      }
    } catch {
      $flatOrganizationSync = [pscustomobject]@{ enabled = $true; ready = $false; companyCount = 0; checkedCount = 0; updatedCount = 0; reason = $_.Exception.Message }
    }
  }
}

# Double check listening PIDs if they started during this invocation
if (-not $DryRun) {
  if ($paperclipStarted -and $paperclipReady) {
    $conn = Get-ListeningConnection -HostName $SPSHost -Port $SPSPort
    if ($conn) { $paperclipPid = $conn.OwningProcess }
  }
  if ($sidecarStarted -and $sidecarReady) {
    $conn = Get-ListeningConnection -HostName $SidecarHost -Port $SidecarPort
    if ($conn) { $sidecarPid = $conn.OwningProcess }
  }
}

# 4. Formulate Result
$result = [pscustomobject]@{
  ready = ($paperclipReady -and $sidecarReady -and $directTaskBroker.ready -and $agyQuotaCompatibility.ready -and $agyPromptSync.ready -and $flatOrganizationSync.ready -and $roomChatPlugin.ready)
  paperclip = [pscustomobject]@{
    ok = $paperclipReady
    alreadyRunning = $paperclipAlreadyRunning
    started = $paperclipStarted
    restartedUnhealthy = $paperclipRestartedUnhealthy
    processId = $paperclipPid
    url = $paperclipUrl
    listenHost = $SPSHost
    listenUrl = $paperclipListenUrl
    healthHost = $paperclipHealthHost
    configPath = $paperclipEndpoint.configPath
    resolvedFromConfig = $paperclipEndpoint.resolvedFromConfig
    localCore = [bool]$paperclipIdentity.localCore
    expectedCorePath = if ($paperclipIdentity) { $paperclipIdentity.expectedCorePath } else { [IO.Path]::GetFullPath($CorePath) }
  }
  memorySidecar = [pscustomobject]@{
    ok = $sidecarReady
    alreadyRunning = $sidecarAlreadyRunning
    started = $sidecarStarted
    processId = $sidecarPid
    url = $sidecarUrl
  }
  directTaskBroker = $directTaskBroker
  coreUiBundle = $coreUiBundle
  agyQuotaCompatibility = $agyQuotaCompatibility
  agyPromptSync = $agyPromptSync
  flatOrganizationSync = $flatOrganizationSync
  roomChatPlugin = $roomChatPlugin
}

# 5. Fail clearly if not ready
if (-not $result.ready) {
  $failedComponents = @()
  if (-not $paperclipReady) { $failedComponents += "SPS ($paperclipUrl)" }
  if (-not $sidecarReady) { $failedComponents += "Memory Sidecar ($sidecarUrl)" }
  if (-not $directTaskBroker.ready) { $failedComponents += "Direct Task Pipe Broker" }
  if (-not $agyQuotaCompatibility.ready) { $failedComponents += "Agy Quota Compatibility" }
  if (-not $agyPromptSync.ready) { $failedComponents += "Agy Prompt Sync" }
  if (-not $flatOrganizationSync.ready) { $failedComponents += "Flat Organization Sync" }
  if (-not $roomChatPlugin.ready) { $failedComponents += "Room Chat Plugin Build" }
  $failedStr = $failedComponents -join " and "
  
  if ($DryRun) {
    return $result
  } else {
    throw "Workplane Bootstrap Failed: components not ready: $failedStr"
  }
}

return $result
