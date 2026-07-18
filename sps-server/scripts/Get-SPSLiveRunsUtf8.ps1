param(
  [string]$CompanyId,

  [string]$IssueId,

  [string]$BaseUrl = $(if ($env:PAPERCLIP_API_URL) { $env:PAPERCLIP_API_URL } else { "http://127.0.0.1:3100" })
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\SPSApiUtf8.ps1"

if ($CompanyId -and $IssueId) {
  throw "Use either -CompanyId or -IssueId, not both."
}

if (-not $CompanyId -and -not $IssueId) {
  throw "Provide -CompanyId or -IssueId."
}

if ($CompanyId) {
  $path = "/api/companies/$CompanyId/live-runs"
  $scope = "company"
  $scopeId = $CompanyId
} else {
  $path = "/api/issues/$IssueId/live-runs"
  $scope = "issue"
  $scopeId = $IssueId
}

$response = Invoke-SPSApiUtf8 -Method "GET" -Path $path -BaseUrl $BaseUrl

if ($null -eq $response) {
  $rows = @()
} elseif ($response.PSObject.Properties.Name -contains "value") {
  $rows = @($response.value | Where-Object { $null -ne $_ })
} else {
  $rows = @($response | Where-Object { $null -ne $_ })
}

[pscustomobject]@{
  scope = $scope
  scopeId = $scopeId
  count = $rows.Count
  rows = $rows
}
