param(
  [string]$PaperclipHost = "127.0.0.1",
  [int]$PaperclipPort = 3100,
  [string]$SidecarHost = "127.0.0.1",
  [int]$SidecarPort = 3188,
  [int]$TimeoutSec = 30,
  [switch]$SkipDirectTaskBroker,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

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

# Helper to check if a HTTP endpoint is returning status:ok or ok:true
function Test-HttpHealth {
  param(
    [string]$Url
  )
  try {
    $resp = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3 -ErrorAction Stop
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

# Ensure logs directory exists if not dry-running
if (-not $DryRun) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$paperclipUrl = "http://${PaperclipHost}:${PaperclipPort}"
$sidecarUrl = "http://${SidecarHost}:${SidecarPort}"

# 1. Detect Initial Status
$paperclipConn = Get-ListeningConnection -HostName $PaperclipHost -Port $PaperclipPort
$sidecarConn = Get-ListeningConnection -HostName $SidecarHost -Port $SidecarPort

$paperclipAlreadyRunning = $null -ne $paperclipConn
$sidecarAlreadyRunning = $null -ne $sidecarConn

$paperclipStarted = $false
$sidecarStarted = $false
$directTaskBroker = [pscustomobject]@{ enabled = $false; ready = $true; alreadyRunning = $false; started = $false; processId = $null; reason = 'not_checked' }

$paperclipPid = if ($paperclipAlreadyRunning) { $paperclipConn.OwningProcess } else { $null }
$sidecarPid = if ($sidecarAlreadyRunning) { $sidecarConn.OwningProcess } else { $null }

# 2. Launch Unavailable Components
if (-not $paperclipAlreadyRunning) {
  if ($DryRun) {
    Write-Output "[DryRun] Would start Paperclip on $paperclipUrl"
  } else {
    $paperclipOutLog = Join-Path $logDir "paperclip.out.log"
    $paperclipErrLog = Join-Path $logDir "paperclip.err.log"
    
    # Established local launch path: npx paperclipai run
    $process = Start-Process -FilePath "npx.cmd" -ArgumentList "--yes", "--registry", "https://registry.npmjs.org", "paperclipai", "run" -WorkingDirectory $workspaceRoot -WindowStyle Hidden -RedirectStandardOutput $paperclipOutLog -RedirectStandardError $paperclipErrLog -PassThru
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
      $paperclipReady = Test-HttpHealth -Url "$paperclipUrl/api/health"
    }
    if (-not $sidecarReady) {
      $sidecarReady = Test-HttpHealth -Url "$sidecarUrl/health"
    }
    
    if ($paperclipReady -and $sidecarReady) {
      break
    }
    Start-Sleep -Seconds 1
  }
  $startTime.Stop()
}

if (-not $SkipDirectTaskBroker) {
  $brokerStarter = Join-Path $workspaceRoot 'direct-task-pipe-broker\Start-DirectTaskPipeBrokerBackground.ps1'
  if (Test-Path -LiteralPath $brokerStarter -PathType Leaf) {
    $directTaskBroker = & $brokerStarter -TimeoutSec $TimeoutSec -DryRun:$DryRun
  }
}

# Double check listening PIDs if they started during this invocation
if (-not $DryRun) {
  if ($paperclipStarted -and $paperclipReady) {
    $conn = Get-ListeningConnection -HostName $PaperclipHost -Port $PaperclipPort
    if ($conn) { $paperclipPid = $conn.OwningProcess }
  }
  if ($sidecarStarted -and $sidecarReady) {
    $conn = Get-ListeningConnection -HostName $SidecarHost -Port $SidecarPort
    if ($conn) { $sidecarPid = $conn.OwningProcess }
  }
}

# 4. Formulate Result
$result = [pscustomobject]@{
  ready = ($paperclipReady -and $sidecarReady -and $directTaskBroker.ready)
  paperclip = [pscustomobject]@{
    ok = $paperclipReady
    alreadyRunning = $paperclipAlreadyRunning
    started = $paperclipStarted
    processId = $paperclipPid
    url = $paperclipUrl
  }
  memorySidecar = [pscustomobject]@{
    ok = $sidecarReady
    alreadyRunning = $sidecarAlreadyRunning
    started = $sidecarStarted
    processId = $sidecarPid
    url = $sidecarUrl
  }
  directTaskBroker = $directTaskBroker
}

# 5. Fail clearly if not ready
if (-not $result.ready) {
  $failedComponents = @()
  if (-not $paperclipReady) { $failedComponents += "Paperclip ($paperclipUrl)" }
  if (-not $sidecarReady) { $failedComponents += "Memory Sidecar ($sidecarUrl)" }
  if (-not $directTaskBroker.ready) { $failedComponents += "Direct Task Pipe Broker" }
  $failedStr = $failedComponents -join " and "
  
  if ($DryRun) {
    return $result
  } else {
    throw "Workplane Bootstrap Failed: components not ready: $failedStr"
  }
}

return $result
