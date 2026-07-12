$ErrorActionPreference = 'Stop'

$companyId = '181e1bf7-3390-4b8d-8507-b736a03e444b'
$projectId = '1a3fe2e8-f7a2-4fe6-9df7-eab58914b999'
$scriptPath = Join-Path $PSScriptRoot 'Bootstrap-ProjectAgentDesks.ps1'

$results = @(& $scriptPath -CompanyId $companyId -ProjectId $projectId)
if ($results.Count -ne 7) {
  throw "Expected seven Agent Room plans, found $($results.Count)."
}
if (@($results | Where-Object { $_.status -eq 'in_progress' -or $_.assigneeAgentId }).Count -gt 0) {
  throw 'Agent desk plan contains an active or assigned room.'
}
if (@($results | Where-Object { $_.action -notin @('would_create', 'existing') }).Count -gt 0) {
  throw 'Dry run unexpectedly returned a mutating action.'
}

Write-Host 'SUCCESS: Project Agent Room bootstrap remains unassigned and non-running.'
