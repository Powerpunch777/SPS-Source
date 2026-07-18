$ErrorActionPreference = "Stop"
$scriptsRoot = $PSScriptRoot

Write-Output "=== Testing Close-SPSTaskUtf8.ps1 safety guards ==="

# Temporary environment variable backup
$oldApiKey = $env:PAPERCLIP_API_KEY
$oldBridgeKey = $env:TASK_BRIDGE_API_KEY
$oldRunId = $env:PAPERCLIP_RUN_ID

try {
  # Test Case 1: Token absent
  $env:PAPERCLIP_API_KEY = $null
  $env:TASK_BRIDGE_API_KEY = $null
  $env:PAPERCLIP_RUN_ID = "run-test-123"
  
  $failedAsExpected1 = $false
  try {
    & "$scriptsRoot\Close-SPSTaskUtf8.ps1" -IssueId "dummy-id" -Body "Test body" -DryRun
  } catch {
    Write-Output "Test Case 1 Passed (Token absent check): $_"
    $failedAsExpected1 = $true
  }
  if (-not $failedAsExpected1) {
    throw "Test Case 1 Failed: Script did not fail when token was absent!"
  }

  # Test Case 2: Run ID absent
  $env:PAPERCLIP_API_KEY = "token-test-123"
  $env:TASK_BRIDGE_API_KEY = $null
  $env:PAPERCLIP_RUN_ID = $null
  
  $failedAsExpected2 = $false
  try {
    & "$scriptsRoot\Close-SPSTaskUtf8.ps1" -IssueId "dummy-id" -Body "Test body" -DryRun
  } catch {
    Write-Output "Test Case 2 Passed (Run ID absent check): $_"
    $failedAsExpected2 = $true
  }
  if (-not $failedAsExpected2) {
    throw "Test Case 2 Failed: Script did not fail when PAPERCLIP_RUN_ID was absent!"
  }

  # Test Case 3: Dry-run success path with valid environment
  $env:PAPERCLIP_API_KEY = "token-test-123"
  $env:TASK_BRIDGE_API_KEY = $null
  $env:PAPERCLIP_RUN_ID = "run-test-123"

  Write-Output "Running Test Case 3 (DryRun test with environment populated)..."
  & "$scriptsRoot\Close-SPSTaskUtf8.ps1" -IssueId "dummy-id" -Body "Test body" -DryRun
  Write-Output "Test Case 3 Passed (Dry-run with valid env)"

} finally {
  # Restore environment
  $env:PAPERCLIP_API_KEY = $oldApiKey
  $env:TASK_BRIDGE_API_KEY = $oldBridgeKey
  $env:PAPERCLIP_RUN_ID = $oldRunId
}

Write-Output "=== All Close-SPSTaskUtf8.ps1 guards verified successfully! ==="
