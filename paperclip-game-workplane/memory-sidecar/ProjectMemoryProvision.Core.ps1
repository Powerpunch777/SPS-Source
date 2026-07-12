function Test-ProjectMemoryUuid {
  param([string]$Value)

  return $Value -match "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
}

function Resolve-ProjectMemoryJournalPath {
  param(
    [string]$ProjectsRoot,
    [string]$CompanyId,
    [string]$ProjectId
  )

  $root = [System.IO.Path]::GetFullPath($ProjectsRoot)
  $projectRoot = [System.IO.Path]::GetFullPath((Join-Path $root (Join-Path $CompanyId $ProjectId)))
  $journalPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "_default\\LEARNINGS.md"))
  $projectPrefix = $projectRoot + [System.IO.Path]::DirectorySeparatorChar

  if (-not $journalPath.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Project journal path escaped its managed project root."
  }

  return $journalPath
}

function Write-Utf8NoBomAtomic {
  param(
    [string]$Path,
    [string]$Content
  )

  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent)) {
    [System.IO.Directory]::CreateDirectory($parent) | Out-Null
  }

  $temporaryPath = Join-Path $parent ("." + [System.IO.Path]::GetFileName($Path) + "." + [guid]::NewGuid().ToString("N") + ".tmp")
  $backupPath = Join-Path $parent ("." + [System.IO.Path]::GetFileName($Path) + "." + [guid]::NewGuid().ToString("N") + ".bak")
  $encoding = New-Object System.Text.UTF8Encoding($false)

  try {
    [System.IO.File]::WriteAllText($temporaryPath, $Content, $encoding)
    if (Test-Path -LiteralPath $Path) {
      [System.IO.File]::Replace($temporaryPath, $Path, $backupPath, $true)
    } else {
      [System.IO.File]::Move($temporaryPath, $Path)
    }
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
    if (Test-Path -LiteralPath $backupPath) {
      Remove-Item -LiteralPath $backupPath -Force
    }
  }
}

function Invoke-ProjectMemoryProvisionCore {
  param(
    [string]$CompanyId,
    [string]$ProjectId,
    [string]$ProjectsRoot,
    [string]$ConfigPath,
    [switch]$DryRun
  )

  if (-not (Test-ProjectMemoryUuid -Value $CompanyId)) {
    throw "CompanyId must be a UUID."
  }
  if (-not (Test-ProjectMemoryUuid -Value $ProjectId)) {
    throw "ProjectId must be a UUID."
  }
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Memory Sidecar config file was not found."
  }

  try {
    $config = (Get-Content -Raw -LiteralPath $ConfigPath -Encoding UTF8) | ConvertFrom-Json
  } catch {
    throw "Memory Sidecar config is not valid JSON."
  }
  if ($null -eq $config -or $null -eq $config.PSObject.Properties["journals"]) {
    throw "Memory Sidecar config must contain a journals array."
  }

  $journalPath = Resolve-ProjectMemoryJournalPath -ProjectsRoot $ProjectsRoot -CompanyId $CompanyId -ProjectId $ProjectId
  $journals = @($config.journals)
  $matches = @($journals | Where-Object {
    $_.scope -eq "project" -and $_.companyId -eq $CompanyId -and $_.projectId -eq $ProjectId
  })
  if ($matches.Count -gt 1) {
    throw "Memory Sidecar config contains duplicate entries for this project."
  }

  $journalCreated = -not (Test-Path -LiteralPath $journalPath)
  $configUpdated = $matches.Count -eq 0
  if ($DryRun) {
    return [pscustomobject]@{
      journalPath = $journalPath
      journalCreated = $false
      configUpdated = $false
      wouldCreateJournal = $journalCreated
      wouldUpdateConfig = $configUpdated
    }
  }

  if ($journalCreated) {
    $header = "# Project Learning Journal`r`n`r`nApproved project-specific decisions and learnings belong in this journal.`r`n"
    Write-Utf8NoBomAtomic -Path $journalPath -Content $header
  }

  if ($configUpdated) {
    $entry = [pscustomobject][ordered]@{
      id = "project-" + $ProjectId.Split("-")[0]
      name = "Project Learning Journal"
      scope = "project"
      companyId = $CompanyId
      projectId = $ProjectId
      path = $journalPath
    }
    $config.journals = @($journals) + @($entry)
    Write-Utf8NoBomAtomic -Path $ConfigPath -Content ($config | ConvertTo-Json -Depth 20)
  }

  return [pscustomobject]@{
    journalPath = $journalPath
    journalCreated = $journalCreated
    configUpdated = $configUpdated
    wouldCreateJournal = $false
    wouldUpdateConfig = $false
  }
}
