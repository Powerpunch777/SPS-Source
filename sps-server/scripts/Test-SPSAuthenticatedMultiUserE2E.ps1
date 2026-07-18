param(
  [string]$CorePath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "external\sps-core"),
  [int]$Port = 3105,
  [int]$DatabasePort = 0,
  [string]$ChromiumExecutablePath,
  [int]$TimeoutSec = 150,
  [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"

function Set-TemporaryEnvironmentValue {
  param([hashtable]$Saved, [string]$Name, [string]$Value)
  if (-not $Saved.ContainsKey($Name)) { $Saved[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process") }
  [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Restore-TemporaryEnvironment {
  param([hashtable]$Saved)
  foreach ($name in $Saved.Keys) {
    [Environment]::SetEnvironmentVariable($name, $Saved[$name], "Process")
  }
}

function Stop-ProcessTree {
  param([int]$ProcessId)

  $descendants = [System.Collections.Generic.List[int]]::new()
  function Find-Children {
    param([int]$ParentId, [System.Collections.Generic.List[int]]$Result)
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ParentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
      Find-Children -ParentId ([int]$child.ProcessId) -Result $Result
      $Result.Add([int]$child.ProcessId) | Out-Null
    }
  }
  Find-Children -ParentId $ProcessId -Result $descendants
  foreach ($id in $descendants) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Get-AvailableTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

$resolvedCorePath = (Resolve-Path -LiteralPath $CorePath).Path
$tsxCliPath = Join-Path $resolvedCorePath "cli\node_modules\tsx\dist\cli.mjs"
$cliIndexPath = Join-Path $resolvedCorePath "cli\src\index.ts"
$playwrightPath = Join-Path $resolvedCorePath "node_modules\.bin\playwright.cmd"
foreach ($required in @($tsxCliPath, $cliIndexPath, $playwrightPath)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required authenticated E2E runtime file was not found: $required" }
}
if ([string]::IsNullOrWhiteSpace($ChromiumExecutablePath)) {
  $ChromiumExecutablePath = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if ([string]::IsNullOrWhiteSpace($ChromiumExecutablePath) -or -not (Test-Path -LiteralPath $ChromiumExecutablePath -PathType Leaf)) {
  throw "No Chromium-compatible browser executable was found. Install Playwright Chromium or pass -ChromiumExecutablePath."
}
$ChromiumExecutablePath = (Resolve-Path -LiteralPath $ChromiumExecutablePath).Path

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("paperclip-authenticated-e2e-" + [guid]::NewGuid().ToString("N"))
$dataDir = Join-Path $tempRoot "home"
$configPath = Join-Path $dataDir "instances\authenticated-e2e\config.json"
$stdoutPath = Join-Path $tempRoot "server.out.log"
$stderrPath = Join-Path $tempRoot "server.err.log"
$savedEnvironment = @{}
$serverProcess = $null
$databaseContainer = $null
$start = Get-Date

try {
  [System.IO.Directory]::CreateDirectory($dataDir) | Out-Null
  $secret = "e2e-" + [guid]::NewGuid().ToString("N")
  $baseUrl = "http://127.0.0.1:$Port"
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_HOME" $dataDir
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_CONFIG" $configPath
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_INSTANCE_ID" "authenticated-e2e"
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_E2E_DATA_DIR" $dataDir
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_E2E_CONFIG_PATH" $configPath
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_E2E_BASE_URL" $baseUrl
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_E2E_PORT" ([string]$Port)
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_E2E_CHROMIUM_EXECUTABLE" $ChromiumExecutablePath
  Set-TemporaryEnvironmentValue $savedEnvironment "PORT" ([string]$Port)
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_BIND" "lan"
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_DEPLOYMENT_MODE" "authenticated"
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_DEPLOYMENT_EXPOSURE" "private"
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_AGENT_JWT_SECRET" $secret
  Set-TemporaryEnvironmentValue $savedEnvironment "BETTER_AUTH_SECRET" $secret
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_ALLOWED_HOSTNAMES" "127.0.0.1,localhost"
  Set-TemporaryEnvironmentValue $savedEnvironment "PAPERCLIP_OPEN_ON_LISTEN" "false"

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required for the authenticated multi-user E2E database." }
  $dbPort = if ($DatabasePort -gt 0) { $DatabasePort } else { Get-AvailableTcpPort }
  $databaseContainer = "paperclip-auth-e2e-" + [guid]::NewGuid().ToString("N").Substring(0, 12)
  & docker run --detach --rm --name $databaseContainer --publish "127.0.0.1:${dbPort}:5432" --env "POSTGRES_USER=paperclip" --env "POSTGRES_PASSWORD=paperclip" --env "POSTGRES_DB=paperclip" postgres:16-alpine | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start the temporary Docker PostgreSQL container." }

  $databaseDeadline = (Get-Date).AddSeconds(90)
  $databaseReady = $false
  do {
    & docker exec $databaseContainer pg_isready -U paperclip -d paperclip 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $databaseDeadline)
  if (-not $databaseReady) { throw "Temporary Docker PostgreSQL did not become ready." }
  Set-TemporaryEnvironmentValue $savedEnvironment "DATABASE_URL" "postgres://paperclip:paperclip@127.0.0.1:${dbPort}/paperclip"

  $serverArguments = @(
    ('"' + $tsxCliPath + '"'),
    ('"' + $cliIndexPath + '"'),
    "onboard",
    "--yes",
    "--bind", "lan",
    "--config", ('"' + $configPath + '"'),
    "--data-dir", ('"' + $dataDir + '"')
  )
  $serverProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList $serverArguments -WorkingDirectory $resolvedCorePath -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastHealthError = $null
  do {
    try {
      $healthResponse = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/health" -TimeoutSec 5
      $health = $healthResponse.Content | ConvertFrom-Json
      if ($healthResponse.StatusCode -eq 200 -and $health.deploymentMode -eq "authenticated") { break }
    } catch {
      $lastHealthError = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)

  if (-not $health -or $health.deploymentMode -ne "authenticated") {
    $logLines = [System.Collections.Generic.List[string]]::new()
    if (Test-Path -LiteralPath $stdoutPath) {
      foreach ($line in @(Get-Content -LiteralPath $stdoutPath -Tail 80 -ErrorAction SilentlyContinue)) { $logLines.Add($line) | Out-Null }
    }
    if (Test-Path -LiteralPath $stderrPath) {
      foreach ($line in @(Get-Content -LiteralPath $stderrPath -Tail 80 -ErrorAction SilentlyContinue)) { $logLines.Add($line) | Out-Null }
    }
    $logs = $logLines -join [Environment]::NewLine
    throw "Authenticated E2E server did not become healthy. $lastHealthError`n$logs"
  }

  Push-Location $resolvedCorePath
  try {
    & $playwrightPath test --config tests/e2e/playwright-multiuser-authenticated.config.ts
    if ($LASTEXITCODE -ne 0) { throw "Authenticated multi-user Playwright test failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }

  return [pscustomobject]@{
    ok = $true
    baseUrl = $baseUrl
    durationSec = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
    verified = @(
      "authenticated bootstrap",
      "owner account creation",
      "operator invite and join",
      "viewer permission downgrade",
      "viewer invite API rejection"
    )
  }
} finally {
  if ($serverProcess) { Stop-ProcessTree -ProcessId $serverProcess.Id }
  if ($databaseContainer) { & docker rm --force $databaseContainer 2>$null | Out-Null }
  Restore-TemporaryEnvironment $savedEnvironment
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $tempRoot)) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
  elseif ($KeepArtifacts) { Write-Host "Authenticated E2E artifacts retained: $tempRoot" }
}
