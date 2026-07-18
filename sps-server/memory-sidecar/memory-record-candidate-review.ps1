param(
  [Parameter(Mandatory = $true)]
  [string]$CandidateId,

  [ValidateSet("reviewed", "rejected", "deferred")]
  [string]$Action = "reviewed",

  [string]$Note = "",

  [switch]$Apply,

  [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\MemoryCandidateReview.ps1"

$config = Read-MemoryReviewConfig -ConfigPath $ConfigPath
$candidate = Find-MemoryCandidate -Config $config -CandidateId $CandidateId

$event = [ordered]@{
  candidateId = $candidate.id
  action = $Action
  note = $Note
  scope = $candidate.scope
  type = $candidate.type
  issueId = $candidate.issueId
}
if ($candidate.companyId) { $event.companyId = $candidate.companyId }
if ($candidate.projectId) { $event.projectId = $candidate.projectId }

"# Memory Candidate Review"
""
"Candidate ID: $($candidate.id)"
"Action: $Action"
"Apply: $([bool]$Apply)"
if ($Note) {
  "Note: $Note"
}
""
"Content:"
""
"$($candidate.content)"
""

if (-not $Apply) {
  "Preview only. Re-run with -Apply to append this review event."
  exit 0
}

$written = Add-MemoryCandidateEvent -Config $config -Event $event
"Review event written: $($written.id)"
