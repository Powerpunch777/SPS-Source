$ErrorActionPreference = "Stop"

$scriptUnderTest = Join-Path $PSScriptRoot "Test-SPSWorkplaneCollaboration.ps1"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("paperclip-collaboration-test-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

function Write-JsonFixture {
  param([string]$Name, [hashtable]$Server, [hashtable]$Auth, [string]$EnvContents = "")
  $configPath = Join-Path $tempRoot "$Name.json"
  $fixtureDirectory = Join-Path $tempRoot $Name
  New-Item -ItemType Directory -Path $fixtureDirectory -Force | Out-Null
  $configPath = Join-Path $fixtureDirectory "config.json"
  $fixture = @{ server = $Server; auth = $Auth } | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($configPath, $fixture, [Text.UTF8Encoding]::new($false))
  if ($EnvContents) {
    [IO.File]::WriteAllText((Join-Path $fixtureDirectory ".env"), $EnvContents, [Text.UTF8Encoding]::new($false))
  }
  return $configPath
}

function Assert-Equal {
  param([object]$Actual, [object]$Expected, [string]$Message)
  if ($Actual -ne $Expected) {
    throw "$Message Expected '$Expected', got '$Actual'."
  }
}

try {
  Write-Host "[TEST 1] Local-only default is recognized..." -NoNewline
  $localConfig = Write-JsonFixture -Name "local" -Server @{ deploymentMode = "local_trusted"; exposure = "private"; bind = "loopback"; host = "127.0.0.1"; port = 3100; allowedHostnames = @() } -Auth @{ baseUrlMode = "auto" }
  $local = & $scriptUnderTest -SPSConfigPath $localConfig -SkipListenerCheck
  Assert-Equal $local.state "local_only" "Local-only state"
  Assert-Equal $local.localOnlySafeDefault $true "Local-only safe default"
  Write-Host " [PASS]" -ForegroundColor Green

  Write-Host "[TEST 2] Authenticated Tailnet requires and recognizes a secret..." -NoNewline
  $tailnetConfig = Write-JsonFixture -Name "tailnet" -Server @{ deploymentMode = "authenticated"; exposure = "private"; bind = "tailnet"; host = "100.100.100.10"; port = 3100; allowedHostnames = @("workplane.tailnet.ts.net") } -Auth @{ baseUrlMode = "auto" } -EnvContents "BETTER_AUTH_SECRET=test-only-secret`n"
  $tailnet = & $scriptUnderTest -SPSConfigPath $tailnetConfig -SkipListenerCheck
  Assert-Equal $tailnet.state "collaboration_ready" "Tailnet state"
  Assert-Equal $tailnet.collaborationReady $true "Tailnet collaboration readiness"
  Write-Host " [PASS]" -ForegroundColor Green

  Write-Host "[TEST 3] Authenticated private access requires a trusted hostname..." -NoNewline
  $missingHostnameConfig = Write-JsonFixture -Name "missing-hostname" -Server @{ deploymentMode = "authenticated"; exposure = "private"; bind = "tailnet"; host = "100.100.100.10"; port = 3100; allowedHostnames = @() } -Auth @{ baseUrlMode = "auto" } -EnvContents "BETTER_AUTH_SECRET=test-only-secret`n"
  $missingHostname = & $scriptUnderTest -SPSConfigPath $missingHostnameConfig -SkipListenerCheck
  Assert-Equal $missingHostname.state "configuration_incomplete" "Missing hostname configuration state"
  if (@($missingHostname.checks | Where-Object { $_.name -eq "Trusted hostname" -and $_.status -eq "fail" }).Count -ne 1) {
    throw "Private collaboration must require a trusted hostname."
  }
  Write-Host " [PASS]" -ForegroundColor Green

  Write-Host "[TEST 4] Unsafe public configuration remains incomplete..." -NoNewline
  $publicConfig = Write-JsonFixture -Name "public" -Server @{ deploymentMode = "authenticated"; exposure = "public"; bind = "lan"; host = "0.0.0.0"; port = 3100; allowedHostnames = @() } -Auth @{ baseUrlMode = "auto" } -EnvContents "PAPERCLIP_AGENT_JWT_SECRET=test-only-secret`n"
  $public = & $scriptUnderTest -SPSConfigPath $publicConfig -SkipListenerCheck
  Assert-Equal $public.state "configuration_incomplete" "Public configuration state"
  if (@($public.checks | Where-Object { $_.status -eq "fail" }).Count -eq 0) {
    throw "Public configuration must surface a failed HTTPS URL check."
  }
  Write-Host " [PASS]" -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Collaboration readiness tests passed." -ForegroundColor Green
