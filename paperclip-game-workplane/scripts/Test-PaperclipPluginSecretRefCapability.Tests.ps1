$ErrorActionPreference = "Stop"

$fixturesRoot = Join-Path $PSScriptRoot '..\tests\fixtures\plugin-secret-ref-capability'
$scriptPath = Join-Path $PSScriptRoot 'Test-PaperclipPluginSecretRefCapability.ps1'

Write-Host 'Running plugin secret-ref capability detector tests.'

$blocked = & $scriptPath -ServerRoot (Join-Path $fixturesRoot 'blocked')
if ($blocked.gateStatus -ne 'blocked' -or -not $blocked.disabledMarkerPresent -or $blocked.automaticActivationAllowed) {
  throw 'Blocked fixture did not fail closed.'
}

$review = & $scriptPath -ServerRoot (Join-Path $fixturesRoot 'review-required')
if ($review.gateStatus -ne 'review_required' -or $review.disabledMarkerPresent -or $review.automaticActivationAllowed) {
  throw 'Review-required fixture did not preserve manual activation.'
}

Write-Host 'SUCCESS: Plugin secret-ref capability detector tests passed.'
