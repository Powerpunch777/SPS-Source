$ErrorActionPreference = 'Stop'

$companyId = '181e1bf7-3390-4b8d-8507-b736a03e444b'
$projectId = '1a3fe2e8-f7a2-4fe6-9df7-eab58914b999'
$goalId = '0cfb833b-3264-4209-b017-c4a6a3be06c1'
$ctoDeskId = '8b7821b7-e93f-4f62-a4e6-6ec7e68acbeb'
$oldProjectDeskId = '8a808053-f477-40fc-82b8-7a79aa859dfb'
$gameName = ([string][char]0xAC15) + ([string][char]0xD574) + ([string][char]0xB9B0)
$unrealRoot = Join-Path (Join-Path (Join-Path $env:USERPROFILE 'Documents') 'Unreal Projects') $gameName

Write-Host 'Running direct Task Room parent validation tests.'

$parent = & "$PSScriptRoot\Resolve-DirectTaskAgentDeskParent.ps1" `
  -ParentId $ctoDeskId -CompanyId $companyId -ProjectId $projectId
if ($parent.parent.identifier -ne 'CMP-72' -or $parent.resolvedGoalId -ne $goalId) {
  throw 'Valid CTO Agent Room did not resolve its inherited project goal.'
}

$dryRun = & "$PSScriptRoot\Invoke-DirectAgyUnrealTaskRoom.ps1" `
  -CompanyId $companyId -ProjectId $projectId -ParentId $ctoDeskId `
  -Title 'Parent validation dry run' -Description 'Read-only parent validation.' `
  -WorkspacePath $unrealRoot -DryRun
$payload = $dryRun.wouldCreate.bodyJson | ConvertFrom-Json
if ($payload.parentId -ne $ctoDeskId -or $payload.goalId -ne $goalId) {
  throw 'Dry-run task creation did not preserve the Agent Room parent and inherited goal.'
}
if ($dryRun.runnerResult.promptContent -notmatch 'Agent Room Context:' -or
    $dryRun.runnerResult.promptContent -notmatch '\[Agent Room\] CTO' -or
    $dryRun.runnerResult.promptContent -notmatch 'durable technical desk') {
  throw 'Dry-run worker prompt did not include the bounded CTO Agent Room context.'
}

$rejected = $false
try {
  & "$PSScriptRoot\Resolve-DirectTaskAgentDeskParent.ps1" `
    -ParentId $oldProjectDeskId -CompanyId $companyId -ProjectId $projectId -GoalId $goalId | Out-Null
} catch {
  $rejected = $_.Exception.Message -match 'different project'
}
if (-not $rejected) {
  throw 'Cross-project Agent Room parent was not rejected.'
}

Write-Host 'SUCCESS: Direct Task Rooms are constrained to same-project root Agent Rooms.'
