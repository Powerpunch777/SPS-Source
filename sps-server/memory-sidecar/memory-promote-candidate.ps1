param(
  [Parameter(Mandatory = $true)]
  [string]$CandidateId,

  [string]$JournalId = "",

  [string]$Section = "Memory Candidate Promotions",

  [string]$Date = $(Get-Date -Format "yyyy-MM-dd"),

  [string]$Note = "",

  [switch]$Apply,

  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\MemoryCandidateReview.ps1"

$config = Read-MemoryReviewConfig -ConfigPath $ConfigPath
$candidate = Find-MemoryCandidate -Config $config -CandidateId $CandidateId
$journal = Resolve-MemoryJournal -Config $config -Candidate $candidate -JournalId $JournalId
$journalPath = Resolve-MemoryReviewPath -BaseDir $config._configDir -Path ([string]$journal.path)
$learningText = Convert-CandidateToLearningText -Candidate $candidate

if ([string]::IsNullOrWhiteSpace($learningText)) {
  throw "Candidate content is empty after normalization."
}

$entry = "- $Date`: $learningText"

"# Memory Candidate Promotion"
""
"Candidate ID: $($candidate.id)"
"Apply: $([bool]$Apply)"
"Target Journal ID: $($journal.id)"
"Target Journal Path: $journalPath"
"Target Section: $Section"
""
"Entry:"
""
"$entry"
""

if (-not $Apply) {
  "Preview only. Re-run with -Apply to append this entry and record a promotion event."
  exit 0
}

Add-LearningJournalEntry -JournalPath $journalPath -Section $Section -Entry $entry

$event = [ordered]@{
  candidateId = $candidate.id
  action = "promoted"
  note = $Note
  scope = $candidate.scope
  type = $candidate.type
  issueId = $candidate.issueId
}
if ($candidate.companyId) { $event.companyId = $candidate.companyId }
if ($candidate.projectId) { $event.projectId = $candidate.projectId }
$event.journalId = $journal.id
$event.journalPath = $journalPath
$event.section = $Section
$event.entry = $entry

$written = Add-MemoryCandidateEvent -Config $config -Event $event
"Promotion applied."
"Review event written: $($written.id)"
