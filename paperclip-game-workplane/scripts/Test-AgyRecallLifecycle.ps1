$ErrorActionPreference = "Stop"
$scriptsRoot = $PSScriptRoot

Write-Output "=== Testing Invoke-AgyDirectTask.ps1 Recall and Candidate Lifecycle ==="

# Define test inputs
$mockCompanyId = "comp-123"
$mockProjectId = "proj-456"
$mockAgentId = "agent-789"
$mockIssueId = "issue-xyz"

# Helper to verify condition
function Assert-Equals {
  param(
    [object]$Actual,
    [object]$Expected,
    [string]$Message
  )
  if ($Actual -ne $Expected) {
    throw "ASSERTION FAILED: $Message. Expected: '$Expected', Actual: '$Actual'"
  }
}

function Assert-Contains {
  param(
    [string]$Haystack,
    [string]$Needle,
    [string]$Message
  )
  if ($null -eq $Haystack -or -not $Haystack.Contains($Needle)) {
    throw "ASSERTION FAILED: $Message. Expected string to contain '$Needle', but it was: `n$Haystack"
  }
}

# --- Test Case 1: Recall Success with Full Scope (Company, Project, Agent) ---
Write-Output "Running Test Case 1: Recall Success (Full Scope)..."

$issue1 = @{
  id = $mockIssueId
  identifier = "CMP-Test1"
  title = "Fix dashboard styling"
  description = "Align buttons to the right and update font sizes."
  companyId = $mockCompanyId
  projectId = $mockProjectId
  assigneeAgentId = $mockAgentId
  status = "backlog"
}

$mockRecallData1 = @{
  company = @{
    items = @(
      @{
        date = "2026-07-01"
        section = "Aesthetics"
        text = "Use Inter font for all user interfaces."
        provenance = @{ path = "C:\mappings\LEARNINGS.md"; lineStart = 10 }
      }
    )
  }
  project = @{
    items = @(
      @{
        date = "2026-07-02"
        section = "Styling"
        text = "Prefer flexbox layouts over grids on dashboard."
        provenance = @{ path = "C:\mappings\LEARNINGS.md"; lineStart = 20 }
      }
    )
  }
  agent = @{
    items = @(
      @{
        date = "2026-07-03"
        section = "Agent rules"
        text = "Always double check lint rules before submission."
        provenance = @{ path = "C:\mappings\LEARNINGS.md"; lineStart = 30 }
      }
    )
  }
}

$res1 = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" -IssueId $mockIssueId -MockIssue $issue1 -MockRecallData $mockRecallData1 -ProposeCandidates -NoPost

# Verify query derivation and cap
Assert-Equals $res1.recallQueryText "Fix dashboard styling Align buttons to the right and update font sizes." "Query text must be derived from title and description"

# Verify prompt contains the memories
Assert-Contains $res1.promptContent "### Company Memory" "Prompt must contain Company Memory header"
Assert-Contains $res1.promptContent "Use Inter font for all user interfaces." "Prompt must contain company memory text"
Assert-Contains $res1.promptContent "### Project Memory" "Prompt must contain Project Memory header"
Assert-Contains $res1.promptContent "Prefer flexbox layouts over grids on dashboard." "Prompt must contain project memory text"
Assert-Contains $res1.promptContent "### Assigned Agent Memory" "Prompt must contain Assigned Agent Memory header"
Assert-Contains $res1.promptContent "Always double check lint rules before submission." "Prompt must contain agent memory text"

# Verify candidate metadata composition
Assert-Equals $res1.memoryCandidatePayload.companyId $mockCompanyId "Candidate payload companyId must match"
Assert-Equals $res1.memoryCandidatePayload.projectId $mockProjectId "Candidate payload projectId must match"
Assert-Equals $res1.memoryCandidatePayload.agentId $mockAgentId "Candidate payload agentId must match"
Assert-Equals $res1.memoryCandidatePayload.issueId $mockIssueId "Candidate payload issueId must match"

Write-Output "Test Case 1 Passed!"

# --- Test Case 2: Recall Unavailable (Non-blocking fallback) ---
Write-Output "Running Test Case 2: Recall Unavailable..."

$issue2 = @{
  id = $mockIssueId
  identifier = "CMP-Test2"
  title = "Fix typo in config"
  description = "Change localhost to 127.0.0.1."
  companyId = $mockCompanyId
  projectId = $mockProjectId
  status = "backlog"
}

$res2 = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" -IssueId $mockIssueId -MockIssue $issue2 -MockRecallFail -NoPost

# Verify it was non-blocking and indicates recall was unavailable
Assert-Contains $res2.promptContent "No active memory recall brief was available for this task (mocked recall failure)." "Prompt must show that recall failed gracefully"

Write-Output "Test Case 2 Passed!"

# --- Test Case 3: Query Cap and Format ---
Write-Output "Running Test Case 3: Query Cap and Format..."

# Create a very long description (exceeding 500 characters)
$longDescription = "A" * 600
$issue3 = @{
  id = $mockIssueId
  identifier = "CMP-Test3"
  title = "Verify Query Cap"
  description = $longDescription
  companyId = $mockCompanyId
  status = "backlog"
}

$res3 = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" -IssueId $mockIssueId -MockIssue $issue3 -MockRecallFail -NoPost

Assert-Equals $res3.recallQueryText.Length 500 "Recall query length must be capped at exactly 500 characters"
Assert-Contains $res3.recallQueryText "Verify Query Cap" "Recall query must start with title"

Write-Output "Test Case 3 Passed!"

# --- Test Case 4: Candidate Metadata with Missing/Optional Fields ---
Write-Output "Running Test Case 4: Candidate Metadata with optional parameters absent..."

$issue4 = @{
  id = $mockIssueId
  identifier = "CMP-Test4"
  title = "Unassigned task"
  description = "No project, no assignee."
  companyId = $mockCompanyId
  status = "backlog"
}

$res4 = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" -IssueId $mockIssueId -MockIssue $issue4 -ProposeCandidates -NoPost

# Verify candidate metadata composition
Assert-Equals $res4.memoryCandidatePayload.companyId $mockCompanyId "Candidate payload companyId must match"
Assert-Equals $res4.memoryCandidatePayload.issueId $mockIssueId "Candidate payload issueId must match"
Assert-Equals ($null -eq $res4.memoryCandidatePayload.projectId) $true "Candidate payload must NOT contain projectId if absent"
Assert-Equals ($null -eq $res4.memoryCandidatePayload.agentId) $true "Candidate payload must NOT contain agentId if absent"

Write-Output "Test Case 4 Passed!"

# --- Test Case 5: Recall Result Bounds ---
Write-Output "Running Test Case 5: Recall Result Bounds..."

$manyCompanyItems = 1..6 | ForEach-Object {
  @{
    date = "2026-07-0$_"
    section = "Bound $_"
    text = ("X" * 900)
    provenance = @{ path = "C:\mappings\LEARNINGS.md"; lineStart = $_ }
  }
}
$issue5 = @{
  id = $mockIssueId
  identifier = "CMP-Test5"
  title = "Bound recall output"
  description = "Verify that recalled memory remains compact."
  companyId = $mockCompanyId
  status = "backlog"
}
$res5 = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" -IssueId $mockIssueId -MockIssue $issue5 -MockRecallData @{ company = @{ items = $manyCompanyItems } } -NoPost
$recallStart = $res5.promptContent.IndexOf("Recall Brief:")
$operatingRulesStart = $res5.promptContent.IndexOf("Operating rules:")
$briefText = $res5.promptContent.Substring($recallStart, $operatingRulesStart - $recallStart)

Assert-Equals (($briefText -match "Bound 4")) $false "Recall must include at most three items per scope"
Assert-Equals ($briefText.Length -le 3600) $true "Recall brief must have a bounded total length"
Assert-Equals (($briefText -match "truncated")) $true "Long recall items must be visibly truncated"

Write-Output "Test Case 5 Passed!"

# --- Test Case 6: Candidate Section Stops Before Inline Follow-up ---
Write-Output "Running Test Case 6: Candidate Section Boundary..."

$candidateOutput = @"
## Close Summary

Goal: Candidate parser test

Result: No code changes.

Memory Candidates:
- Keep this candidate only.

Follow-up Tasks: None.
"@
$res6 = & "$scriptsRoot\Invoke-AgyDirectTask.ps1" -IssueId $mockIssueId -MockIssue $issue4 -MockAgyOutput $candidateOutput -ProposeCandidates -NoPost
Assert-Equals $res6.memoryCandidatePayload.content "- Keep this candidate only." "Candidate content must not include inline follow-up text"

Write-Output "Test Case 6 Passed!"

Write-Output "=== All Invoke-AgyDirectTask.ps1 Recall & Candidate checks passed successfully! ==="
