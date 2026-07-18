<#
.SYNOPSIS
  Creates non-running role desks for a SPS Project Hub.
.DESCRIPTION
  Agent desks are unassigned backlog issues that retain each role's durable
  operating context. They do not create or wake managed agents. Actual work
  must be created as a separate, goal-scoped Task Room.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$CompanyId,

  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$GoalId,

  [switch]$Apply,

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" })
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\SPSApiUtf8.ps1"

$desks = @(
  [pscustomobject]@{
    role = 'Manager'
    title = '[Agent Room] Manager'
    description = @'
# Manager Room

## Purpose
Own project scope, priority, milestones, and work distribution for the game.

## Responsibilities
- Turn player and team requests into clear priorities and acceptance criteria.
- Keep the Project Hub focused on the current milestone and visible risks.
- Ask CTO, Designer, Art, Voice, or QA for role-specific input when needed.

## Task Rule
Do not implement work in this desk. Create or request a separate Task Room for
one concrete objective, then review its close summary.

## Memory Rule
Propose durable project decisions for review. Never auto-promote memory.

## Execution Boundary
This room is intentionally unassigned and remains a non-running backlog desk.
'@
  }
  [pscustomobject]@{
    role = 'CTO'
    title = '[Agent Room] CTO'
    description = @'
# CTO Room

## Purpose
Own technical direction, implementation design, task decomposition, and result
review for the game project.

## Responsibilities
- Inspect project memory and current technical constraints before planning.
- Define implementation boundaries, test expectations, and handoff criteria.
- Create or request goal-scoped Code, Art, QA, or other Task Rooms directly.
- Review worker close summaries before recommending the next task.

## Task Rule
This is a durable technical desk, not an implementation Task Room. Keep each
execution objective in its own Task Room and close it with evidence.

## Memory Rule
Propose only reusable technical decisions. Never auto-promote memory.

## Execution Boundary
This room is intentionally unassigned and remains a non-running backlog desk.
'@
  }
  [pscustomobject]@{
    role = 'Designer'
    title = '[Agent Room] Designer'
    description = @'
# Designer Room

## Purpose
Own game design documents, gameplay-system definitions, UX flows, and player
facing acceptance criteria.

## Responsibilities
- Translate game intent into concise system and UX documentation.
- Surface open design decisions, edge cases, and measurable playtest criteria.
- Hand technical feasibility questions to CTO and implementation work to Task Rooms.

## Task Rule
Keep one design deliverable or review objective per Task Room. Do not turn this
role desk into a catch-all planning log.

## Memory Rule
Propose stable game rules and UX decisions for review. Never auto-promote memory.

## Execution Boundary
This room is intentionally unassigned and remains a non-running backlog desk.
'@
  }
  [pscustomobject]@{
    role = 'Code Worker'
    title = '[Agent Room] Code Worker'
    description = @'
# Code Worker Room

## Purpose
Own implementation, bug fixes, build assistance, and code-level verification
inside a bounded Task Room.

## Responsibilities
- Work only from a clear goal, scoped files, and verification plan.
- Use the validated Unreal workspace boundary and report changed files.
- Run only requested builds or tests and preserve actionable evidence.

## Task Rule
Do not start work from this desk alone. Use a dedicated Task Room and finish it
with result, changed files, verification, risks, and next work.

## Memory Rule
Propose reusable coding conventions or technical findings for review only.

## Execution Boundary
This room is intentionally unassigned and remains a non-running backlog desk.
'@
  }
  [pscustomobject]@{
    role = 'Art Worker'
    title = '[Agent Room] Art Worker'
    description = @'
# Art Worker Room

## Purpose
Own image, Blender, and Unreal asset workflow assistance while preserving source
assets, prompts, import metadata, and reviewable art direction.

## Responsibilities
- Keep source assets, references, prompts, and import scripts organized.
- Respect binary Unreal asset boundaries and avoid editing binary assets as text.
- Coordinate technical import constraints with CTO and the current art Task Room.

## Task Rule
Use a separate Task Room for one asset batch, import rule, prompt set, or visual
review objective.

## Memory Rule
Propose stable art direction and pipeline decisions for review only.

## Execution Boundary
This room is intentionally unassigned and remains a non-running backlog desk.
'@
  }
  [pscustomobject]@{
    role = 'Voice Worker'
    title = '[Agent Room] Voice Worker'
    description = @'
# Voice Worker Room

## Purpose
Own voice-production assistance, dialogue asset organization, and import-ready
audio handoff requirements.

## Responsibilities
- Define script, naming, format, source, and licensing checks for audio work.
- Coordinate timing, localization, and implementation constraints with Designer
  and CTO.
- Keep generated or sourced audio traceable to its approved Task Room.

## Task Rule
Use a separate Task Room for one audio batch, dialogue pass, export requirement,
or integration review.

## Memory Rule
Propose reusable voice pipeline rules for review only.

## Execution Boundary
This room is intentionally unassigned and remains a non-running backlog desk.
'@
  }
  [pscustomobject]@{
    role = 'QA Worker'
    title = '[Agent Room] QA Worker'
    description = @'
# QA Worker Room

## Purpose
Own test cases, reproducible bug reports, smoke checks, and release-review
evidence for the game project.

## Responsibilities
- Define concrete reproduction steps, expected and actual behavior, severity,
  environment, and evidence requirements.
- Keep default QA work read-only unless a Task Room explicitly requests edits or
  build/package activity.
- Return actionable findings to CTO or Manager through the Task Room close summary.

## Task Rule
Use a separate Task Room for one test plan, regression pass, investigation, or
release gate.

## Memory Rule
Propose only reusable test rules and confirmed regression findings for review.

## Execution Boundary
This room is intentionally unassigned and remains a non-running backlog desk.
'@
  }
)

$issuesResponse = Invoke-SPSApiUtf8 -Method 'GET' -Path "/api/companies/$CompanyId/issues" -BaseUrl $BaseUrl
$allIssues = if ($issuesResponse.PSObject.Properties.Name -contains 'value') {
  @($issuesResponse.value | Where-Object { $null -ne $_ })
} else {
  @($issuesResponse | Where-Object { $null -ne $_ })
}

$results = foreach ($desk in $desks) {
  $existing = @($allIssues | Where-Object {
    $_.projectId -eq $ProjectId -and
    $_.title -eq $desk.title -and
    $_.status -notin @('done', 'cancelled')
  } | Select-Object -First 1)[0]

  if ($existing) {
    if ($existing.assigneeAgentId) {
      throw "Refusing to reuse assigned Agent Room '$($desk.title)' ($($existing.identifier)). Agent desks must remain unassigned."
    }
    [pscustomobject]@{
      role = $desk.role
      action = 'existing'
      issueId = $existing.id
      identifier = $existing.identifier
      status = $existing.status
      assigneeAgentId = $existing.assigneeAgentId
    }
    continue
  }

  if (-not $Apply) {
    [pscustomobject]@{
      role = $desk.role
      action = 'would_create'
      issueId = $null
      identifier = $null
      status = 'backlog'
      assigneeAgentId = $null
    }
    continue
  }

  $payload = @{
    title = $desk.title
    description = $desk.description
    projectId = $ProjectId
    status = 'backlog'
    priority = 'low'
    workMode = 'planning'
  }
  if ($GoalId) {
    $payload.goalId = $GoalId
  }

  $created = Invoke-SPSApiUtf8 -Method 'POST' -Path "/api/companies/$CompanyId/issues" -Body $payload -BaseUrl $BaseUrl
  if ($created.assigneeAgentId) {
    throw "Refusing unexpected assigned Agent Room '$($desk.title)' ($($created.identifier))."
  }
  if ($created.status -eq 'in_progress') {
    throw "Refusing unexpected active Agent Room '$($desk.title)' ($($created.identifier))."
  }

  [pscustomobject]@{
    role = $desk.role
    action = 'created'
    issueId = $created.id
    identifier = $created.identifier
    status = $created.status
    assigneeAgentId = $created.assigneeAgentId
  }
}

$results
