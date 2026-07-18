param(
  [string]$ExecutePath = (Join-Path $env:USERPROFILE ".sps\adapter-plugins\node_modules\@weslleycapelari\adapter-antigravity-local\dist\server\execute.js"),
  # Retained only so older manual invocations do not fail. Quota classification
  # no longer creates a retry schedule or a transient-retry hint.
  [int]$RetryMinutes = 0,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath $ExecutePath -PathType Leaf)) {
  throw "SPS Agy adapter execute module was not found at: $ExecutePath"
}
if ($RetryMinutes -lt 0) {
  throw "RetryMinutes cannot be negative."
}

$source = [IO.File]::ReadAllText($ExecutePath, [Text.Encoding]::UTF8)
$patched = $source
$importLine = 'import { detectAntigravityQuotaExhausted } from "./parse.js";'

if (-not $patched.Contains($importLine)) {
  $anchor = 'import { firstNonEmptyLine } from "../utils.js";'
  if (-not $patched.Contains($anchor)) {
    throw "Agy quota compatibility import anchor was not found. The adapter may have changed upstream."
  }
  $patched = $patched.Replace($anchor, "$anchor`n$importLine")
}

$classificationMarker = "// paperclip-workplane: classify Agy quota failures"
if (-not $patched.Contains($classificationMarker)) {
  $anchor = '        const rawStderr = proc.stderr.trim();'
  if (-not $patched.Contains($anchor)) {
    throw "Agy quota classification anchor was not found. The adapter may have changed upstream."
  }
  $replacement = @"
$anchor
$classificationMarker
        const providerQuota = failed && detectAntigravityQuotaExhausted({ stdout: proc.stdout, stderr: proc.stderr }).exhausted;
"@
  $patched = $patched.Replace($anchor, $replacement.TrimEnd("`r", "`n"))
}

# Remove the old retry metadata if a previous Workplane version wrote it. A
# provider quota is a visible blocker; the owning Lead decides whether to retry.
$patched = [regex]::Replace($patched, '(?m)^\s*const quotaRetryMinutes = .*\r?\n', '')
$patched = [regex]::Replace($patched, '(?m)^\s*const quotaRetryNotBefore = .*\r?\n', '')

$resultMarker = "// paperclip-workplane: expose SPS transient recovery contract"
if (-not $patched.Contains($resultMarker)) {
  $anchor = @"
            errorCode: null,
            usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
"@
  if (-not $patched.Contains($anchor.TrimEnd("`r", "`n"))) {
    throw "Agy quota result anchor was not found. The adapter may have changed upstream."
  }
$replacement = @"
            $resultMarker
            errorCode: providerQuota ? "provider_quota" : null,
            errorFamily: providerQuota ? "provider_quota" : null,
            usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
"@
  $patched = $patched.Replace($anchor.TrimEnd("`r", "`n"), $replacement.TrimEnd("`r", "`n"))
}
$patched = [regex]::Replace($patched, '(?m)^\s*retryNotBefore: quotaRetryNotBefore,\r?\n', '')

$resultJsonAnchor = '            resultJson: { raw: rawStdout },'
$resultJsonReplacement = '            resultJson: { raw: rawStdout, ...(providerQuota ? { errorFamily: "provider_quota" } : {}) },'
if ($patched.Contains($resultJsonAnchor)) {
  $patched = $patched.Replace($resultJsonAnchor, $resultJsonReplacement)
} elseif (-not $patched.Contains($resultJsonReplacement)) {
  $patched = [regex]::Replace(
    $patched,
    'resultJson: \{ raw: rawStdout, \.\.\.\(providerQuota \? \{ errorFamily: "provider_quota", retryNotBefore: quotaRetryNotBefore, transientRetryNotBefore: quotaRetryNotBefore, providerQuotaRetryNotBefore: quotaRetryNotBefore \} : \{\}\) \},',
    $resultJsonReplacement
  )
  if (-not $patched.Contains($resultJsonReplacement)) {
    throw "Agy quota resultJson anchor was not found. The adapter may have changed upstream."
  }
}

$requiredFragments = @(
  $importLine,
  $classificationMarker,
  'errorCode: providerQuota ? "provider_quota" : null',
  'errorFamily: providerQuota ? "provider_quota" : null',
  'resultJson: { raw: rawStdout, ...(providerQuota ? { errorFamily: "provider_quota" } : {}) },'
)
foreach ($fragment in $requiredFragments) {
  if (-not $patched.Contains($fragment)) {
    throw "Agy quota compatibility validation failed: missing '$fragment'."
  }
}

$changed = $patched -cne $source
if ($changed -and -not $DryRun) {
  [IO.File]::WriteAllText($ExecutePath, $patched, $utf8NoBom)
}

return [pscustomobject]@{
  ready = $true
  changed = $changed
  dryRun = [bool]$DryRun
  executePath = [IO.Path]::GetFullPath($ExecutePath)
  retrySchedule = 'disabled'
}
