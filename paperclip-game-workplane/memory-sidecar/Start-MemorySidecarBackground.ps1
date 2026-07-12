param(
  [string]$ConfigPath = "",

  [string]$HostName = "127.0.0.1",

  [int]$Port = 3188,

  [switch]$Restart
)

$ErrorActionPreference = "Stop"
$scriptDir = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$serverPath = Join-Path $scriptDir "memory-sidecar.mjs"
$resolvedConfig = if ($ConfigPath) {
  if ([System.IO.Path]::IsPathRooted($ConfigPath)) { [System.IO.Path]::GetFullPath($ConfigPath) } else { [System.IO.Path]::GetFullPath((Join-Path $scriptDir $ConfigPath)) }
} else {
  Join-Path $scriptDir "config.local.json"
}

$scriptPrefix = $scriptDir + [System.IO.Path]::DirectorySeparatorChar
if (-not $resolvedConfig.StartsWith($scriptPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or -not $resolvedConfig.EndsWith(".json", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Memory Sidecar config must be a .json file inside the sidecar directory."
}
if (-not (Test-Path -LiteralPath $resolvedConfig)) {
  throw "Missing config file: $resolvedConfig"
}
if (-not (Test-Path -LiteralPath $serverPath)) {
  throw "Missing Memory Sidecar server file: $serverPath"
}

function Get-SidecarConnection {
  Get-NetTCPConnection -LocalAddress $HostName -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" } |
    Select-Object -First 1
}

function ConvertTo-WindowsCommandArgument {
  param([string]$Value)
  if ($Value -match '[\r\n"]') {
    throw "Unsafe process argument."
  }
  return '"' + $Value + '"'
}

if ($Restart) {
  $existing = Get-SidecarConnection
  if ($existing) {
    Stop-Process -Id $existing.OwningProcess -Force -ErrorAction Stop
    Start-Sleep -Seconds 1
  }
}

$connection = Get-SidecarConnection
if ($connection) {
  return [pscustomobject]@{
    ok = $true
    alreadyRunning = $true
    processId = $connection.OwningProcess
    url = "http://${HostName}:$Port"
  }
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
$commandLine = @(
  (ConvertTo-WindowsCommandArgument -Value $nodePath),
  (ConvertTo-WindowsCommandArgument -Value $serverPath),
  "--config",
  (ConvertTo-WindowsCommandArgument -Value $resolvedConfig)
) -join " "
$created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine }
if ($created.ReturnValue -ne 0) {
  throw "Unable to start Memory Sidecar process (Win32 return value $($created.ReturnValue))."
}

Start-Sleep -Seconds 2
$connection = Get-SidecarConnection
return [pscustomobject]@{
  ok = [bool]$connection
  alreadyRunning = $false
  processId = if ($connection) { $connection.OwningProcess } else { $created.ProcessId }
  url = "http://${HostName}:$Port"
}
