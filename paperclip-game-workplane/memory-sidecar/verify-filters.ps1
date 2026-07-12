$ErrorActionPreference = "Stop"
Write-Host "Running Node memory filter verification..." -ForegroundColor Cyan
node "$PSScriptRoot\verify-filters.mjs"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Verification Success!" -ForegroundColor Green
} else {
    Write-Error "Verification Failed!"
}
