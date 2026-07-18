$script:MemoryCandidateReviewRoot = Split-Path -Parent $PSCommandPath
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)

function Resolve-MemoryConfigPath {
  param([string]$ConfigPath = "")

  if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    return Join-Path $script:MemoryCandidateReviewRoot "config.local.json"
  }

  if ([System.IO.Path]::IsPathRooted($ConfigPath)) {
    return $ConfigPath
  }

  return Join-Path $script:MemoryCandidateReviewRoot $ConfigPath
}

function Read-MemoryReviewConfig {
  param([string]$ConfigPath = "")

  $resolved = Resolve-MemoryConfigPath -ConfigPath $ConfigPath
  $raw = [System.IO.File]::ReadAllText($resolved, $script:Utf8NoBom)
  $config = $raw | ConvertFrom-Json
  $config | Add-Member -NotePropertyName "_configPath" -NotePropertyValue $resolved -Force
  $config | Add-Member -NotePropertyName "_configDir" -NotePropertyValue (Split-Path -Parent $resolved) -Force
  return $config
}

function Resolve-MemoryReviewPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseDir,

    [string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $Path
  }

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }

  return [System.IO.Path]::GetFullPath((Join-Path $BaseDir $Path))
}

function Get-MemoryReviewDataDir {
  param([Parameter(Mandatory = $true)]$Config)

  $dataDir = if ($Config.dataDir) { [string]$Config.dataDir } else { "./data" }
  return Resolve-MemoryReviewPath -BaseDir $Config._configDir -Path $dataDir
}

function Read-MemoryReviewJsonl {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }

  $items = New-Object System.Collections.Generic.List[object]
  $lines = Get-Content -LiteralPath $Path -Encoding UTF8
  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    $items.Add(($line | ConvertFrom-Json))
  }
  return $items.ToArray()
}

function Get-MemoryCandidatesFilePath {
  param([Parameter(Mandatory = $true)]$Config)
  return Join-Path (Get-MemoryReviewDataDir -Config $Config) "memory-candidates.jsonl"
}

function Get-MemoryCandidateEventsFilePath {
  param([Parameter(Mandatory = $true)]$Config)
  return Join-Path (Get-MemoryReviewDataDir -Config $Config) "memory-candidate-events.jsonl"
}

function Get-MemoryCandidatesFromFile {
  param([Parameter(Mandatory = $true)]$Config)
  return Read-MemoryReviewJsonl -Path (Get-MemoryCandidatesFilePath -Config $Config)
}

function Get-MemoryCandidateEvents {
  param([Parameter(Mandatory = $true)]$Config)
  return Read-MemoryReviewJsonl -Path (Get-MemoryCandidateEventsFilePath -Config $Config)
}

function Find-MemoryCandidate {
  param(
    [Parameter(Mandatory = $true)]$Config,

    [Parameter(Mandatory = $true)]
    [string]$CandidateId
  )

  $candidate = @(Get-MemoryCandidatesFromFile -Config $Config | Where-Object { $_.id -eq $CandidateId } | Select-Object -First 1)
  if ($candidate.Count -eq 0) {
    throw "Memory candidate not found: $CandidateId"
  }
  return $candidate[0]
}

function Get-LatestMemoryCandidateEventMap {
  param([Parameter(Mandatory = $true)]$Config)

  $map = @{}
  foreach ($event in (Get-MemoryCandidateEvents -Config $Config | Sort-Object createdAt)) {
    if ($event.candidateId) {
      $map[[string]$event.candidateId] = $event
    }
  }
  return $map
}

function Add-MemoryCandidateEvent {
  param(
    [Parameter(Mandatory = $true)]$Config,

    [Parameter(Mandatory = $true)]$Event
  )

  $eventsPath = Get-MemoryCandidateEventsFilePath -Config $Config
  $eventsDir = Split-Path -Parent $eventsPath
  New-Item -ItemType Directory -Path $eventsDir -Force | Out-Null

  $payload = [ordered]@{
    id = "event_$([guid]::NewGuid().ToString("N"))"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
  }

  foreach ($property in $Event.GetEnumerator()) {
    $payload[$property.Key] = $property.Value
  }

  $json = ($payload | ConvertTo-Json -Depth 12 -Compress)
  [System.IO.File]::AppendAllText($eventsPath, "$json`n", $script:Utf8NoBom)
  return [pscustomobject]$payload
}

function Resolve-MemoryJournal {
  param(
    [Parameter(Mandatory = $true)]$Config,

    [Parameter(Mandatory = $true)]$Candidate,

    [string]$JournalId = ""
  )

  $journals = @($Config.journals | Where-Object { $null -ne $_ })
  if ($JournalId) {
    $matches = @($journals | Where-Object { $_.id -eq $JournalId })
    if ($matches.Count -eq 0) {
      throw "Journal not found: $JournalId"
    }
    return $matches[0]
  }

  $scope = [string]$Candidate.scope
  $matches = @($journals | Where-Object { $_.scope -eq $scope })

  if ($scope -eq "agent" -and $Candidate.agentId) {
    $agentMatches = @($matches | Where-Object { $_.agentId -eq $Candidate.agentId })
    if ($agentMatches.Count -eq 1) {
      return $agentMatches[0]
    }
  }

  if ($matches.Count -eq 1) {
    return $matches[0]
  }

  $available = ($journals | ForEach-Object { "$($_.id)[$($_.scope)]" }) -join ", "
  throw "Could not infer a unique target journal for scope '$scope'. Use -JournalId. Available journals: $available"
}

function Convert-CandidateToLearningText {
  param([Parameter(Mandatory = $true)]$Candidate)

  $lines = ([string]$Candidate.content) -split "\r?\n" |
    ForEach-Object { ($_ -replace "^\s*[-*]\s*", "").Trim() } |
    Where-Object { $_ }

  $text = ($lines -join " ") -replace "\s+", " "
  return $text.Trim()
}

function Add-LearningJournalEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$JournalPath,

    [Parameter(Mandatory = $true)]
    [string]$Section,

    [Parameter(Mandatory = $true)]
    [string]$Entry
  )

  $parent = Split-Path -Parent $JournalPath
  New-Item -ItemType Directory -Path $parent -Force | Out-Null

  $raw = if (Test-Path -LiteralPath $JournalPath) {
    [System.IO.File]::ReadAllText($JournalPath, $script:Utf8NoBom)
  } else {
    "# Learning Journal`r`n"
  }

  $sectionPattern = "(?m)^##\s+$([regex]::Escape($Section))\s*$"
  if ($raw -notmatch $sectionPattern) {
    if (-not $raw.EndsWith("`n")) {
      $raw += "`r`n"
    }
    $raw += "`r`n## $Section`r`n`r`n"
  } elseif (-not $raw.EndsWith("`n")) {
    $raw += "`r`n"
  }

  $raw += "$Entry`r`n"
  [System.IO.File]::WriteAllText($JournalPath, $raw, $script:Utf8NoBom)
}
