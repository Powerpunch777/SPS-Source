[CmdletBinding()]
param(
    [string]$ApiUrl = "http://127.0.0.1:3100",
    [string]$CompanyId = "181e1bf7-3390-4b8d-8507-b736a03e444b",
    [string]$AgentId,
    [string]$SecretName = "PixelLab API Key",
    [string]$SecretKey = "PIXELLAB_API_KEY",
    [string]$AssetToolEnvKey = "IMAGE_WORKER_ASSET_TOOL",
    [string]$AssetToolPath = (Join-Path $env:USERPROFILE ".sps\tools\image-worker-asset-tool\asset-worker-tool.mjs")
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Invoke-SPSJson {
    param(
        [Parameter(Mandatory)] [ValidateSet("GET", "POST", "PATCH")] [string]$Method,
        [Parameter(Mandatory)] [string]$Path,
        [object]$Body
    )

    $parameters = @{
        Method = $Method
        Uri = "$($ApiUrl.TrimEnd('/'))$Path"
        ContentType = "application/json; charset=utf-8"
    }
    if ($null -ne $Body) {
        $parameters.Body = $Body | ConvertTo-Json -Depth 40 -Compress
    }
    Invoke-RestMethod @parameters
}

function Copy-ObjectProperties {
    param([object]$InputObject)

    $copy = [ordered]@{}
    if ($null -eq $InputObject) { return $copy }
    foreach ($property in $InputObject.PSObject.Properties) {
        $copy[$property.Name] = $property.Value
    }
    $copy
}

$health = Invoke-SPSJson -Method GET -Path "/api/health"
if ($health.status -ne "ok") {
    throw "SPS is not healthy at $ApiUrl."
}

$resolvedAssetToolPath = (Resolve-Path -LiteralPath $AssetToolPath -ErrorAction Stop).Path
if ([IO.Path]::GetExtension($resolvedAssetToolPath) -ne ".mjs") {
    throw "PixelLab Asset Tool must point to the asset-worker-tool.mjs entry point."
}

if ([string]::IsNullOrWhiteSpace($AgentId)) {
    $agents = @(Invoke-SPSJson -Method GET -Path "/api/companies/$CompanyId/agents")
    $matches = @($agents | Where-Object { $_.name -eq "Image Worker" })
    if ($matches.Count -ne 1) {
        throw "Expected exactly one Image Worker in company $CompanyId, found $($matches.Count). Pass -AgentId explicitly."
    }
    $AgentId = $matches[0].id
}

$agent = Invoke-SPSJson -Method GET -Path "/api/agents/$AgentId"
if ($agent.companyId -ne $CompanyId) {
    throw "Agent $AgentId does not belong to company $CompanyId."
}

$secureToken = Read-Host "PixelLab API token (input is hidden)" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$plainToken = $null
try {
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ([string]::IsNullOrWhiteSpace($plainToken)) {
        throw "PixelLab API token cannot be empty."
    }

    $secrets = @(Invoke-SPSJson -Method GET -Path "/api/companies/$CompanyId/secrets")
    $secret = $secrets | Where-Object { $_.key -eq $SecretKey } | Select-Object -First 1
    if ($null -ne $secret) {
        $secret = Invoke-SPSJson -Method POST -Path "/api/secrets/$($secret.id)/rotate" -Body @{
            value = $plainToken
        }
        $secretAction = "rotated"
    }
    else {
        $secret = Invoke-SPSJson -Method POST -Path "/api/companies/$CompanyId/secrets" -Body @{
            name = $SecretName
            key = $SecretKey
            value = $plainToken
            description = "PixelLab production API token for the SPS Image Worker."
        }
        $secretAction = "created"
    }
}
finally {
    $plainToken = $null
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
}

$adapterConfig = Copy-ObjectProperties $agent.adapterConfig
$agentEnvironment = Copy-ObjectProperties $agent.adapterConfig.env
$agentEnvironment[$SecretKey] = [ordered]@{
    type = "secret_ref"
    secretId = $secret.id
    version = "latest"
}
$agentEnvironment.Remove("PAPERCLIP_ASSET_TOOL")
$agentEnvironment[$AssetToolEnvKey] = [ordered]@{
    type = "plain"
    value = $resolvedAssetToolPath
}
$adapterConfig["env"] = $agentEnvironment

# Codex filters KEY/SECRET/TOKEN names before spawning shell commands. Keep the
# Image Worker narrow by forwarding only the runtime essentials and asset keys.
$shellEnvironmentPolicy = @(
    '-c', "shell_environment_policy.inherit='all'",
    '-c', 'shell_environment_policy.ignore_default_excludes=true',
    '-c', "shell_environment_policy.include_only=['PATH','PATHEXT','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','HOME','HOMEDRIVE','HOMEPATH','LOCALAPPDATA','APPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMDATA','PSMODULEPATH','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','CODEX_HOME','IMAGE_WORKER_ASSET_TOOL','PIXELLAB_API_KEY','MESHY_API_KEY']"
)
$existingExtraArgs = @($adapterConfig["extraArgs"])
$preservedExtraArgs = [Collections.Generic.List[string]]::new()
for ($index = 0; $index -lt $existingExtraArgs.Count; $index++) {
    $argument = [string]$existingExtraArgs[$index]
    if ($argument -eq '-c' -and $index + 1 -lt $existingExtraArgs.Count -and
        [string]$existingExtraArgs[$index + 1] -like 'shell_environment_policy.*') {
        $index++
        continue
    }
    if ([string]::IsNullOrWhiteSpace($argument)) {
        continue
    }
    $preservedExtraArgs.Add($argument)
}
$adapterConfig["extraArgs"] = @($preservedExtraArgs) + $shellEnvironmentPolicy

$updated = Invoke-SPSJson -Method PATCH -Path "/api/agents/$AgentId" -Body @{
    adapterConfig = $adapterConfig
    replaceAdapterConfig = $true
}

$binding = $updated.adapterConfig.env.$SecretKey
if ($binding.type -ne "secret_ref" -or $binding.secretId -ne $secret.id) {
    throw "SPS saved the secret, but the Image Worker binding could not be verified."
}

[pscustomobject]@{
    paperclip = $health.status
    agentId = $updated.id
    agentName = $updated.name
    secretAction = $secretAction
    secretId = $secret.id
    environmentKey = $SecretKey
    bindingType = $binding.type
    version = $binding.version
    assetToolEnvironmentKey = $AssetToolEnvKey
    assetToolPath = ($updated.adapterConfig.env.$AssetToolEnvKey).value
    shellEnvironmentPolicyConfigured = @($updated.adapterConfig.extraArgs) -contains 'shell_environment_policy.ignore_default_excludes=true'
    tokenExposed = $false
}
