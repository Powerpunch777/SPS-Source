param(
  [Parameter(Mandatory = $true)]
  [string]$CompanyId,

  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [Parameter(Mandatory = $true)]
  [string]$RoleName,

  [Parameter(Mandatory = $true)]
  [string]$AssigneeAgentId,

  [string]$GoalId,

  [string]$Title,

  [switch]$Apply,

  [switch]$StartImmediately,

  [switch]$AcknowledgePotentialAgentRun,

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" })
)

$ErrorActionPreference = "Stop"

# Load the core SPS API utilities
$scriptsRoot = $PSScriptRoot
. "$scriptsRoot\SPSApiUtf8.ps1"
Set-SPSUtf8 | Out-Null

# 1. Enforce safety checks on application
if ($Apply -and -not $StartImmediately) {
  Write-Error "Unsupported Behavior: Creating a non-waking/blocked assigned Agent Room is unsupported by the current SPS scheduler. Live evidence (CMP-39/CMP-41) shows that assigned issues created in blocked status are still scheduled as in_progress and run immediately. Creation of non-waking rooms is disabled. To create a runnable room, you must explicitly supply: -Apply -StartImmediately -AcknowledgePotentialAgentRun"
  exit 1
}

if ($Apply -and $StartImmediately -and -not $AcknowledgePotentialAgentRun) {
  Write-Error "Safety Violation: -AcknowledgePotentialAgentRun is required when -Apply and -StartImmediately are specified."
  Write-Host "EXPLANATION: Creating a project-scoped issue in an active state and assigning it to an agent in SPS may immediately trigger an execution run for that agent. You must explicitly acknowledge this potential behavior by adding the '-AcknowledgePotentialAgentRun' switch to your command." -ForegroundColor Yellow
  exit 1
}

# 2. Resolve the requested room and check for an existing active room (Idempotency)
$roomTitle = if ($Title) { $Title } else { "[Agent Room] $RoleName" }

try {
  $issuesResponse = Invoke-SPSApiUtf8 -Method "GET" -Path "/api/companies/$CompanyId/issues" -BaseUrl $BaseUrl
  $allIssues = if ($issuesResponse.PSObject.Properties.Name -contains "value") {
    @($issuesResponse.value | Where-Object { $null -ne $_ })
  } else {
    @($issuesResponse | Where-Object { $null -ne $_ })
  }
} catch {
  throw "Failed to fetch issues list from SPS API. Error: $($_.Exception.Message)"
}

$activeRoom = $allIssues | Where-Object {
  $_.projectId -eq $ProjectId -and
  $_.assigneeAgentId -eq $AssigneeAgentId -and
  $_.title -eq $roomTitle -and
  $_.status -ne "done" -and
  $_.status -ne "cancelled"
} | Select-Object -First 1

$matchingRoomExists = $null -ne $activeRoom

if ($Apply -and $matchingRoomExists) {
  throw "Idempotency check failed: An active Agent Room already exists for Agent ID $AssigneeAgentId in Project ID $ProjectId (Issue: $($activeRoom.identifier)). Duplicate creation aborted."
}

# 3. Retrieve agent status from SPS
try {
  $agentsResponse = Invoke-SPSApiUtf8 -Method "GET" -Path "/api/companies/$CompanyId/agents" -BaseUrl $BaseUrl
  $allAgents = if ($agentsResponse.PSObject.Properties.Name -contains "value") {
    @($agentsResponse.value | Where-Object { $null -ne $_ })
  } else {
    @($agentsResponse | Where-Object { $null -ne $_ })
  }
} catch {
  throw "Failed to fetch agents list from SPS API. Ensure SPS is running on $BaseUrl. Error: $($_.Exception.Message)"
}

$agent = $allAgents | Where-Object { $_.id -eq $AssigneeAgentId } | Select-Object -First 1
if ($null -eq $agent) {
  throw "Validation Error: Agent with ID '$AssigneeAgentId' was not found in company '$CompanyId'."
}

if ($agent.status -in @("error", "paused", "disabled")) {
  if ($StartImmediately) {
    throw "Validation Error: Selected agent '$($agent.name)' (ID: $AssigneeAgentId) is in a non-runnable state: status='$($agent.status)'. Reason: $($agent.errorReason)."
  } else {
    Write-Host "WARNING: Selected agent '$($agent.name)' (ID: $AssigneeAgentId) is in a non-runnable state: status='$($agent.status)'. Reason: $($agent.errorReason)." -ForegroundColor Yellow
    Write-Host "Since -StartImmediately is not specified, dry-run planning will proceed for diagnostic purposes." -ForegroundColor Yellow
  }
}

# 5. Resolve the role-desk description.
$templatePath = Join-Path $scriptsRoot "..\templates\AgentRoomDescriptionTemplate.md"
if (-not (Test-Path $templatePath)) {
  throw "Template file not found at $templatePath"
}

$descriptionText = Get-Content -Raw -Path $templatePath -Encoding utf8
$descriptionText = $descriptionText.Replace("{{RoleName}}", $RoleName)

# 6. Output plans
Write-Host "============================================="
Write-Host "   Agent Room Bootstrap Plan & Validation    "
Write-Host "============================================="
Write-Host "Company ID:       $CompanyId"
Write-Host "Project ID:       $ProjectId"
Write-Host "Role/Room Name:   $RoleName"
Write-Host "Agent Assignee:   $($agent.name) (ID: $AssigneeAgentId)"
Write-Host "Agent Status:     $($agent.status)"
Write-Host "Planned Title:    $roomTitle"
Write-Host "Start Immediately:$StartImmediately"
if ($StartImmediately) {
  Write-Host "Consequences:     WARNING! Creating a runnable issue will immediately trigger an agent run." -ForegroundColor Red
  Write-Host "                  This will consume LLM tokens and Codex usage limits." -ForegroundColor Red
} else {
  Write-Host "Consequences:     CRITICAL WARNING: The current SPS scheduler automatically schedules" -ForegroundColor Red
  Write-Host "                  blocked assigned issues as in_progress. Live evidence (CMP-39/CMP-41)" -ForegroundColor Red
  Write-Host "                  proves that a non-waking Agent Room is NOT supported and will trigger an agent run anyway." -ForegroundColor Red
  Write-Host "                  Applying without -StartImmediately is disabled (will fail closed)." -ForegroundColor Red
}
Write-Host "---------------------------------------------"

if ($matchingRoomExists) {
  Write-Host "Status:           MATCHING ACTIVE ROOM ALREADY EXISTS!" -ForegroundColor Red
  Write-Host "Existing Room:    $($activeRoom.identifier) (ID: $($activeRoom.id))" -ForegroundColor Yellow
  Write-Host "Current Status:   $($activeRoom.status)" -ForegroundColor Yellow
} else {
  Write-Host "Status:           No matching active room exists." -ForegroundColor Green
  Write-Host "Next step:        Runnable creation requires explicit authorization." -ForegroundColor Yellow
}
Write-Host "============================================="

# 7. Execution phase
if (-not $Apply) {
  Write-Host "[DRY-RUN] Read-only verification completed." -ForegroundColor Cyan
  Write-Host "WARNING: Creating a non-waking/blocked assigned Agent Room is unsupported by the SPS scheduler." -ForegroundColor Red
  Write-Host "A default -Apply without -StartImmediately will fail closed and create nothing." -ForegroundColor Red
  Write-Host "To perform the actual room bootstrap (runnable room), you must run with:" -ForegroundColor Cyan
  Write-Host "  -Apply -StartImmediately -AcknowledgePotentialAgentRun" -ForegroundColor Yellow
  
  # Return the planned properties for inspection/verification
  $planResult = [pscustomobject]@{
    CompanyId = $CompanyId
    ProjectId = $ProjectId
    RoleName = $RoleName
    AgentId = $AssigneeAgentId
    AgentName = $agent.name
    AgentStatus = $agent.status
    PlannedTitle = $roomTitle
    StartImmediately = $StartImmediately
    MatchingRoomExists = $matchingRoomExists
    ExistingRoomId = if ($matchingRoomExists) { $activeRoom.id } else { $null }
    ExistingRoomIdentifier = if ($matchingRoomExists) { $activeRoom.identifier } else { $null }
    Action = "DryRun"
  }
  return $planResult
} else {
  # If matching active room already exists, abort application
  if ($matchingRoomExists) {
    throw "Idempotency check failed: An active Agent Room already exists for Agent ID $AssigneeAgentId in Project ID $ProjectId (Issue: $($activeRoom.identifier)). Duplicate creation aborted."
  }

  Write-Host "Applying Agent Room bootstrap (RUNNABLE)..." -ForegroundColor Green

  $payload = @{
    title = $roomTitle
    description = $descriptionText
    projectId = $ProjectId
    assigneeAgentId = $AssigneeAgentId
    priority = "medium"
    workMode = "standard"
  }
  if ($GoalId) { $payload.goalId = $GoalId }

  # Perform POST request via the helper
  $created = Invoke-SPSApiUtf8 -Method "POST" -Path "/api/companies/$CompanyId/issues" -Body $payload -BaseUrl $BaseUrl

  Write-Host "SUCCESS: Created Agent Room issue!" -ForegroundColor Green
  Write-Host "Created Room ID:  $($created.id)"
  Write-Host "Identifier:       $($created.identifier)"
  Write-Host "Title:            $($created.title)"
  Write-Host "Assignee Agent:   $($created.assigneeAgentId)"
  Write-Host "Status:           $($created.status)"

  # Return the created room details
  $applyResult = [pscustomobject]@{
    CompanyId = $CompanyId
    ProjectId = $ProjectId
    RoleName = $RoleName
    AgentId = $AssigneeAgentId
    AgentName = $agent.name
    AgentStatus = $agent.status
    CreatedRoomId = $created.id
    CreatedRoomIdentifier = $created.identifier
    CreatedRoomTitle = $created.title
    CreatedStatus = $created.status
    Action = "Applied"
  }
  return $applyResult
}
