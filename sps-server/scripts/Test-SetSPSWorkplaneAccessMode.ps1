$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "Set-SPSWorkplaneAccessMode.ps1"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("paperclip-access-mode-test-" + [guid]::NewGuid().ToString("N"))
$configPath = Join-Path $tempRoot "config.json"
$environmentPath = Join-Path $tempRoot ".env"

function Write-TestConfig {
  param([string]$Path)
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $Path)) | Out-Null
  [System.IO.File]::WriteAllText($Path, '{"server":{"port":3100},"auth":{}}' + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Assert-Equal {
  param($Actual, $Expected, [string]$Message)
  if ($Actual -ne $Expected) { throw "$Message. Expected '$Expected'; got '$Actual'." }
}

try {
  Write-TestConfig -Path $configPath
  [System.IO.File]::WriteAllText($environmentPath, "BETTER_AUTH_SECRET=test-secret`n", [System.Text.UTF8Encoding]::new($false))

  & $scriptPath -Mode LocalOnly -SPSConfigPath $configPath -EnvironmentPath $environmentPath -NoBackup | Out-Null
  $local = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-Equal $local.server.deploymentMode "local_trusted" "Local mode"
  Assert-Equal $local.server.bind "loopback" "Local bind"
  Assert-Equal $local.server.host "127.0.0.1" "Local host"
  if (@($local.server.allowedHostnames).Count -ne 0) { throw "Local mode must clear allowed hostnames." }

  & $scriptPath -Mode PrivateTailnet -SPSConfigPath $configPath -EnvironmentPath $environmentPath -AllowedHostname "paperclip.tailnet.ts.net" -NoBackup | Out-Null
  $tailnet = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-Equal $tailnet.server.deploymentMode "authenticated" "Tailnet mode"
  Assert-Equal $tailnet.server.bind "tailnet" "Tailnet bind"
  Assert-Equal $tailnet.server.allowedHostnames[0] "paperclip.tailnet.ts.net" "Tailnet allowed hostname"

  & $scriptPath -Mode Public -SPSConfigPath $configPath -EnvironmentPath $environmentPath -AllowedHostname "workplane.example.com" -PublicBaseUrl "https://workplane.example.com" -NoBackup | Out-Null
  $public = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-Equal $public.server.exposure "public" "Public exposure"
  Assert-Equal $public.server.bind "lan" "Public bind"
  Assert-Equal $public.auth.baseUrlMode "explicit" "Public URL mode"
  Assert-Equal $public.auth.publicBaseUrl "https://workplane.example.com" "Public URL"

  [System.IO.File]::WriteAllText($environmentPath, "", [System.Text.UTF8Encoding]::new($false))
  $failedWithoutSecret = $false
  try { & $scriptPath -Mode PrivateLan -SPSConfigPath $configPath -EnvironmentPath $environmentPath -AllowedHostname "workplane.local" -NoBackup | Out-Null } catch { $failedWithoutSecret = $_.Exception.Message -match "does not contain BETTER_AUTH_SECRET" }
  if (-not $failedWithoutSecret) { throw "Remote access must refuse to apply without an authentication secret." }

  Write-Output "PASS Set-SPSWorkplaneAccessMode.ps1 safely configures explicit local, Tailnet, and public access modes"
} finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
