[CmdletBinding()]
param(
  [string]$InstanceId = "default",
  [string]$SPSConfigPath = (Join-Path $env:USERPROFILE ".sps\instances\default\config.json"),
  [string]$DockerHubPath,
  [switch]$DockerHub
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedDockerHubPath = if ($DockerHubPath) {
  $DockerHubPath
} else {
  Join-Path $repositoryRoot "sps-server\deploy\hub"
}

$dockerComposePath = Join-Path $resolvedDockerHubPath "docker-compose.yml"
$dockerEnvPath = Join-Path $resolvedDockerHubPath ".env"
$shouldUseDockerHub = $DockerHub -or (
  -not (Test-Path -LiteralPath $SPSConfigPath -PathType Leaf) -and
  (Test-Path -LiteralPath $dockerComposePath -PathType Leaf) -and
  (Test-Path -LiteralPath $dockerEnvPath -PathType Leaf)
)

if ($shouldUseDockerHub) {
  if (-not (Test-Path -LiteralPath $dockerComposePath -PathType Leaf)) {
    throw "SPS Hub Docker Compose file was not found: $dockerComposePath"
  }
  if (-not (Test-Path -LiteralPath $dockerEnvPath -PathType Leaf)) {
    throw "SPS Hub deployment configuration was not found: $dockerEnvPath"
  }

  $composeArguments = @(
    "compose", "--env-file", ".env", "-f", "docker-compose.yml",
    "exec", "-T", "sps-hub", "sh", "-lc", "pnpm paperclipai auth bootstrap-ceo"
  )

  Push-Location $resolvedDockerHubPath
  try {
    & docker @composeArguments
    if ($LASTEXITCODE -ne 0) {
      throw "SPS Hub bootstrap invite command failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
  return
}

$env:PAPERCLIP_HOME = Join-Path $env:USERPROFILE ".sps"

$corePath = Join-Path $repositoryRoot "external\sps-core"
if (-not (Test-Path -LiteralPath (Join-Path $corePath "package.json") -PathType Leaf)) {
  throw "SPS core was not found: $corePath"
}
if (-not (Test-Path -LiteralPath $SPSConfigPath -PathType Leaf)) {
  throw "SPS instance config was not found: $SPSConfigPath"
}

Push-Location $corePath
try {
  & npx.cmd --yes pnpm@9.15.4 paperclipai auth bootstrap-ceo --config $SPSConfigPath
  if ($LASTEXITCODE -ne 0) {
    throw "SPS bootstrap invite command failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
