param(
  [Parameter(Mandatory = $true)]
  [string]$IssueId,

  [string]$Body,

  [string]$BodyPath,

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\PaperclipApiUtf8.ps1"

# Ensure UTF-8 Console Settings
Set-PaperclipUtf8 | Out-Null

# 1. Validate required token
$bearerToken = Get-PaperclipApiBearerToken
if ([string]::IsNullOrWhiteSpace($bearerToken)) {
  throw "Required token (TASK_BRIDGE_API_KEY or PAPERCLIP_API_KEY) is absent. Task closure requires agent authentication."
}

# 2. Validate required run ID
if ([string]::IsNullOrWhiteSpace($env:PAPERCLIP_RUN_ID)) {
  throw "Required run ID (PAPERCLIP_RUN_ID) is absent. Task closure requires run scope."
}

# 3. Read and validate comment body
if ($Body -and $BodyPath) {
  throw "Use either -Body or -BodyPath, not both."
}

if ($BodyPath) {
  $text = Read-PaperclipUtf8Text -Path $BodyPath
} elseif ($Body) {
  $text = $Body
} else {
  throw "Provide -Body or -BodyPath. Use -BodyPath for Korean text, Markdown, or literal backticks."
}

if ([string]::IsNullOrWhiteSpace($text)) {
  throw "Close summary comment body is empty."
}

# 4. Assert board write rules (extra safety check)
Assert-PaperclipBoardWriteAllowed `
  -IssueId $IssueId `
  -Operation "task close" `
  -BaseUrl $BaseUrl `
  -DryRun:$DryRun

# 5. Post the close summary comment
$commentPayload = @{
  body = $text
}
Write-Output "Posting close summary comment to issue $IssueId via task-bridge..."
$commentResult = Invoke-PaperclipApiUtf8 `
  -Method "POST" `
  -Path "/api/issues/$IssueId/comments" `
  -Body $commentPayload `
  -BaseUrl $BaseUrl `
  -DryRun:$DryRun

# 6. Mark the issue done
$statusPayload = @{
  status = "done"
}
Write-Output "Marking issue $IssueId done via task-bridge..."
$statusResult = Invoke-PaperclipApiUtf8 `
  -Method "PATCH" `
  -Path "/api/issues/$IssueId" `
  -Body $statusPayload `
  -BaseUrl $BaseUrl `
  -DryRun:$DryRun

Write-Output "Task $IssueId successfully closed via task-bridge."
