$ErrorActionPreference = "Stop"

function Set-PaperclipUtf8 {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)
  [Console]::InputEncoding = $utf8NoBom
  [Console]::OutputEncoding = $utf8NoBom
  $global:OutputEncoding = $utf8NoBom
  return $utf8NoBom
}

function Join-PaperclipApiUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $base = $BaseUrl.TrimEnd("/")
  if ($Path.StartsWith("/")) {
    return "$base$Path"
  }
  return "$base/$Path"
}

function Get-PaperclipApiBearerToken {
  if ($env:PAPERCLIP_API_KEY) {
    return $env:PAPERCLIP_API_KEY
  }

  if ($env:TASK_BRIDGE_API_KEY) {
    return $env:TASK_BRIDGE_API_KEY
  }

  return $null
}

function Invoke-PaperclipApiUtf8 {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("GET", "POST", "PATCH", "PUT", "DELETE")]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$Path,

    [object]$Body = $null,

    [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

    [switch]$DryRun
  )

  $utf8NoBom = Set-PaperclipUtf8
  $uri = Join-PaperclipApiUrl -BaseUrl $BaseUrl -Path $Path
  $headers = @{
    "Accept" = "application/json"
  }

  $bearerToken = Get-PaperclipApiBearerToken
  if ($bearerToken) {
    $headers["Authorization"] = "Bearer $bearerToken"
  }

  if ($env:PAPERCLIP_RUN_ID) {
    $headers["x-paperclip-run-id"] = $env:PAPERCLIP_RUN_ID
  }

  $json = $null
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 50
  }

  if ($DryRun) {
    return [pscustomobject]@{
      method = $Method
      uri = $uri
      bodyJson = $json
    }
  }

  if ($null -eq $json) {
    return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers
  }

  $bytes = $utf8NoBom.GetBytes($json)
  return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -Body $bytes -ContentType "application/json; charset=utf-8"
}

function Assert-PaperclipBoardWriteAllowed {
  param(
    [Parameter(Mandatory = $true)]
    [string]$IssueId,

    [Parameter(Mandatory = $true)]
    [string]$Operation,

    [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" }),

    [switch]$AllowBoardWriteToAssignedIssue,

    [switch]$DryRun
  )

  if ($DryRun -or (Get-PaperclipApiBearerToken) -or $AllowBoardWriteToAssignedIssue) {
    return
  }

  $issue = Invoke-PaperclipApiUtf8 -Method "GET" -Path "/api/issues/$IssueId" -BaseUrl $BaseUrl

  if ($issue.assigneeAgentId) {
    $label = if ($issue.identifier) { $issue.identifier } else { $IssueId }
    throw "Refusing board-auth $Operation on assigned issue $label. Local unauthenticated API writes are recorded as local-board and can re-wake assigned Paperclip agents. Use an agent-authenticated/task-bridge path, the Paperclip UI, or pass -AllowBoardWriteToAssignedIssue for deliberate manual cleanup."
  }
}

function Read-PaperclipUtf8Text {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false, $true)
  return [System.IO.File]::ReadAllText($resolved, $utf8NoBom)
}
