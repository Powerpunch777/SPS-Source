$ErrorActionPreference = "Stop"

$scriptsRoot = $PSScriptRoot

Write-Host "============================================="
Write-Host " Starting Start-PaperclipWorkplane Test Suite"
Write-Host "============================================="

# Test 1: Syntax / Static check
Write-Host "[TEST 1] Syntax / Static check on Start-PaperclipWorkplane.ps1..." -NoNewline
try {
  $syntax = Get-Command (Join-Path $scriptsRoot "Start-PaperclipWorkplane.ps1") -Syntax
  Write-Host " [PASS]" -ForegroundColor Green
} catch {
  Write-Host " [FAIL]" -ForegroundColor Red
  throw $_
}

# Test 2: Dry Run with active live ports (should report alreadyRunning = True and ready = True)
Write-Host "[TEST 2] Dry Run with active live ports (should detect healthy components)..." -NoNewline
try {
  $res = & "$scriptsRoot\Start-PaperclipWorkplane.ps1" -DryRun -PaperclipPort 3100 -SidecarPort 3188
  if ($res.ready -eq $true -and $res.paperclip.alreadyRunning -eq $true -and $res.memorySidecar.alreadyRunning -eq $true -and $res.directTaskBroker.alreadyRunning -eq $true) {
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
  $res = & "$scriptsRoot\Start-PaperclipWorkplane.ps1" -DryRun -PaperclipPort 9991 -SidecarPort 9992
  if ($res.ready -eq $false -and $res.paperclip.alreadyRunning -eq $false -and $res.memorySidecar.alreadyRunning -eq $false) {
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
  $res = & "$scriptsRoot\Start-PaperclipWorkplane.ps1" -DryRun
  if ($res.paperclip.started -eq $false -and $res.memorySidecar.started -eq $false -and $null -ne $res.directTaskBroker) {
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
Write-Host "[TEST 5] Hardened Paperclip launch contract check..." -NoNewline
try {
  $scriptContent = Get-Content (Join-Path $scriptsRoot "Start-PaperclipWorkplane.ps1") -Raw
  
  $expectedPattern = '-ArgumentList\s+"--yes",\s*"--registry",\s*"https://registry.npmjs.org",\s*"paperclipai",\s*"run"'
  $legacyPattern = '-ArgumentList\s+"paperclipai",\s*"run"'
  
  $brokerPattern = 'Start-DirectTaskPipeBrokerBackground\.ps1'
  $skipBrokerPattern = '\[switch\]\$SkipDirectTaskBroker'

  if ($scriptContent -match $expectedPattern) {
    if ($scriptContent -match $legacyPattern) {
      Write-Host " [FAIL] Found legacy bare argument list!" -ForegroundColor Red
      exit 1
    }
    if ($scriptContent -notmatch $brokerPattern -or $scriptContent -notmatch $skipBrokerPattern) {
      Write-Host " [FAIL] Direct Task Pipe Broker bootstrap contract is missing!" -ForegroundColor Red
      exit 1
    }
    Write-Host " [PASS]" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Did not find the explicit noninteractive arguments in Start-PaperclipWorkplane.ps1!" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host " [FAIL] Failed with error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "============================================="
Write-Host "   All Start-PaperclipWorkplane Tests Passed!"
Write-Host "============================================="
