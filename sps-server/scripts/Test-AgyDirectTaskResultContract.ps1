$ErrorActionPreference = "Stop"
$scriptsRoot = $PSScriptRoot

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERTION FAILED: $Message"
  }
}

function Read-ResultContract {
  param([string]$Path)

  return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}

$tempRoot = Join-Path $env:TEMP "AgyDirectTaskResultContract-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

$mockIssue = @{
  id = "mock-result-issue"
  identifier = "CMP-MOCK"
  title = "Structured result test"
  description = "Validate result output."
  companyId = "mock-company"
  projectId = "mock-project"
  status = "backlog"
}

try {
  Write-Output "=== Testing Invoke-AgyDirectTask.ps1 Structured Result Contract ==="

  $successPath = Join-Path $tempRoot "success.json"
  $successOutput = @"
## Close Summary

Goal:
Validate contract.

Result:
Success.

Memory Candidates:
None.

Follow-up Tasks:
None.
"@
  $success = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" `
    -IssueId "mock-result-issue" `
    -MockIssue $mockIssue `
    -MockAgyOutput $successOutput `
    -NoPost `
    -ResultPath $successPath
  $successContract = Read-ResultContract -Path $successPath

  Assert-True ($success.posted -eq $false) "NoPost must prevent SPS comment writes."
  Assert-True ($success.markedDone -eq $false) "NoPost must prevent SPS status writes."
  Assert-True ($success.memoryCandidateRequested -eq $false) "Result contract must not request candidate writes."
  Assert-True ($successContract.contractVersion -eq 1) "Contract version must be 1."
  Assert-True ($successContract.issueId -eq "mock-result-issue") "Contract issue ID must match."
  Assert-True ($successContract.status -eq "completed") "Successful summary must be completed."
  Assert-True ($successContract.exitCode -eq 0) "Successful mock exit code must be preserved."
  Assert-True ($successContract.closeSummary.StartsWith("## Close Summary")) "Contract must contain the raw close summary."
  Assert-True (-not ($successContract.PSObject.Properties.Name -contains "promptContent")) "Contract must not expose prompt content."
  Assert-True (-not ($successContract.PSObject.Properties.Name -contains "outputPath")) "Contract must not expose output paths."

  $longPath = Join-Path $tempRoot "long.json"
  $longOutput = "## Close Summary`n`nResult:`n" + ("x" * 13000)
  & "$scriptsRoot\Invoke-AgyDirectTask.ps1" `
    -IssueId "mock-result-issue" `
    -MockIssue $mockIssue `
    -MockAgyOutput $longOutput `
    -NoPost `
    -ResultPath $longPath | Out-Null
  $longContract = Read-ResultContract -Path $longPath
  Assert-True ($longContract.closeSummary.Length -le 12060) "Structured close summary must be bounded."
  Assert-True ($longContract.closeSummary.Contains("[truncated by Invoke-AgyDirectTask.ps1]")) "Structured close summary truncation must be visible."

  $failedPath = Join-Path $tempRoot "failed.json"
  & "$scriptsRoot\Invoke-AgyDirectTask.ps1" `
    -IssueId "mock-result-issue" `
    -MockIssue $mockIssue `
    -MockAgyOutput $successOutput `
    -MockAgyExitCode 7 `
    -NoPost `
    -ResultPath $failedPath | Out-Null
  $failedContract = Read-ResultContract -Path $failedPath
  Assert-True ($failedContract.status -eq "failed") "Nonzero worker exit must fail the contract."
  Assert-True ($failedContract.exitCode -eq 7) "Failed worker exit code must be preserved."
  Assert-True ($failedContract.errorCode -eq "worker_exit_nonzero") "Failed worker must expose a bounded error code."

  $missingPath = Join-Path $tempRoot "missing.json"
  & "$scriptsRoot\Invoke-AgyDirectTask.ps1" `
    -IssueId "mock-result-issue" `
    -MockIssue $mockIssue `
    -MockAgyOutput "Worker did not follow the close summary contract." `
    -NoPost `
    -ResultPath $missingPath | Out-Null
  $missingContract = Read-ResultContract -Path $missingPath
  Assert-True ($missingContract.status -eq "failed") "Missing close summary must fail the contract."
  Assert-True ($missingContract.errorCode -eq "close_summary_missing") "Missing close summary must be explicit."

  Write-Output "=== All structured result contract tests passed successfully! ==="
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
