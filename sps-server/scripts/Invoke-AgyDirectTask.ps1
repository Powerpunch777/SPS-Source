param(
  [Parameter(Mandatory = $true)]
  [string]$IssueId,

  [string]$AgyCommand = "agy",

  [string]$WorkspacePath = "C:\Users\young\Documents\sps-server",

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

  [switch]$MarkDone,

  [switch]$NoPost,

  [switch]$DryRun,

  [switch]$ProposeCandidates,

  [switch]$Unreal,

  [switch]$QA,

  [string]$ProjectFile = $null,

  [string]$MemorySidecarUrl = $(if ($env:MEMORY_SIDECAR_URL) { $env:MEMORY_SIDECAR_URL } else { "http://127.0.0.1:3188" }),

  [string]$MemoryCandidateScope = "project",

  [string]$MemoryCandidateType = "learning",

  [int]$MaxCommentChars = 12000,

  # Optional bridge-owned JSON result file. It never contains prompts, recall, paths, or secrets.
  [string]$ResultPath = $null,

  [int]$MaxStructuredResultChars = 12000,

  # Mock parameters for unit testing
  [hashtable]$MockIssue = $null,

  [object]$MockParentIssue = $null,
  [array]$MockComments = $null,
  [hashtable]$MockRecallData = $null,
  [switch]$MockRecallFail,
  [string]$MockAgyOutput = $null,
  [int]$MockAgyExitCode = 0
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\SPSApiUtf8.ps1"

$script:UprojectPath = $null

if ($Unreal) {
  $validation = & "$PSScriptRoot\Resolve-UnrealWorkspace.ps1" -WorkspacePath $WorkspacePath -ProjectFile $ProjectFile
  $WorkspacePath = $validation.WorkspacePath
  $script:UprojectPath = $validation.ProjectFile
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)
$script:LastRecallQuery = $null
$script:LastMemoryCandidatePayload = $null

function Limit-Text {
  param(
    [string]$Text,
    [int]$Limit
  )

  if ($null -eq $Text) {
    return ""
  }
  if ($Text.Length -le $Limit) {
    return $Text
  }
  return $Text.Substring(0, $Limit) + "`n`n[truncated by Invoke-AgyDirectTask.ps1]"
}

function Get-CloseSummary {
  param(
    [string]$Text
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $match = [regex]::Match(
    $Text,
    "(?is)(?:^|\r?\n)(?<summary>##\s*Close\s+Summary\b.*)\z"
  )

  if (-not $match.Success) {
    return ""
  }

  return $match.Groups["summary"].Value.Trim()
}

function Write-StructuredBridgeResult {
  param(
    [object]$Issue,
    [int]$ExitCode,
    [string]$Output,
    [string]$TargetPath,
    [int]$MaxCloseSummaryChars
  )

  if ([string]::IsNullOrWhiteSpace($TargetPath)) {
    return $null
  }

  if ($MaxCloseSummaryChars -lt 1) {
    throw "MaxStructuredResultChars must be at least 1."
  }

  $resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)
  if ([System.IO.Path]::GetExtension($resolvedTarget) -ne ".json") {
    throw "ResultPath must have a .json extension."
  }

  $parentPath = [System.IO.Path]::GetDirectoryName($resolvedTarget)
  if ([string]::IsNullOrWhiteSpace($parentPath) -or -not (Test-Path -LiteralPath $parentPath -PathType Container)) {
    throw "ResultPath parent directory does not exist."
  }

  if (Test-Path -LiteralPath $resolvedTarget) {
    throw "ResultPath already exists. Bridge result paths must be unique."
  }

  $closeSummary = Get-CloseSummary -Text $Output
  $summaryMissing = [string]::IsNullOrWhiteSpace($closeSummary)
  $boundedSummary = Limit-Text -Text $closeSummary -Limit $MaxCloseSummaryChars
  $status = if ($ExitCode -eq 0 -and -not $summaryMissing) { "completed" } else { "failed" }
  $errorCode = if ($summaryMissing) { "close_summary_missing" } elseif ($ExitCode -ne 0) { "worker_exit_nonzero" } else { $null }

  $result = [ordered]@{
    contractVersion = 1
    issueId = [string]$Issue.id
    identifier = [string]$Issue.identifier
    status = $status
    exitCode = $ExitCode
    closeSummary = $boundedSummary
    errorCode = $errorCode
  }

  $tempPath = Join-Path $parentPath ("." + [System.IO.Path]::GetFileName($resolvedTarget) + "." + [guid]::NewGuid().ToString("N") + ".tmp")
  try {
    $json = $result | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($tempPath, $json, $utf8NoBom)
    [System.IO.File]::Move($tempPath, $resolvedTarget)
  } finally {
    if (Test-Path -LiteralPath $tempPath) {
      Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
  }

  return $resolvedTarget
}

function Limit-RecallText {
  param(
    [AllowEmptyString()]
    [string]$Text,
    [Parameter(Mandatory = $true)]
    [int]$Limit
  )

  if ([string]::IsNullOrEmpty($Text) -or $Text.Length -le $Limit) {
    return $Text
  }

  $suffix = " ... [truncated]"
  if ($Limit -le $suffix.Length) {
    return $Text.Substring(0, $Limit)
  }

  return $Text.Substring(0, $Limit - $suffix.Length).TrimEnd() + $suffix
}

function Get-MemoryCandidateSection {
  param(
    [string]$Text
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $pattern = "(?is)(?:^|\r?\n)\s*(?:##\s*)?Memory\s+Candidates?\s*:?\s*(?:\r?\n)+(?<body>.*?)(?=\r?\n\s*(?:##\s*)?(?:Follow[- ]?up\s+Tasks?|Goal|Result|Changed\s+Files(?:\s+Or\s+Artifacts)?|Artifacts|Verification(?:\s+Performed)?|Durable\s+Lessons)\s*:?\s*(?:\r?\n|$)|\z)"
  $match = [regex]::Match($Text, $pattern)
  if (-not $match.Success) {
    return ""
  }

  $content = $match.Groups["body"].Value
  $boundary = [regex]::Match(
    $content,
    "(?im)^\s*(?:##\s*)?(?:Follow[- ]?up\s+Tasks?|Goal|Result|Changed\s+Files(?:\s+Or\s+Artifacts)?|Artifacts|Verification(?:\s+Performed)?|Durable\s+Lessons)\s*:"
  )
  if ($boundary.Success) {
    $content = $content.Substring(0, $boundary.Index)
  }

  return $content.Trim()
}

function Test-EmptyMemoryCandidate {
  param(
    [string]$Content
  )

  if ([string]::IsNullOrWhiteSpace($Content)) {
    return $true
  }

  $plain = ($Content -replace "(?m)^\s*[-*]\s*", "").Trim()
  return ($plain -match "(?i)^(?:none\.?|n/a|no memory candidates?\.?|none identified\.?|nothing to preserve\.?)$")
}

function Get-LoopbackUrl {
  param(
    [string]$RawUrl
  )

  $candidate = $RawUrl.Trim()
  if ($candidate -notmatch "^[A-Za-z][A-Za-z0-9+.-]*://") {
    $candidate = "http://$candidate"
  }

  $uri = [System.Uri]$candidate
  if ($uri.Scheme -notin @("http", "https")) {
    throw "Memory Sidecar URL must use http or https."
  }

  $urlHost = $uri.Host.ToLowerInvariant()
  if ($urlHost -notin @("127.0.0.1", "localhost", "::1")) {
    throw "Memory Sidecar URL must point to localhost or 127.0.0.1."
  }

  return $uri.AbsoluteUri.TrimEnd("/")
}

function Submit-MemoryCandidate {
  param(
    [string]$Content,
    [object]$Issue,
    [string]$OutputPath,
    [string]$BaseUrl,
    [string]$Scope,
    [string]$Type
  )

  $tags = @("direct-agy")
  if ($Issue.identifier) {
    $tags += [string]$Issue.identifier
  }

  $payload = @{
    scope = $Scope
    type = $Type
    content = $Content
    issueId = $Issue.id
    tags = $tags
    source = @{
      kind = "direct_agy_worker"
      id = $Issue.id
      identifier = $Issue.identifier
      outputPath = $OutputPath
    }
  }
  if ($Issue.companyId) {
    $payload["companyId"] = $Issue.companyId
  }
  if ($Issue.projectId) {
    $payload["projectId"] = $Issue.projectId
  }
  if ($Issue.assigneeAgentId) {
    $payload["agentId"] = $Issue.assigneeAgentId
  }

  $script:LastMemoryCandidatePayload = $payload

  if ($null -ne $MockIssue) {
    return [pscustomobject]@{
      candidate = [pscustomobject]@{
        id = "mock-cand-id-123"
      }
    }
  }

  $safeBaseUrl = Get-LoopbackUrl -RawUrl $BaseUrl
  $payloadJson = $payload | ConvertTo-Json -Depth 8
  $bytes = $utf8NoBom.GetBytes($payloadJson)
  return Invoke-RestMethod -Uri "$safeBaseUrl/memory/candidates" -Method Post -ContentType "application/json; charset=utf-8" -Body $bytes
}

function Get-RecallBrief {
  param(
    [object]$Issue,
    [string]$MemorySidecarUrl,
    [string]$QueryText
  )

  $script:LastRecallQuery = $QueryText

  if ($MockRecallFail) {
    return "Recall Brief:`nNo active memory recall brief was available for this task (mocked recall failure)."
  }

  $briefLines = @()
  $hasMemories = $false
  $maxItemsPerScope = 3
  $maxItemChars = 500
  $maxBriefChars = 3600

  try {
    $safeBaseUrl = ""
    if (-not $MockIssue) {
      $safeBaseUrl = Get-LoopbackUrl -RawUrl $MemorySidecarUrl
    }

    # 1. Company Memory
    if ($Issue.companyId) {
      $resCompany = if ($null -ne $MockIssue) {
        $MockRecallData.company
      } else {
        $companyUri = "$safeBaseUrl/memory/search?q=$([Uri]::EscapeDataString($QueryText))&scope=company&companyId=$([Uri]::EscapeDataString($Issue.companyId))&limit=5"
        Invoke-RestMethod -Uri $companyUri -Method Get
      }

      if ($resCompany) {
        $items = @($resCompany.items)
        if ($items.Count -gt 0) {
          $briefLines += "### Company Memory"
          foreach ($item in @($items | Select-Object -First $maxItemsPerScope)) {
            $prov = ""
            if ($item.provenance -and $item.provenance.path) {
              $prov = " (Source: $($item.provenance.path):$($item.provenance.lineStart))"
            }
            $briefLines += Limit-RecallText -Text "- [$($item.date)] $($item.section): $($item.text)$prov" -Limit $maxItemChars
            $hasMemories = $true
          }
        }
      }
    }

    # 2. Project Memory
    if ($Issue.companyId -and $Issue.projectId) {
      $resProject = if ($null -ne $MockIssue) {
        $MockRecallData.project
      } else {
        $projectUri = "$safeBaseUrl/memory/search?q=$([Uri]::EscapeDataString($QueryText))&scope=project&companyId=$([Uri]::EscapeDataString($Issue.companyId))&projectId=$([Uri]::EscapeDataString($Issue.projectId))&limit=5"
        Invoke-RestMethod -Uri $projectUri -Method Get
      }

      if ($resProject) {
        $items = @($resProject.items)
        if ($items.Count -gt 0) {
          $briefLines += "### Project Memory"
          foreach ($item in @($items | Select-Object -First $maxItemsPerScope)) {
            $prov = ""
            if ($item.provenance -and $item.provenance.path) {
              $prov = " (Source: $($item.provenance.path):$($item.provenance.lineStart))"
            }
            $briefLines += Limit-RecallText -Text "- [$($item.date)] $($item.section): $($item.text)$prov" -Limit $maxItemChars
            $hasMemories = $true
          }
        }
      }
    }

    # 3. Assigned Agent Memory
    if ($Issue.companyId -and $Issue.assigneeAgentId) {
      $resAgent = if ($null -ne $MockIssue) {
        $MockRecallData.agent
      } else {
        $agentUri = "$safeBaseUrl/memory/search?q=$([Uri]::EscapeDataString($QueryText))&scope=agent&companyId=$([Uri]::EscapeDataString($Issue.companyId))&agentId=$([Uri]::EscapeDataString($Issue.assigneeAgentId))&limit=5"
        Invoke-RestMethod -Uri $agentUri -Method Get
      }

      if ($resAgent) {
        $items = @($resAgent.items)
        if ($items.Count -gt 0) {
          $briefLines += "### Assigned Agent Memory"
          foreach ($item in @($items | Select-Object -First $maxItemsPerScope)) {
            $prov = ""
            if ($item.provenance -and $item.provenance.path) {
              $prov = " (Source: $($item.provenance.path):$($item.provenance.lineStart))"
            }
            $briefLines += Limit-RecallText -Text "- [$($item.date)] $($item.section): $($item.text)$prov" -Limit $maxItemChars
            $hasMemories = $true
          }
        }
      }
    }

    if (-not $hasMemories) {
      return "Recall Brief:`nNo active memory recall brief was available for this task."
    }

    return Limit-RecallText -Text ("Recall Brief:`n" + ($briefLines -join "`n")) -Limit $maxBriefChars
  } catch {
    return "Recall Brief:`nNo active memory recall brief was available for this task (memory sidecar unavailable: $($_.Exception.Message))."
  }
}

# Retrieve issue and comments (with mock support)
$issue = if ($null -ne $MockIssue) {
  $MockIssue
} else {
  Invoke-SPSApiUtf8 -Method "GET" -Path "/api/issues/$IssueId" -BaseUrl $BaseUrl
}

$parentRoom = $null
if ($issue.parentId) {
  if ($null -ne $MockIssue) {
    $parentRoom = $MockParentIssue
  } else {
    try {
      $parentRoom = Invoke-SPSApiUtf8 -Method "GET" -Path "/api/issues/$($issue.parentId)" -BaseUrl $BaseUrl
    } catch {
      $parentRoom = $null
    }
  }
}

$agentRoomContext = if ($parentRoom -and $parentRoom.title -match '^\[Agent Room\] ') {
  $parentDescription = [string]$parentRoom.description
  $maxParentDescriptionChars = 6000
  if ($parentDescription.Length -gt $maxParentDescriptionChars) {
    $parentDescription = $parentDescription.Substring(0, $maxParentDescriptionChars).Trim() + "`n[Role brief truncated.]"
  }
  @(
    'Agent Room Context:'
    "- Parent: $($parentRoom.identifier) $($parentRoom.title)"
    '- Treat this as durable role boundaries, not as a replacement for the current Task Room goal.'
    '```text'
    $parentDescription
    '```'
  ) -join "`n"
} elseif ($issue.parentId) {
  "Agent Room Context:`nParent context was unavailable. Follow the current Task Room scope and do not infer additional authority."
} else {
  "Agent Room Context:`nNo parent Agent Room was supplied. Follow the current Task Room scope."
}

$comments = if ($null -ne $MockIssue) {
  $MockComments
} else {
  $commentsResponse = Invoke-SPSApiUtf8 -Method "GET" -Path "/api/issues/$IssueId/comments" -BaseUrl $BaseUrl
  @($commentsResponse.value | Where-Object { $null -ne $_ } | Select-Object -First 5)
}

$commentBlock = if ($null -ne $comments -and $comments.Count -gt 0) {
  ($comments | ForEach-Object {
    "- $($_.authorType) at $($_.createdAt):`n$($_.body)"
  }) -join "`n`n"
} else {
  "No comments."
}

# Derive recall query from issue title plus description (with a sensible fixed length cap)
$queryRaw = "$($issue.title) $($issue.description)".Trim()
$cap = 500
if ($queryRaw.Length -gt $cap) {
  $queryText = $queryRaw.Substring(0, $cap).Trim()
} else {
  $queryText = $queryRaw
}

# Build Recall Brief from the Memory Sidecar
$recallBrief = Get-RecallBrief -Issue $issue -MemorySidecarUrl $MemorySidecarUrl -QueryText $queryText

$workerType = if ($QA) { "QA Worker" } elseif ($Unreal) { "Unreal Code Worker" } else { "Worker" }
$unrealContext = ""
if ($Unreal) {
  $uprojectFileName = "Unknown"
  if ($script:UprojectPath) {
    $uprojectFileName = [System.IO.Path]::GetFileName($script:UprojectPath)
  } else {
    $uprojects = Get-ChildItem -Path $WorkspacePath -Filter *.uproject -File
    if ($uprojects.Count -eq 1) {
      $uprojectFileName = $uprojects[0].Name
    }
  }
  $scopeName = if ($QA) { "QA/Unreal" } else { "Code Worker/Unreal" }
  $unrealContext = "- Scope: $scopeName`n- Project File: $uprojectFileName`n"
}

$operatingBoundary = ""
if ($QA) {
  $operatingBoundary = @"
- Default operating boundary:
  - inspect and report by default;
  - do not edit gameplay code, Blueprints, assets, project settings, build, package, launch the editor, or run destructive commands unless the Task Room explicitly authorizes that exact action.
"@
} else {
  $operatingBoundary = "- Prefer read-only inspection unless the issue explicitly asks for edits."
}

$qaInstructions = ""
if ($QA) {
  $qaInstructions = @"
For QA tasks, you must provide an actionable QA result in the Close Summary under 'Result':
- Test scope
- Reproducible steps or inspection basis
- Expected versus actual behavior
- Severity/risk
- Recommended next action

Do not require or create a new game-project document by default; the Close Summary in the Task Room comment and run artifact are sufficient.
"@
}

$prompt = @"
You are a direct local $workerType invoked through agy.exe by a Codex CTO.

You are not running inside SPS as an assigned SPS agent.
Do not assign agents, wake SPS agents, or create hidden routing logic.
Use SPS only as the source of truth for task context and final reporting.

Current Task Room:
- Identifier: $($issue.identifier)
- Issue ID: $($issue.id)
- Title: $($issue.title)
- Status: $($issue.status)
$unrealContext
Description:
```text
$($issue.description)
```

$agentRoomContext

Recent comments:
```text
$commentBlock
```

$recallBrief

Operating rules:
- Keep the work inside this Task Room scope.
$operatingBoundary
- Do not modify approved LEARNINGS.md.
- Do not create or assign SPS issues.
- Do not call SPS APIs yourself; this runner will post your final result.
- Keep the response concise.
- Do not narrate progress before the final result.
- Your stdout must start with the literal heading: ## Close Summary.
$qaInstructions
- Return only a close summary in this format:

## Close Summary

Goal:

Result:

Changed Files Or Artifacts:

Verification Performed:

Durable Lessons:

Memory Candidates:

Follow-up Tasks:
"@

$runRoot = Join-Path $WorkspacePath ".direct-agy-runs"
if ($null -eq $MockIssue -or $DryRun) {
  New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
}
$safeIdentifier = if ($issue.identifier) { $issue.identifier } else { $IssueId }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$promptPath = Join-Path $runRoot "$safeIdentifier-$stamp.prompt.md"
$outputPath = Join-Path $runRoot "$safeIdentifier-$stamp.output.md"
$commentPath = Join-Path $runRoot "$safeIdentifier-$stamp.comment.md"

if ($null -eq $MockIssue -or $DryRun) {
  [System.IO.File]::WriteAllText($promptPath, $prompt, $utf8NoBom)
}

if ($DryRun) {
  [pscustomobject]@{
    issueId = $issue.id
    identifier = $issue.identifier
    promptPath = $promptPath
    outputPath = $outputPath
    wouldRun = "$AgyCommand --print <prompt> --dangerously-skip-permissions"
    wouldPost = -not $NoPost
    wouldMarkDone = [bool]$MarkDone
    wouldProposeCandidates = [bool]$ProposeCandidates
    resultPath = $ResultPath
    recallQueryText = $script:LastRecallQuery
    memoryCandidatePayload = $script:LastMemoryCandidatePayload
    promptContent = $prompt
  }
  exit 0
}

if ($null -ne $MockIssue) {
  $output = if (-not [string]::IsNullOrEmpty($MockAgyOutput)) { $MockAgyOutput } else { "## Close Summary`n`nGoal: Mock Goal`n`nResult: Mock Result`n`nMemory Candidates:`n- This is a mock candidate memory`n`nFollow-up Tasks:`n- None" }
  $exitCode = $MockAgyExitCode
} else {
  Push-Location -LiteralPath $WorkspacePath
  try {
    try {
      $output = (& $AgyCommand --print $prompt --dangerously-skip-permissions 2>&1 | Out-String)
      $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    } catch {
      # Native CLI failures must still produce a bridge result when one is requested.
      $output = ($_ | Out-String)
      $exitCode = if ($null -eq $LASTEXITCODE -or $LASTEXITCODE -eq 0) { 1 } else { $LASTEXITCODE }
    }
  } finally {
    Pop-Location
  }
}

if ($null -eq $MockIssue) {
  [System.IO.File]::WriteAllText($outputPath, $output, $utf8NoBom)
}

$structuredResultPath = Write-StructuredBridgeResult `
  -Issue $issue `
  -ExitCode $exitCode `
  -Output $output `
  -TargetPath $ResultPath `
  -MaxCloseSummaryChars $MaxStructuredResultChars

$memoryCandidateResult = [pscustomobject]@{
  requested = [bool]$ProposeCandidates
  found = $false
  posted = $false
  candidateId = $null
  error = $null
}

if ($ProposeCandidates) {
  $candidateContent = Get-MemoryCandidateSection -Text $output
  if (-not (Test-EmptyMemoryCandidate -Content $candidateContent)) {
    $memoryCandidateResult.found = $true
    try {
      $candidateResponse = Submit-MemoryCandidate -Content $candidateContent -Issue $issue -OutputPath $outputPath -BaseUrl $MemorySidecarUrl -Scope $MemoryCandidateScope -Type $MemoryCandidateType
      $memoryCandidateResult.posted = $true
      $memoryCandidateResult.candidateId = $candidateResponse.candidate.id
    } catch {
      $memoryCandidateResult.error = $_.Exception.Message
    }
  }
}

$limitedOutput = Limit-Text -Text $output -Limit $MaxCommentChars
$issueIdentifier = [string]$issue.identifier
$commentBody = @"
## Direct Agy Worker Result

- Runner: Invoke-AgyDirectTask.ps1
- Issue: $issueIdentifier
- Exit code: $exitCode
- Output artifact: $outputPath

$limitedOutput
"@

if ($null -eq $MockIssue) {
  [System.IO.File]::WriteAllText($commentPath, $commentBody, $utf8NoBom)
}

if (-not $NoPost -and $null -eq $MockIssue) {
  & "$PSScriptRoot\Add-SPSIssueCommentUtf8.ps1" -IssueId $issue.id -BodyPath $commentPath -BaseUrl $BaseUrl | Out-Null
  if ($MarkDone -and $exitCode -eq 0) {
    & "$PSScriptRoot\Update-SPSIssueUtf8.ps1" -IssueId $issue.id -Status done -BaseUrl $BaseUrl | Out-Null
  }
}

[pscustomobject]@{
  issueId = $issue.id
  identifier = $issue.identifier
  exitCode = $exitCode
  promptPath = $promptPath
  outputPath = $outputPath
  commentPath = $commentPath
  resultPath = $structuredResultPath
  posted = -not $NoPost
  markedDone = [bool]($MarkDone -and $exitCode -eq 0 -and -not $NoPost)
  memoryCandidateRequested = $memoryCandidateResult.requested
  memoryCandidateFound = $memoryCandidateResult.found
  memoryCandidatePosted = $memoryCandidateResult.posted
  memoryCandidateId = $memoryCandidateResult.candidateId
  memoryCandidateError = $memoryCandidateResult.error
  recallQueryText = $script:LastRecallQuery
  memoryCandidatePayload = $script:LastMemoryCandidatePayload
  promptContent = $prompt
}
