[CmdletBinding()]
param(
  [string]$SourceRoot,
  [string]$SPSBaseUrl = "http://127.0.0.1:3100",
  [string]$SPSInstanceRoot = (Join-Path $env:USERPROFILE ".sps\instances\default"),
  [int]$MaximumInstructionBytes = 24576
)

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
try {
  [Console]::InputEncoding = $utf8NoBom
  [Console]::OutputEncoding = $utf8NoBom
} catch {
  # Test runners may not have an attached console.
}
$OutputEncoding = $utf8NoBom

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Join-Path (Split-Path -Parent $PSScriptRoot) "agent-instructions"
}

function Test-IsCompanyStaffAgent {
  param([object]$Agent)

  if ($null -eq $Agent -or [string]::IsNullOrWhiteSpace([string]$Agent.id)) { return $false }
  if ($Agent.status -in @("terminated", "deleted")) { return $false }
  if ($null -eq $Agent.metadata) { return $true }
  return $null -eq $Agent.metadata.spsBuiltInAgent
}

$beginMarker = "<!-- BEGIN PAPERCLIP COMPANY CONTRACT -->"
$endMarker = "<!-- END PAPERCLIP COMPANY CONTRACT -->"
$mapPath = Join-Path $SourceRoot "agent-role-map.json"
$contractPath = Join-Path $SourceRoot "COMPANY_CONTRACT.md"
$roleMap = Get-Content -Raw -Encoding UTF8 -LiteralPath $mapPath | ConvertFrom-Json
$companyId = [string]$roleMap.companyId
$agentRoot = Join-Path $SPSInstanceRoot "companies\$companyId\agents"
$apiUri = "$($SPSBaseUrl.TrimEnd('/'))/api/companies/$companyId/agents"
$agentResponse = Invoke-RestMethod -Uri $apiUri -Method Get -TimeoutSec 5
$allAgents = @($agentResponse)
$activeAgents = @($allAgents | Where-Object { Test-IsCompanyStaffAgent $_ })
$knownAgentIds = @($allAgents | ForEach-Object { [string]$_.id })

$entriesById = @{}
foreach ($entry in @($roleMap.agents)) {
  $entriesById[[string]$entry.id] = $entry
}

$contract = (Get-Content -Raw -Encoding UTF8 -LiteralPath $contractPath).Trim()
$pattern = [regex]::Escape($beginMarker) + "(.*?)" + [regex]::Escape($endMarker)
$regex = [regex]::new($pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
$errors = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$results = @()

if ($activeAgents.Count -eq 0 -and @($roleMap.agents).Count -gt 0) {
  $errors.Add("No company staff Agents remained after filtering SPS built-in Agents")
}

foreach ($agent in $activeAgents) {
  $agentId = [string]$agent.id
  if (-not $entriesById.ContainsKey($agentId)) {
    $errors.Add("Unmapped active Agent: $($agent.name) [$agentId]")
    continue
  }

  $entry = $entriesById[$agentId]
  $profileId = [string]$entry.profile
  $roleId = [string]$entry.role
  if ($profileId -notin @("task-owner", "worker")) {
    $errors.Add("$($agent.name): invalid or missing profile '$profileId'")
    continue
  }
  $profilePath = Join-Path $SourceRoot "profiles\$profileId.md"
  if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) {
    $errors.Add("$($agent.name): missing profile template $profilePath")
    continue
  }
  $profileContent = (Get-Content -Raw -Encoding UTF8 -LiteralPath $profilePath).Trim()
  $expectedManagedContent = @($contract, $profileContent) -join ([Environment]::NewLine + [Environment]::NewLine)
  $instructionPath = Join-Path $agentRoot "$agentId\instructions\AGENTS.md"
  if (-not (Test-Path -LiteralPath $instructionPath -PathType Leaf)) {
    $errors.Add("Missing Instructions: $($agent.name) [$instructionPath]")
    continue
  }

  $instructionBytes = [System.IO.File]::ReadAllBytes($instructionPath)
  if ($instructionBytes.Length -lt 3 -or $instructionBytes[0] -ne 0xEF -or $instructionBytes[1] -ne 0xBB -or $instructionBytes[2] -ne 0xBF) {
    $errors.Add("$($agent.name): AGENTS.md must be UTF-8 with BOM for Windows CLI compatibility")
  }

  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $instructionPath
  $fileBytes = (Get-Item -LiteralPath $instructionPath).Length
  $matches = $regex.Matches($content)
  if ($matches.Count -ne 1) {
    $errors.Add("$($agent.name): expected one managed company contract, found $($matches.Count)")
  }
  elseif ($matches[0].Groups[1].Value.Trim() -cne $expectedManagedContent) {
    $errors.Add("$($agent.name): managed company contract/profile differs from the canonical sources")
  }

  $profileMarker = "<!-- PAPERCLIP PROFILE: $profileId -->"
  if (-not $content.Contains($profileMarker)) {
    $errors.Add("$($agent.name): missing profile marker $profileMarker")
  }
  $roleMarker = "<!-- PAPERCLIP ROLE: $roleId -->"
  if (-not $content.Contains($roleMarker)) {
    $errors.Add("$($agent.name): missing role marker $roleMarker")
  }
  if ($fileBytes -gt $MaximumInstructionBytes) {
    $errors.Add("$($agent.name): Instructions size $fileBytes exceeds $MaximumInstructionBytes bytes")
  }
  if ($content -match "(?i)you are (codex|claude|gemini)") {
    $errors.Add("$($agent.name): role policy is tied to a specific model identity")
  }

  $commonTerms = @(
    "Company -> Project -> Agent Room -> Task",
    "originatingRoomIssueId",
    "owningAgentId",
    "reportsTo",
    "Control Plane",
    "기술 완료 판정",
    "사용자를 대신해"
  )
  $profileTerms = switch ($profileId) {
    "task-owner" { @("Task Owner", "일시정지", "blocked", "같은 blocked Task", "done") }
    "worker" { @("## SPS Final Report", "## SPS Blocker Report", "Task 상태를 직접 변경", "정확히 하나") }
  }
  $roleTerms = switch ($roleId) {
    "manager" { @("우선순위", "의존성", "공용 Worker") }
    "designer" { @("제품·게임 시스템", "설계 저장소", "Image Worker", "직접 생산하지 않는다") }
    "cto" { @("아키텍처", "영향 경로", "어느 공용 Worker") }
    "code-worker" { @("코드", "빌드", "실제 결과") }
    "qa-worker" { @("재현 절차", "실제 결과", "직접 고치지 않는다") }
    "image-worker" { @("시각 Task", "특정 모델", "원본·출력 경로") }
    "voice-worker" { @("음성·오디오", "실제 생성 연결", "동의·라이선스") }
    "document-worker" { @("대상 독자", "사용 근거", "결정을 새로 만들지 않는다") }
    default { @() }
  }
  foreach ($term in @($commonTerms + $profileTerms + $roleTerms)) {
    if (-not $content.Contains($term)) {
      $errors.Add("$($agent.name): required instruction boundary term is missing: $term")
    }
  }

  if ([string]$agent.name -cne [string]$entry.name) {
    $warnings.Add("Agent name differs from map: '$($entry.name)' -> '$($agent.name)' [$agentId]")
  }
  $results += [pscustomobject]@{
    name = [string]$agent.name
    profile = $profileId
    role = $roleId
    bytes = $fileBytes
    path = $instructionPath
  }
}

$activeIds = @($activeAgents | ForEach-Object { [string]$_.id })
foreach ($entry in @($roleMap.agents)) {
  if ($activeIds -notcontains [string]$entry.id) {
    $warnings.Add("Mapped Agent is not active: $($entry.name) [$($entry.id)]")
  }
}

if (Test-Path -LiteralPath $agentRoot -PathType Container) {
  foreach ($folder in Get-ChildItem -LiteralPath $agentRoot -Directory) {
    if ($knownAgentIds -notcontains $folder.Name) {
      $historicalAgent = $null
      try {
        $historicalAgent = Invoke-RestMethod -Uri "$($SPSBaseUrl.TrimEnd('/'))/api/agents/$($folder.Name)" -Method Get -TimeoutSec 5
      } catch {
        # A folder without a matching Agent record is still reported below.
      }
      if (
        $null -ne $historicalAgent -and
        [string]$historicalAgent.companyId -eq $companyId -and
        $historicalAgent.status -in @("terminated", "deleted")
      ) {
        continue
      }
      $warnings.Add("Unknown Agent instruction folder: $($folder.Name)")
    }
  }
}

$report = [pscustomobject]@{
  passed = $errors.Count -eq 0
  activeAgentCount = $activeAgents.Count
  checkedAgentCount = $results.Count
  errors = @($errors)
  warnings = @($warnings | Select-Object -Unique)
  agents = $results
}
$report

if ($errors.Count -gt 0) {
  exit 1
}
