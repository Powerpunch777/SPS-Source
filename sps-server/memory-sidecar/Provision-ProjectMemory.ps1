param(
  [Parameter(Mandatory = $true)]
  [string]$CompanyId,

  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [switch]$DryRun,

  [switch]$Restart
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "ProjectMemoryProvision.Core.ps1")

$projectsRoot = "C:\\Users\\young\\.sps\\instances\\default\\projects"
$configPath = Join-Path $scriptDir "config.local.json"
$result = Invoke-ProjectMemoryProvisionCore -CompanyId $CompanyId -ProjectId $ProjectId -ProjectsRoot $projectsRoot -ConfigPath $configPath -DryRun:$DryRun

$restartResult = $null
if ($Restart) {
  if ($DryRun) {
    $restartResult = [pscustomobject]@{ wouldRestart = $true }
  } else {
    $restartResult = & (Join-Path $scriptDir "Start-MemorySidecarBackground.ps1") -Restart
    if (-not $restartResult.ok) {
      throw "Memory Sidecar did not become ready after the explicit restart."
    }
  }
}

[pscustomobject]@{
  journalPath = $result.journalPath
  journalCreated = $result.journalCreated
  configUpdated = $result.configUpdated
  wouldCreateJournal = $result.wouldCreateJournal
  wouldUpdateConfig = $result.wouldUpdateConfig
  restart = $restartResult
}
