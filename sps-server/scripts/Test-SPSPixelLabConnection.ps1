[CmdletBinding()]
param(
    [string]$ApiUrl = "http://127.0.0.1:3100",
    [string]$CompanyId = "181e1bf7-3390-4b8d-8507-b736a03e444b",
    [string]$AgentId = "df437a20-1e6f-450f-89d6-895ab6a59425"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$baseUrl = $ApiUrl.TrimEnd('/')
$health = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/health"
$agent = Invoke-RestMethod -Method Get -Uri "$baseUrl/api/agents/$AgentId"
$secrets = @(Invoke-RestMethod -Method Get -Uri "$baseUrl/api/companies/$CompanyId/secrets")
$binding = $agent.adapterConfig.env.PIXELLAB_API_KEY
$secret = if ($null -ne $binding) {
    $secrets | Where-Object { $_.id -eq $binding.secretId } | Select-Object -First 1
}

$assetTool = $agent.adapterConfig.env.IMAGE_WORKER_ASSET_TOOL.value
$extraArgs = @($agent.adapterConfig.extraArgs)
$requiredShellPolicy = @(
    "shell_environment_policy.inherit='all'",
    'shell_environment_policy.ignore_default_excludes=true'
)
$includePolicy = $extraArgs | Where-Object { $_ -like 'shell_environment_policy.include_only=*' } | Select-Object -First 1
$result = [pscustomobject]@{
    paperclipHealthy = $health.status -eq "ok"
    imageWorkerFound = $agent.companyId -eq $CompanyId -and $agent.name -eq "Image Worker"
    assetToolConfigured = -not [string]::IsNullOrWhiteSpace($assetTool)
    assetToolExists = -not [string]::IsNullOrWhiteSpace($assetTool) -and (Test-Path -LiteralPath $assetTool -PathType Leaf)
    pixelLabSecretBound = $null -ne $binding -and $binding.type -eq "secret_ref"
    shellEnvironmentPolicyConfigured =
        ($requiredShellPolicy | Where-Object { $extraArgs -notcontains $_ }).Count -eq 0 -and
        $includePolicy -like "*'IMAGE_WORKER_ASSET_TOOL'*" -and
        $includePolicy -like "*'PIXELLAB_API_KEY'*"
    secretMetadataFound = $null -ne $secret
    secretVersion = if ($null -ne $binding) { $binding.version } else { $null }
    tokenExposed = $false
}

$result
if (-not ($result.spsHealthy -and $result.imageWorkerFound -and $result.assetToolExists -and $result.shellEnvironmentPolicyConfigured)) {
    throw "The Image Worker asset-tool base configuration is incomplete."
}
if (-not ($result.pixelLabSecretBound -and $result.secretMetadataFound)) {
    Write-Warning "PixelLab is not connected yet. Run Connect-SPSPixelLab.ps1 after creating a PixelLab token."
}
