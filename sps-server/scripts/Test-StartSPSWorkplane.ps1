$ErrorActionPreference = "Stop"

$scriptsRoot = $PSScriptRoot

Write-Host "============================================="
Write-Host " Starting Start-SPSWorkplane Test Suite"
Write-Host "============================================="

# Test 1: Syntax / Static check
Write-Host "[TEST 1] Syntax / Static check on Start-SPS.ps1..." -NoNewline
try {
  $syntax = Get-Command (Join-Path $scriptsRoot "Start-SPS.ps1") -Syntax
  Write-Host " [PASS]" -ForegroundColor Green
} catch {
  Write-Host " [FAIL]" -ForegroundColor Red
  throw $_
}

# Test 2: Dry Run with active live ports keeps the legacy broker disabled by default.
Write-Host "[TEST 2] Dry Run detects healthy components without starting the legacy broker..." -NoNewline
try {
  $res = & "$scriptsRoot\Start-SPS.ps1" -DryRun -SPSPort 3100 -SidecarPort 3188
  if (
    $res.ready -eq $true -and
    $res.sps.alreadyRunning -eq $true -and
    $res.memorySidecar.alreadyRunning -eq $true -and
    $res.directTaskBroker.enabled -eq $false -and
    $res.directTaskBroker.reason -eq "disabled_by_default" -and
    $res.agyQuotaCompatibility.enabled -eq $false -and
    $res.agyQuotaCompatibility.reason -eq "disabled_by_default" -and
    $res.agyPromptSync.enabled -eq $false -and
    $res.agyPromptSync.reason -eq "disabled_by_default" -and
    $res.flatOrganizationSync.enabled -eq $false -and
    $res.flatOrganizationSync.reason -eq "disabled_by_default"
  ) {
    Write-Host " [PASS]" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Unexpected result structure under DryRun: $($res | Out-String)" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host " [FAIL] Failed with error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Test 3: Dry Run with offline ports (should report alreadyRunning = False and ready = False)
Write-Host "[TEST 3] Dry Run with offline ports (should detect offline status without spawning)..." -NoNewline
try {
  $res = & "$scriptsRoot\Start-SPS.ps1" -DryRun -SPSPort 9991 -SidecarPort 9992
  if ($res.ready -eq $false -and $res.sps.alreadyRunning -eq $false -and $res.memorySidecar.alreadyRunning -eq $false) {
    Write-Host " [PASS]" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Unexpected result structure under DryRun: $($res | Out-String)" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host " [FAIL] Failed with error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Test 4: Live dry-run simulation of healthy path has no stop/restart actions
Write-Host "[TEST 4] Live DryRun does not mutate runtime..." -NoNewline
try {
  $res = & "$scriptsRoot\Start-SPS.ps1" -DryRun
  if ($res.sps.started -eq $false -and $res.memorySidecar.started -eq $false -and $null -ne $res.directTaskBroker) {
    Write-Host " [PASS]" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Dry run indicated started components!" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host " [FAIL] Failed with error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Test 5: Static check for hardened launch contract
Write-Host "[TEST 5] Hardened SPS launch contract check..." -NoNewline
try {
  $scriptContent = Get-Content (Join-Path $scriptsRoot "Start-SPS.ps1") -Raw
  
  $paperclipStarterPattern = 'Start-SPSLocalServer\.ps1'
  $hiddenWindowPattern = '-WindowStyle\s+Hidden'
  $brokerPattern = 'Start-DirectTaskPipeBrokerBackground\.ps1'
  $enableBrokerPattern = '\[switch\]\$EnableLegacyDirectTaskBroker'
  $skipBrokerPattern = '\[switch\]\$SkipDirectTaskBroker'
  $enableAgyPromptSyncPattern = '\[switch\]\$EnableAgyPromptSync'
  $enableAgyQuotaCompatibilityPattern = '\[switch\]\$EnableAgyQuotaCompatibility'
  $enableFlatOrganizationSyncPattern = '\[switch\]\$EnableFlatOrganizationSync'
  $skipRoomPluginBuildPattern = '\[switch\]\$SkipRoomChatPluginBuild'
  $brokerGatePattern = 'if\s*\(\$EnableLegacyDirectTaskBroker\s+-and\s+-not\s+\$SkipDirectTaskBroker\)'
  $agyPromptGatePattern = 'if\s*\(\$EnableAgyPromptSync\s+-and\s+-not\s+\$SkipAgyPromptSync\s+-and\s+\$paperclipReady\)'
  $flatOrganizationGatePattern = 'if\s*\(\$EnableFlatOrganizationSync\s+-and\s+-not\s+\$SkipFlatOrganizationSync\s+-and\s+\$paperclipReady\)'
  $launcherOutputPattern = 'sps-launcher\.out\.log'
  $launcherErrorPattern = 'sps-launcher\.err\.log'
  $localCoreIdentityPattern = 'Get-SPSProcessIdentity'

  if (
    $scriptContent -match $paperclipStarterPattern -and
    $scriptContent -match $hiddenWindowPattern -and
    $scriptContent -match $brokerPattern -and
    $scriptContent -match $enableBrokerPattern -and
    $scriptContent -match $skipBrokerPattern -and
    $scriptContent -match $enableAgyPromptSyncPattern -and
    $scriptContent -match $enableAgyQuotaCompatibilityPattern -and
    $scriptContent -match $enableFlatOrganizationSyncPattern -and
    $scriptContent -match $skipRoomPluginBuildPattern -and
    $scriptContent -match $brokerGatePattern -and
    $scriptContent -match $agyPromptGatePattern -and
    $scriptContent -match $flatOrganizationGatePattern -and
    $scriptContent -match $launcherOutputPattern -and
    $scriptContent -match $launcherErrorPattern -and
    $scriptContent -match $localCoreIdentityPattern
  ) {
    Write-Host " [PASS]" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Hardened launch or legacy broker opt-in contract is missing!" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host " [FAIL] Failed with error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Test 6: Local core is the default runtime; registry use is explicit fallback only.
Write-Host "[TEST 6] Local SPS core launch contract check..." -NoNewline
try {
  $localLauncherContent = Get-Content (Join-Path $scriptsRoot "Start-SPSLocalServer.ps1") -Raw
  if (
    $localLauncherContent -match '\[string\]\$CorePath' -and
    $localLauncherContent -match '\[switch\]\$UseRegistryPackage' -and
    $localLauncherContent -match '\[switch\]\$EnableAgentInstructionSync' -and
    $localLauncherContent -match 'if\s*\(\$EnableAgentInstructionSync\s+-and\s+-not\s+\$SkipAgentInstructionSync\)' -and
    $localLauncherContent -match 'external\\paperclip-core' -and
    $localLauncherContent -match 'pnpm@9\.15\.4 run paperclipai run --instance' -and
    $localLauncherContent -match 'if\s*\(\$UseRegistryPackage\)' -and
    $localLauncherContent -match '\$ErrorActionPreference\s*=\s*"Continue"' -and
    $localLauncherContent -match '\$exitCode\s*=\s*\$LASTEXITCODE'
  ) {
    Write-Host " [PASS]" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Local core default or explicit registry fallback contract is missing!" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host " [FAIL] Failed with error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Test 7: The bootstrap must follow the configured bind host for authenticated
# collaboration deployments while probing all-interface binds through loopback.
Write-Host "[TEST 7] Configured collaboration endpoint resolution..." -NoNewline
try {
  $tempConfigPath = Join-Path ([IO.Path]::GetTempPath()) ("paperclip-workplane-config-" + [guid]::NewGuid().ToString() + ".json")
  $tempConfig = @{
    server = @{
      host = "0.0.0.0"
      port = 4310
    }
  } | ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText($tempConfigPath, $tempConfig, [Text.UTF8Encoding]::new($false))
  try {
    $res = & "$scriptsRoot\Start-SPS.ps1" -DryRun -SPSConfigPath $tempConfigPath -SidecarPort 9992
    if (
      $res.sps.listenHost -eq "0.0.0.0" -and
      $res.sps.healthHost -eq "127.0.0.1" -and
      $res.sps.url -eq "http://127.0.0.1:4310" -and
      $res.sps.listenUrl -eq "http://0.0.0.0:4310"
    ) {
      Write-Host " [PASS]" -ForegroundColor Green
    } else {
      Write-Host " [FAIL] Unexpected configured endpoint: $($res.sps | Out-String)" -ForegroundColor Red
      exit 1
    }
  } finally {
    Remove-Item -LiteralPath $tempConfigPath -Force -ErrorAction SilentlyContinue
  }
} catch {
  Write-Host " [FAIL] Failed with error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "============================================="
Write-Host "   All Start-SPSWorkplane Tests Passed!"
Write-Host "============================================="
