$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "Apply-SPSAgyQuotaCompatibility.ps1"
$tempPath = Join-Path ([IO.Path]::GetTempPath()) ("paperclip-agy-adapter-" + [guid]::NewGuid().ToString() + ".js")
$utf8NoBom = [Text.UTF8Encoding]::new($false)

$fixture = @'
import { firstNonEmptyLine } from "../utils.js";

function run(proc, failed, rawStdout) {
        const rawStderr = proc.stderr.trim();
        return {
          result: {
            errorCode: null,
            usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
            resultJson: { raw: rawStdout, ...(providerQuota ? { errorFamily: "provider_quota", retryNotBefore: quotaRetryNotBefore, transientRetryNotBefore: quotaRetryNotBefore, providerQuotaRetryNotBefore: quotaRetryNotBefore } : {}) },
          }
        };
}
'@

try {
  [IO.File]::WriteAllText($tempPath, $fixture, $utf8NoBom)
  $result = & $scriptPath -ExecutePath $tempPath
  $source = [IO.File]::ReadAllText($tempPath, [Text.Encoding]::UTF8)

  if (-not $result.ready -or -not $result.changed -or $result.retrySchedule -ne "disabled") {
    throw "Unexpected quota compatibility result: $($result | ConvertTo-Json -Compress)"
  }
  foreach ($required in @(
    'detectAntigravityQuotaExhausted',
    'errorCode: providerQuota ? "provider_quota" : null',
    'errorFamily: providerQuota ? "provider_quota" : null',
    'resultJson: { raw: rawStdout, ...(providerQuota ? { errorFamily: "provider_quota" } : {}) },'
  )) {
    if (-not $source.Contains($required)) {
      throw "Quota compatibility output is missing '$required'."
    }
  }
  foreach ($forbidden in @("retryNotBefore", "transientRetryNotBefore", "providerQuotaRetryNotBefore", "quotaRetryMinutes", "quotaRetryNotBefore")) {
    if ($source.Contains($forbidden)) {
      throw "Quota compatibility output still contains automatic retry metadata '$forbidden'."
    }
  }
  Write-Host "Agy quota compatibility classification-only test passed."
} finally {
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
}
