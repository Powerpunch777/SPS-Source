$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "ProjectMemoryProvision.Core.ps1")

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Assert-Throws {
  param([scriptblock]$Action, [string]$Message)
  try {
    & $Action | Out-Null
  } catch {
    return
  }
  throw "ASSERTION FAILED: $Message"
}

$workplaneRoot = Split-Path -Parent $scriptDir
$testRoot = Join-Path $workplaneRoot ".project-memory-test"
$projectsRoot = Join-Path $testRoot "projects"
$configPath = Join-Path $testRoot "config.local.json"
$companyId = "f4c9c1b3-462a-436b-a25b-5136a03e444b"
$projectId = "8d3e2e8c-f7a2-4fe6-9df7-eab58914bfff"
$encoding = New-Object System.Text.UTF8Encoding($false)

try {
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  $seedConfig = [ordered]@{
    server = [ordered]@{ host = "127.0.0.1"; port = 3188 }
    security = [ordered]@{ allowedOrigins = @("http://127.0.0.1:3100"); token = "test-token-preserved" }
    dataDir = "./data"
    journals = @()
  }
  [System.IO.File]::WriteAllText($configPath, ($seedConfig | ConvertTo-Json -Depth 10), $encoding)

  Write-Output "Running Test 1: malformed UUIDs are rejected without writes."
  Assert-Throws { Invoke-ProjectMemoryProvisionCore -CompanyId "not-a-uuid" -ProjectId $projectId -ProjectsRoot $projectsRoot -ConfigPath $configPath } "Malformed company ID was accepted"
  Assert-Throws { Invoke-ProjectMemoryProvisionCore -CompanyId $companyId -ProjectId "../../bad" -ProjectsRoot $projectsRoot -ConfigPath $configPath } "Malformed project ID was accepted"
  Assert-True (-not (Test-Path -LiteralPath $projectsRoot)) "Malformed IDs created a test journal"

  Write-Output "Running Test 2: malformed config fails before journal creation."
  $brokenConfigPath = Join-Path $testRoot "broken.json"
  [System.IO.File]::WriteAllText($brokenConfigPath, "{not-json", $encoding)
  Assert-Throws { Invoke-ProjectMemoryProvisionCore -CompanyId $companyId -ProjectId $projectId -ProjectsRoot $projectsRoot -ConfigPath $brokenConfigPath } "Malformed config was accepted"
  Assert-True (-not (Test-Path -LiteralPath $projectsRoot)) "Malformed config created a test journal"

  Write-Output "Running Test 3: dry run has no writes."
  $before = [System.IO.File]::ReadAllText($configPath, $encoding)
  $dryRun = Invoke-ProjectMemoryProvisionCore -CompanyId $companyId -ProjectId $projectId -ProjectsRoot $projectsRoot -ConfigPath $configPath -DryRun
  Assert-True $dryRun.wouldCreateJournal "Dry run did not report a journal creation"
  Assert-True $dryRun.wouldUpdateConfig "Dry run did not report a config update"
  Assert-True (-not (Test-Path -LiteralPath $projectsRoot)) "Dry run created a journal"
  Assert-True ([System.IO.File]::ReadAllText($configPath, $encoding) -eq $before) "Dry run changed the test config"

  Write-Output "Running Test 4: isolated provisioning and candidate boundary."
  $first = Invoke-ProjectMemoryProvisionCore -CompanyId $companyId -ProjectId $projectId -ProjectsRoot $projectsRoot -ConfigPath $configPath
  Assert-True $first.journalCreated "First provision did not create the test journal"
  Assert-True $first.configUpdated "First provision did not update the test config"
  $journal = [System.IO.File]::ReadAllText($first.journalPath, $encoding)
  Assert-True $journal.StartsWith("# Project Learning Journal") "Journal header is missing"
  Assert-True (-not ($journal -match "cand_")) "Provisioning wrote a memory candidate"
  $configured = Get-Content -Raw -LiteralPath $configPath -Encoding UTF8 | ConvertFrom-Json
  $matches = @($configured.journals | Where-Object { $_.projectId -eq $projectId })
  Assert-True ($matches.Count -eq 1) "Provisioning did not add exactly one journal entry"
  Assert-True ($configured.security.token -eq "test-token-preserved") "Provisioning changed an unrelated security field"

  Write-Output "Running Test 5: idempotency keeps one entry."
  $second = Invoke-ProjectMemoryProvisionCore -CompanyId $companyId -ProjectId $projectId -ProjectsRoot $projectsRoot -ConfigPath $configPath
  Assert-True (-not $second.journalCreated -and -not $second.configUpdated) "Second provision was not idempotent"
  $configuredAgain = Get-Content -Raw -LiteralPath $configPath -Encoding UTF8 | ConvertFrom-Json
  Assert-True (@($configuredAgain.journals | Where-Object { $_.projectId -eq $projectId }).Count -eq 1) "Second provision duplicated the journal entry"
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}

Write-Output "SUCCESS: Project memory provisioning tests are hermetic and passed."
