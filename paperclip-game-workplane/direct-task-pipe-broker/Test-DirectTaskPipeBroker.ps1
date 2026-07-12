$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\PipeBroker.Core.ps1"

function Assert-True {
  param([bool]$Value, [string]$Message)
  if (-not $Value) { throw "ASSERTION FAILED: $Message" }
}

function Get-FreeLoopbackPort {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Invoke-TestPipeRequest {
  param([string]$PipeName, [object]$Request)
  $client = New-Object System.IO.Pipes.NamedPipeClientStream('.', $PipeName, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::None)
  try {
    $client.Connect(5000)
    $writer = New-Object System.IO.StreamWriter($client, [System.Text.UTF8Encoding]::new($false), 16384, $true)
    try {
      $writer.AutoFlush = $true
      $writer.WriteLine(($Request | ConvertTo-Json -Depth 10 -Compress))
    } finally { $writer.Dispose() }
    $reader = New-Object System.IO.StreamReader($client, [System.Text.UTF8Encoding]::new($false), $false, 16384, $true)
    try { return ($reader.ReadLine() | ConvertFrom-Json) } finally { $reader.Dispose() }
  } finally {
    $client.Dispose()
  }
}

function Remove-TestDirectory {
  param([string]$Path, [string]$Root)
  $resolvedRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  if (-not $resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to remove a test directory outside the broker workspace.'
  }
  if (Test-Path -LiteralPath $resolvedPath) {
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
  }
}

Write-Host 'Running Direct Task Pipe Broker tests.'

$pipeName = 'PaperclipBrokerTest-' + [guid]::NewGuid().ToString('N').Substring(0, 16)
$firstPipe = New-FirstInstancePipeServer -PipeName $pipeName
try {
  $duplicateBlocked = $false
  try { $secondPipe = New-FirstInstancePipeServer -PipeName $pipeName } catch { $duplicateBlocked = $_.Exception.Message -match 'pipe_first_instance_create_failed' }
  Assert-True $duplicateBlocked 'A second first-instance pipe must fail closed.'
} finally {
  $firstPipe.Dispose()
}

$brokerRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$testRoot = Join-Path $brokerRoot ('.pipe-broker-test-' + [guid]::NewGuid().ToString('N'))
$port = Get-FreeLoopbackPort
$nodePath = (Get-Command node -ErrorAction Stop).Source
$pipeName = 'PaperclipBrokerTest-' + [guid]::NewGuid().ToString('N').Substring(0, 16)
$configPath = Join-Path $testRoot 'config.json'
$statePath = Join-Path $testRoot 'state'
$startScript = Join-Path $PSScriptRoot 'Start-DirectTaskPipeBroker.ps1'
$stdoutPath = Join-Path $testRoot 'broker.stdout.log'
$stderrPath = Join-Path $testRoot 'broker.stderr.log'

try {
  [System.IO.Directory]::CreateDirectory($testRoot) | Out-Null
  $config = [ordered]@{
    enabled = $true
    pipeName = $pipeName
    paperclip = [ordered]@{ baseUrl = 'http://127.0.0.1:3100' }
    bridge = [ordered]@{ port = $port; nodeExecutable = $nodePath; mockExecution = $true; mockDurationMs = 20; mockResultMode = 'success' }
    projectWorkspaceMappings = [ordered]@{}
    jobTimeoutMs = 300000
  }
  [System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))

  $processArguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ConfigPath "{1}" -StateDirectory "{2}" -MaxRequests 2' -f $startScript, $configPath, $statePath
  $process = Start-Process -FilePath "$PSHOME\powershell.exe" -ArgumentList $processArguments -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden -PassThru
  $health = $null
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline -and $null -eq $health) {
    try {
      $health = Invoke-TestPipeRequest -PipeName $pipeName -Request ([ordered]@{ protocolVersion = 1; requestId = [guid]::NewGuid().ToString(); operation = 'health' })
    } catch {
      Start-Sleep -Milliseconds 150
    }
  }
  if ($null -eq $health -or -not $health.ok -or $health.body.transport -ne 'windows-named-pipe') {
    $diagnostic = @()
    if (Test-Path -LiteralPath $stdoutPath) { $diagnostic += Get-Content -LiteralPath $stdoutPath -Raw }
    if (Test-Path -LiteralPath $stderrPath) { $diagnostic += Get-Content -LiteralPath $stderrPath -Raw }
    throw "ASSERTION FAILED: Health request must succeed through the secured pipe. $($diagnostic -join [Environment]::NewLine)"
  }

  $invalid = Invoke-TestPipeRequest -PipeName $pipeName -Request ([ordered]@{ protocolVersion = 1; requestId = [guid]::NewGuid().ToString(); operation = 'unsupported' })
  Assert-True (-not $invalid.ok -and $invalid.body.error -eq 'unsupported_pipe_operation') 'Unsupported pipe operations must fail closed.'

  $process.WaitForExit(8000) | Out-Null
  Assert-True $process.HasExited 'Test broker must shut down after its bounded request count.'
  $runtimeConfig = Join-Path $statePath 'bridge.runtime.config.json'
  $runtimeText = Get-Content -LiteralPath $runtimeConfig -Raw
  Assert-True (-not $runtimeText.Contains('bridgeSecret')) 'Runtime bridge config must not persist a bridge secret.'
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  Remove-TestDirectory -Path $testRoot -Root $brokerRoot
}

$backgroundStarter = Join-Path $PSScriptRoot 'Start-DirectTaskPipeBrokerBackground.ps1'
$missingConfig = Join-Path $brokerRoot ('.missing-config-' + [guid]::NewGuid().ToString('N') + '.json')
$backgroundResult = & $backgroundStarter -ConfigPath $missingConfig -DryRun
Assert-True ($backgroundResult.enabled -eq $false -and $backgroundResult.ready -eq $true -and $backgroundResult.reason -eq 'config_missing') 'Background starter must treat an absent local config as disabled without spawning.'

$backgroundSource = Get-Content -LiteralPath $backgroundStarter -Raw
Assert-True ($backgroundSource.Contains('Test-DirectTaskPipeBrokerHealth')) 'Background starter must verify existing pipe health before spawning.'
Assert-True ($backgroundSource.Contains('Start-Process')) 'Background starter must be capable of restoring an enabled broker after a reboot.'

Write-Host 'SUCCESS: Direct Task Pipe Broker tests passed.'
