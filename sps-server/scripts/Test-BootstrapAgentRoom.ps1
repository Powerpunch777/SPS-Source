$ErrorActionPreference = "Stop"

$scriptsRoot = $PSScriptRoot
$companyId = "181e1bf7-3390-4b8d-8507-b736a03e444b"
$projectId = "2e0a5142-c2d2-4f23-8079-a287e8c8e59f"
$validAgentId = "dfdde6a7-ae30-43f8-8b65-593c7eecf171" # 손영하-CTO
$invalidAgentId = "00000000-0000-0000-0000-000000000000"

Write-Host "============================================="
Write-Host "   Starting Agent Room Bootstrap Test Suite  "
Write-Host "============================================="

# 1. Syntax / Static Checks
Write-Host "[TEST 1] Syntax / Static check on Bootstrap-AgentRoom.ps1..." -NoNewline
try {
  $syntax = Get-Command (Join-Path $scriptsRoot "Bootstrap-AgentRoom.ps1") -Syntax
  Write-Host " [PASS]" -ForegroundColor Green
} catch {
  Write-Host " [FAIL]" -ForegroundColor Red
  throw $_
}

# 2. Dry-Run Verification with Valid Agent
Write-Host "[TEST 2] Dry-run with valid agent..." -NoNewline
try {
  $plan = & "$scriptsRoot\Bootstrap-AgentRoom.ps1" -CompanyId $companyId -ProjectId $projectId -RoleName "CTO" -AssigneeAgentId $validAgentId
  # In the current environment, the CTO room (CMP-39) already exists in blocked status.
  if ($plan.Action -eq "DryRun" -and $plan.AgentName -like "*CTO*" -and $plan.StartImmediately -eq $false) {
    Write-Host " [PASS]" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Unexpected plan object: $($plan | Out-String)" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host " [FAIL] Error occurred: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# 3. Apply with StartImmediately without Acknowledge Safety Test
Write-Host "[TEST 3] Apply with StartImmediately without Acknowledge potential run safety..." -NoNewline
try {
  & "$scriptsRoot\Bootstrap-AgentRoom.ps1" -CompanyId $companyId -ProjectId $projectId -RoleName "CTO" -AssigneeAgentId $validAgentId -Apply -StartImmediately
  Write-Host " [FAIL] Allowed apply with StartImmediately without acknowledgement!" -ForegroundColor Red
  exit 1
} catch {
  if ($_.Exception.Message -like "*Safety Violation*" -or $_.Exception.Message -like "*AcknowledgePotentialAgentRun*") {
    Write-Host " [PASS] (Prevented apply with StartImmediately without acknowledgement as expected)" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# 4. Invalid Agent Validation Test
Write-Host "[TEST 4] Dry-run with invalid agent ID..." -NoNewline
try {
  & "$scriptsRoot\Bootstrap-AgentRoom.ps1" -CompanyId $companyId -ProjectId $projectId -RoleName "CTO" -AssigneeAgentId $invalidAgentId
  Write-Host " [FAIL] Allowed dry-run with invalid agent ID!" -ForegroundColor Red
  exit 1
} catch {
  if ($_.Exception.Message -like "*Validation Error*not found*") {
    Write-Host " [PASS] (Rejected invalid agent ID as expected)" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# 5. Exact Duplicate Matching Guard
Write-Host "[TEST 5] Exact Agent Room title matching guard..." -NoNewline
try {
  $bootstrapSource = Get-Content -Raw -LiteralPath "$scriptsRoot\Bootstrap-AgentRoom.ps1" -Encoding utf8
  if (
    $bootstrapSource -match '\$_\.assigneeAgentId -eq \$AssigneeAgentId' -and
    $bootstrapSource -match '\$_\.title -eq \$roomTitle'
  ) {
    Write-Host " [PASS]" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Expected exact title matching was not found." -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host " [FAIL] Failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# 6. Fail-closed Default (Apply without StartImmediately)
Write-Host "[TEST 6] Fail-closed default (Apply without StartImmediately)..." -NoNewline
try {
  & "$scriptsRoot\Bootstrap-AgentRoom.ps1" -CompanyId $companyId -ProjectId $projectId -RoleName "CTO" -AssigneeAgentId $validAgentId -Apply
  Write-Host " [FAIL] Allowed apply without StartImmediately!" -ForegroundColor Red
  exit 1
} catch {
  if ($_.Exception.Message -like "*Unsupported Behavior*") {
    Write-Host " [PASS] (Failed closed on unsupported non-waking room creation as expected)" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# 6b. Idempotency Check with Existing Room
Write-Host "[TEST 6b] Idempotency abort when trying to apply duplicate..." -NoNewline
try {
  if ($plan.MatchingRoomExists) {
    # Since the room already exists, trying to bootstrap with -Apply -StartImmediately -AcknowledgePotentialAgentRun should trigger the idempotency check and throw.
    & "$scriptsRoot\Bootstrap-AgentRoom.ps1" -CompanyId $companyId -ProjectId $projectId -RoleName "CTO" -AssigneeAgentId $validAgentId -Apply -StartImmediately -AcknowledgePotentialAgentRun
    Write-Host " [FAIL] Allowed duplicate creation without aborting!" -ForegroundColor Red
    exit 1
  } else {
    Write-Host " [SKIP] (No existing room exists to test idempotency duplicate check)" -ForegroundColor Yellow
  }
} catch {
  if ($_.Exception.Message -like "*Idempotency check failed*") {
    Write-Host " [PASS] (Aborted duplicate creation as expected)" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# 7. Syntax / Static Checks on Activate-AgentRoom.ps1
Write-Host "[TEST 7] Syntax / Static check on Activate-AgentRoom.ps1..." -NoNewline
try {
  $syntaxAct = Get-Command (Join-Path $scriptsRoot "Activate-AgentRoom.ps1") -Syntax
  Write-Host " [PASS]" -ForegroundColor Green
} catch {
  Write-Host " [FAIL]" -ForegroundColor Red
  throw $_
}

# 8. Dry-run Activation of Existing Blocked Agent Room (CMP-39)
Write-Host "[TEST 8] Dry-run activation of CMP-39..." -NoNewline
try {
  if ($null -ne $plan.ExistingRoomId) {
    $actPlan = & "$scriptsRoot\Activate-AgentRoom.ps1" -CompanyId $companyId -ProjectId $projectId -AssigneeAgentId $validAgentId -IssueId $plan.ExistingRoomId
    if ($actPlan.Action -eq "DryRun" -and $actPlan.CurrentStatus -eq "blocked" -and $actPlan.TargetStatus -eq "backlog") {
      Write-Host " [PASS]" -ForegroundColor Green
    } else {
      Write-Host " [FAIL] Unexpected activation plan object: $($actPlan | Out-String)" -ForegroundColor Red
      exit 1
    }
  } else {
    Write-Host " [SKIP] (No existing room ID found to test dry-run activation)" -ForegroundColor Yellow
  }
} catch {
  Write-Host " [FAIL] Failed with error: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# 9. Activation Safety Test
Write-Host "[TEST 9] Apply activation without Acknowledge potential run safety..." -NoNewline
try {
  if ($null -ne $plan.ExistingRoomId) {
    & "$scriptsRoot\Activate-AgentRoom.ps1" -CompanyId $companyId -ProjectId $projectId -AssigneeAgentId $validAgentId -IssueId $plan.ExistingRoomId -Apply
    Write-Host " [FAIL] Allowed activation apply without acknowledgement!" -ForegroundColor Red
    exit 1
  } else {
    Write-Host " [SKIP] (No existing room ID found to test activation safety)" -ForegroundColor Yellow
  }
} catch {
  if ($_.Exception.Message -like "*Safety Violation*" -or $_.Exception.Message -like "*AcknowledgePotentialAgentRun*") {
    Write-Host " [PASS] (Prevented activation without acknowledgement as expected)" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# 10. Activation Strict Validation - Wrong Project ID
Write-Host "[TEST 10] Activation fail closed on wrong Project ID..." -NoNewline
try {
  if ($null -ne $plan.ExistingRoomId) {
    & "$scriptsRoot\Activate-AgentRoom.ps1" -CompanyId $companyId -ProjectId "wrong-project-id" -AssigneeAgentId $validAgentId -IssueId $plan.ExistingRoomId
    Write-Host " [FAIL] Allowed activation with wrong Project ID!" -ForegroundColor Red
    exit 1
  } else {
    Write-Host " [SKIP] (No existing room ID found to test wrong project ID)" -ForegroundColor Yellow
  }
} catch {
  if ($_.Exception.Message -like "*Validation Error*Project ID*") {
    Write-Host " [PASS] (Rejected wrong Project ID as expected)" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

# 11. Activation Strict Validation - Wrong Assignee ID
Write-Host "[TEST 11] Activation fail closed on wrong Assignee ID..." -NoNewline
try {
  if ($null -ne $plan.ExistingRoomId) {
    & "$scriptsRoot\Activate-AgentRoom.ps1" -CompanyId $companyId -ProjectId $projectId -AssigneeAgentId "wrong-assignee-id" -IssueId $plan.ExistingRoomId
    Write-Host " [FAIL] Allowed activation with wrong Assignee ID!" -ForegroundColor Red
    exit 1
  } else {
    Write-Host " [SKIP] (No existing room ID found to test wrong assignee ID)" -ForegroundColor Yellow
  }
} catch {
  if ($_.Exception.Message -like "*Validation Error*assignee agent ID*") {
    Write-Host " [PASS] (Rejected wrong Assignee ID as expected)" -ForegroundColor Green
  } else {
    Write-Host " [FAIL] Failed with unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

Write-Host "============================================="
Write-Host "      All Bootstrap & Activation Tests Passed!"
Write-Host "============================================="
