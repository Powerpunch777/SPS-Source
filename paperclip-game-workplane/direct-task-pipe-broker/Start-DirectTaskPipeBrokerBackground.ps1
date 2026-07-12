<#
.SYNOPSIS
  Idempotently verifies or starts the enabled local Direct Task Pipe Broker.
#>
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.local.json'),
  [string]$StateDirectory = (Join-Path $PSScriptRoot 'runtime'),
  [int]$TimeoutSec = 15,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\PipeBroker.Core.ps1"

function Test-DirectTaskPipeBrokerHealth {
  param([Parameter(Mandatory = $true)][string]$PipeName)

  $client = New-Object System.IO.Pipes.NamedPipeClientStream('.', $PipeName, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::None)
  $writer = $null
  $reader = $null
  try {
    $client.Connect(500)
    $writer = New-Object System.IO.StreamWriter($client, [System.Text.UTF8Encoding]::new($false), 16384, $true)
    $writer.AutoFlush = $true
    $request = [ordered]@{ protocolVersion = 1; requestId = [guid]::NewGuid().ToString(); operation = 'health' }
    $writer.WriteLine(($request | ConvertTo-Json -Compress))
    $reader = New-Object System.IO.StreamReader($client, [System.Text.UTF8Encoding]::new($false), $false, 16384, $true)
    $response = $reader.ReadLine() | ConvertFrom-Json
    return ($response.ok -and $response.statusCode -eq 200 -and $response.body.transport -eq 'windows-named-pipe' -and $response.body.bridge -eq 'ready')
  } catch {
    return $false
  } finally {
    if ($reader) { $reader.Dispose() }
    if ($writer) { $writer.Dispose() }
    $client.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  return [pscustomobject]@{ enabled = $false; ready = $true; alreadyRunning = $false; started = $false; processId = $null; reason = 'config_missing' }
}

$config = Read-DirectTaskPipeBrokerConfig -ConfigPath $ConfigPath
if (-not $config.enabled) {
  return [pscustomobject]@{ enabled = $false; ready = $true; alreadyRunning = $false; started = $false; processId = $null; reason = 'config_disabled' }
}

if (Test-DirectTaskPipeBrokerHealth -PipeName $config.pipeName) {
  return [pscustomobject]@{ enabled = $true; ready = $true; alreadyRunning = $true; started = $false; processId = $null; reason = 'healthy' }
}

if ($DryRun) {
  return [pscustomobject]@{ enabled = $true; ready = $false; alreadyRunning = $false; started = $false; processId = $null; reason = 'dry_run_would_start' }
}

[System.IO.Directory]::CreateDirectory($StateDirectory) | Out-Null
$startScript = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Start-DirectTaskPipeBroker.ps1')).Path
$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$resolvedState = [System.IO.Path]::GetFullPath($StateDirectory)
$stdoutPath = Join-Path $resolvedState 'broker.stdout.log'
$stderrPath = Join-Path $resolvedState 'broker.stderr.log'
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ConfigPath "{1}" -StateDirectory "{2}"' -f $startScript, $resolvedConfig, $resolvedState
$process = Start-Process -FilePath "$PSHOME\powershell.exe" -ArgumentList $arguments -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru

$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) { break }
  if (Test-DirectTaskPipeBrokerHealth -PipeName $config.pipeName) {
    return [pscustomobject]@{ enabled = $true; ready = $true; alreadyRunning = $false; started = $true; processId = $process.Id; reason = 'started' }
  }
  Start-Sleep -Milliseconds 150
}

if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
throw 'direct_task_pipe_broker_start_failed'
