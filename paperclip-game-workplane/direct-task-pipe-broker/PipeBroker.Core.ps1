$ErrorActionPreference = 'Stop'

$script:PipeProtocolVersion = 1
$script:PipeBrokerNativeTypeName = 'PaperclipDirectTaskPipeNative'

function ConvertTo-PipeBrokerHashtable {
  param([object]$Value)

  if ($null -eq $Value) { return $null }
  if ($Value -is [System.Collections.IDictionary]) {
    $copy = @{}
    foreach ($key in $Value.Keys) {
      $copy[[string]$key] = ConvertTo-PipeBrokerHashtable -Value $Value[$key]
    }
    return $copy
  }
  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    return @($Value | ForEach-Object { ConvertTo-PipeBrokerHashtable -Value $_ })
  }
  if ($Value -is [pscustomobject]) {
    $copy = @{}
    foreach ($property in $Value.PSObject.Properties) {
      $copy[$property.Name] = ConvertTo-PipeBrokerHashtable -Value $property.Value
    }
    return $copy
  }
  return $Value
}

function Get-PipeBrokerProperty {
  param(
    [object]$Object,
    [string]$Name,
    [object]$Default = $null
  )

  if ($null -eq $Object) { return $Default }
  if ($Object -is [System.Collections.IDictionary]) {
    if ($Object.Contains($Name)) { return $Object[$Name] }
    return $Default
  }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $Default }
  return $property.Value
}

function Test-PipeBrokerGuid {
  param([string]$Value)
  $parsed = [guid]::Empty
  return [guid]::TryParse($Value, [ref]$parsed)
}

function Assert-PipeBrokerPipeName {
  param([string]$PipeName)
  if ([string]::IsNullOrWhiteSpace($PipeName) -or $PipeName -notmatch '^[A-Za-z0-9._-]{1,80}$') {
    throw 'invalid_pipe_name'
  }
}

function Assert-PipeBrokerLoopbackUrl {
  param([string]$BaseUrl)
  try {
    $uri = [uri]$BaseUrl
  } catch {
    throw 'invalid_paperclip_base_url'
  }
  if ($uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -notin @('', '/')) {
    throw 'invalid_paperclip_base_url'
  }
  return $uri.GetLeftPart([System.UriPartial]::Authority)
}

function Read-DirectTaskPipeBrokerConfig {
  param([Parameter(Mandatory = $true)][string]$ConfigPath)

  $resolvedPath = (Resolve-Path -LiteralPath $ConfigPath -ErrorAction Stop).Path
  try {
    $raw = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
  } catch {
    throw 'invalid_pipe_broker_config'
  }

  $security = Get-PipeBrokerProperty -Object $raw -Name 'security'
  if ($security -and (Get-PipeBrokerProperty -Object $security -Name 'bridgeSecret')) {
    throw 'pipe_broker_config_must_not_store_bridge_secret'
  }
  if (Get-PipeBrokerProperty -Object $raw -Name 'bridgeSecret') {
    throw 'pipe_broker_config_must_not_store_bridge_secret'
  }

  $enabled = Get-PipeBrokerProperty -Object $raw -Name 'enabled'
  if ($enabled -isnot [bool]) { throw 'invalid_pipe_broker_enabled' }
  $pipeName = [string](Get-PipeBrokerProperty -Object $raw -Name 'pipeName')
  Assert-PipeBrokerPipeName -PipeName $pipeName

  $paperclip = Get-PipeBrokerProperty -Object $raw -Name 'paperclip'
  $paperclipBaseUrl = Assert-PipeBrokerLoopbackUrl -BaseUrl ([string](Get-PipeBrokerProperty -Object $paperclip -Name 'baseUrl'))

  $bridge = Get-PipeBrokerProperty -Object $raw -Name 'bridge'
  try {
    $bridgePort = [int](Get-PipeBrokerProperty -Object $bridge -Name 'port')
  } catch {
    throw 'invalid_pipe_broker_bridge_port'
  }
  if ($bridgePort -lt 1024 -or $bridgePort -gt 65535) {
    throw 'invalid_pipe_broker_bridge_port'
  }

  $nodeExecutable = [string](Get-PipeBrokerProperty -Object $bridge -Name 'nodeExecutable')
  if ([string]::IsNullOrWhiteSpace($nodeExecutable) -or -not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
    throw 'invalid_pipe_broker_node_executable'
  }

  try {
    $jobTimeoutMs = [int](Get-PipeBrokerProperty -Object $raw -Name 'jobTimeoutMs' 300000)
  } catch {
    throw 'invalid_pipe_broker_job_timeout'
  }
  if ($jobTimeoutMs -lt 60000 -or $jobTimeoutMs -gt 3600000) {
    throw 'invalid_pipe_broker_job_timeout'
  }

  $mappings = Get-PipeBrokerProperty -Object $raw -Name 'projectWorkspaceMappings'
  if ($null -eq $mappings -or $mappings -isnot [pscustomobject]) {
    throw 'invalid_pipe_broker_workspace_mappings'
  }

  foreach ($property in $mappings.PSObject.Properties) {
    if (-not (Test-PipeBrokerGuid -Value $property.Name)) { throw 'invalid_pipe_broker_project_mapping' }
    $mapping = $property.Value
    $companyId = [string](Get-PipeBrokerProperty -Object $mapping -Name 'companyId')
    $workspacePath = [string](Get-PipeBrokerProperty -Object $mapping -Name 'workspacePath')
    $projectFile = [string](Get-PipeBrokerProperty -Object $mapping -Name 'projectFile')
    if (-not (Test-PipeBrokerGuid -Value $companyId) -or [string]::IsNullOrWhiteSpace($workspacePath) -or [string]::IsNullOrWhiteSpace($projectFile)) {
      throw 'invalid_pipe_broker_project_mapping'
    }
    if ($projectFile -notmatch '^[^\\/]+\.uproject$') { throw 'invalid_pipe_broker_project_file' }
    $goalId = Get-PipeBrokerProperty -Object $mapping -Name 'goalId'
    if ($goalId -and -not (Test-PipeBrokerGuid -Value ([string]$goalId))) { throw 'invalid_pipe_broker_goal_id' }
  }

  return [pscustomobject]@{
    enabled = $enabled
    pipeName = $pipeName
    paperclipBaseUrl = $paperclipBaseUrl
    bridgePort = $bridgePort
    nodeExecutable = $nodeExecutable
    mockExecution = [bool](Get-PipeBrokerProperty -Object $bridge -Name 'mockExecution' $false)
    mockDurationMs = Get-PipeBrokerProperty -Object $bridge -Name 'mockDurationMs' 100
    mockResultMode = [string](Get-PipeBrokerProperty -Object $bridge -Name 'mockResultMode' 'success')
    jobTimeoutMs = $jobTimeoutMs
    projectWorkspaceMappings = $mappings
    configPath = $resolvedPath
  }
}

function Write-PipeBrokerTextAtomic {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Text
  )

  $directory = Split-Path -Parent $Path
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  $temporary = Join-Path $directory ('.' + [System.IO.Path]::GetFileName($Path) + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
  [System.IO.File]::WriteAllText($temporary, $Text, [System.Text.UTF8Encoding]::new($false))
  try {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      $backup = $temporary + '.bak'
      [System.IO.File]::Replace($temporary, $Path, $backup, $true)
      if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    } else {
      [System.IO.File]::Move($temporary, $Path)
    }
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  }
}

function Initialize-PipeBrokerNativeInterop {
  if ($script:PipeBrokerNativeTypeName -as [type]) { return }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class PaperclipDirectTaskPipeNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct SECURITY_ATTRIBUTES {
    public int nLength;
    public IntPtr lpSecurityDescriptor;
    public int bInheritHandle;
  }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern SafePipeHandle CreateNamedPipe(
    string name,
    uint openMode,
    uint pipeMode,
    uint maxInstances,
    uint outBufferSize,
    uint inBufferSize,
    uint defaultTimeout,
    ref SECURITY_ATTRIBUTES securityAttributes);
}
'@
}

function New-PipeBrokerSecurity {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  if ($null -eq $identity.User) { throw 'pipe_broker_current_user_sid_unavailable' }
  $security = New-Object System.IO.Pipes.PipeSecurity
  $security.SetAccessRuleProtection($true, $false)
  $rights = [System.IO.Pipes.PipeAccessRights]::ReadWrite -bor [System.IO.Pipes.PipeAccessRights]::Synchronize
  $rule = New-Object System.IO.Pipes.PipeAccessRule($identity.User, $rights, [System.Security.AccessControl.AccessControlType]::Allow)
  $security.AddAccessRule($rule)
  return $security
}

function New-FirstInstancePipeServer {
  param([Parameter(Mandatory = $true)][string]$PipeName)

  Assert-PipeBrokerPipeName -PipeName $PipeName
  Initialize-PipeBrokerNativeInterop
  $security = New-PipeBrokerSecurity
  $descriptor = $security.GetSecurityDescriptorBinaryForm()
  $descriptorPointer = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($descriptor.Length)
  try {
    [System.Runtime.InteropServices.Marshal]::Copy($descriptor, 0, $descriptorPointer, $descriptor.Length)
    $attributes = New-Object PaperclipDirectTaskPipeNative+SECURITY_ATTRIBUTES
    $attributes.nLength = [System.Runtime.InteropServices.Marshal]::SizeOf([type]'PaperclipDirectTaskPipeNative+SECURITY_ATTRIBUTES')
    $attributes.lpSecurityDescriptor = $descriptorPointer
    $attributes.bInheritHandle = 0

    $pipeAccessDuplex = [uint32]0x00000003
    $firstPipeInstance = [uint32]0x00080000
    $handle = [PaperclipDirectTaskPipeNative]::CreateNamedPipe(
      "\\.\pipe\$PipeName",
      ($pipeAccessDuplex -bor $firstPipeInstance),
      [uint32]0,
      [uint32]1,
      [uint32]16384,
      [uint32]16384,
      [uint32]0,
      [ref]$attributes
    )
    if ($handle.IsInvalid) {
      $win32Error = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      throw "pipe_first_instance_create_failed:$win32Error"
    }
    return [System.IO.Pipes.NamedPipeServerStream]::new([System.IO.Pipes.PipeDirection]::InOut, $false, $false, $handle)
  } finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($descriptorPointer)
  }
}

function Read-PipeBrokerRequestLine {
  param(
    [Parameter(Mandatory = $true)][System.IO.Pipes.NamedPipeServerStream]$Pipe,
    [int]$MaxBytes = 16384
  )

  $reader = New-Object System.IO.StreamReader($Pipe, [System.Text.UTF8Encoding]::new($false), $false, $MaxBytes, $true)
  try {
    $line = $reader.ReadLine()
  } finally {
    $reader.Dispose()
  }
  if ([string]::IsNullOrWhiteSpace($line) -or [System.Text.Encoding]::UTF8.GetByteCount($line) -gt $MaxBytes) {
    throw 'invalid_pipe_request'
  }
  try {
    return $line | ConvertFrom-Json
  } catch {
    throw 'invalid_pipe_request_json'
  }
}

function Write-PipeBrokerResponseLine {
  param(
    [Parameter(Mandatory = $true)][System.IO.Pipes.NamedPipeServerStream]$Pipe,
    [Parameter(Mandatory = $true)][object]$Response
  )

  $writer = New-Object System.IO.StreamWriter($Pipe, [System.Text.UTF8Encoding]::new($false), 16384, $true)
  try {
    $writer.AutoFlush = $true
    $writer.WriteLine(($Response | ConvertTo-Json -Depth 20 -Compress))
  } finally {
    $writer.Dispose()
  }
}

function New-PipeBrokerRuntimeConfig {
  param([Parameter(Mandatory = $true)][object]$Config)

  $mappings = @{}
  foreach ($property in $Config.projectWorkspaceMappings.PSObject.Properties) {
    $mappings[$property.Name] = [string](Get-PipeBrokerProperty -Object $property.Value -Name 'workspacePath')
  }
  return [ordered]@{
    enabled = $true
    server = [ordered]@{ host = '127.0.0.1'; port = $Config.bridgePort }
    projectWorkspaceMappings = $mappings
    jobTimeoutMs = $Config.jobTimeoutMs
    mockExecution = $Config.mockExecution
    mockDurationMs = $Config.mockDurationMs
    mockResultMode = $Config.mockResultMode
  }
}

function New-PipeBrokerEphemeralSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

function Start-PipeBrokerHttpBridge {
  param(
    [Parameter(Mandatory = $true)][object]$Config,
    [Parameter(Mandatory = $true)][string]$StateDirectory
  )

  $workplaneRoot = Split-Path -Parent $PSScriptRoot
  $bridgeScript = Join-Path $workplaneRoot 'direct-task-bridge\direct-task-bridge.mjs'
  if (-not (Test-Path -LiteralPath $bridgeScript -PathType Leaf)) { throw 'pipe_broker_http_bridge_missing' }
  [System.IO.Directory]::CreateDirectory($StateDirectory) | Out-Null

  $runtimeConfigPath = Join-Path $StateDirectory 'bridge.runtime.config.json'
  $runtimeConfig = New-PipeBrokerRuntimeConfig -Config $Config
  Write-PipeBrokerTextAtomic -Path $runtimeConfigPath -Text ($runtimeConfig | ConvertTo-Json -Depth 20)

  $secret = New-PipeBrokerEphemeralSecret
  $processInfo = New-Object System.Diagnostics.ProcessStartInfo
  $processInfo.FileName = $Config.nodeExecutable
  $processInfo.Arguments = '"' + $bridgeScript + '"'
  $processInfo.WorkingDirectory = Split-Path -Parent $bridgeScript
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.EnvironmentVariables['DIRECT_TASK_BRIDGE_SECRET'] = $secret
  $processInfo.EnvironmentVariables['DIRECT_TASK_BRIDGE_CONFIG_PATH'] = $runtimeConfigPath
  $processInfo.EnvironmentVariables['DIRECT_TASK_BRIDGE_STATE_DIR'] = (Join-Path $StateDirectory 'bridge-state')
  $process = [System.Diagnostics.Process]::Start($processInfo)
  if ($null -eq $process) { throw 'pipe_broker_http_bridge_start_failed' }

  $deadline = (Get-Date).AddSeconds(5)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) { break }
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
      $tcp.Connect('127.0.0.1', $Config.bridgePort)
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 100
    } finally {
      $tcp.Dispose()
    }
  }
  if (-not $ready) {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    throw 'pipe_broker_http_bridge_not_ready'
  }

  return [pscustomobject]@{
    process = $process
    secret = $secret
    runtimeConfigPath = $runtimeConfigPath
    baseUrl = "http://127.0.0.1:$($Config.bridgePort)"
  }
}

function Stop-PipeBrokerHttpBridge {
  param([object]$BridgeRuntime)
  if ($null -eq $BridgeRuntime -or $null -eq $BridgeRuntime.process) { return }
  try {
    if (-not $BridgeRuntime.process.HasExited) {
      Stop-Process -Id $BridgeRuntime.process.Id -Force
    }
  } catch {
    # A stopped or already-exited local child is safe to ignore during shutdown.
  }
}

function Invoke-PipeBrokerHttpBridge {
  param(
    [Parameter(Mandatory = $true)][object]$BridgeRuntime,
    [Parameter(Mandatory = $true)][ValidateSet('GET', 'POST')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null
  )

  $uri = $BridgeRuntime.baseUrl.TrimEnd('/') + $Path
  $request = [System.Net.HttpWebRequest]::Create($uri)
  $request.Method = $Method
  $request.Timeout = 5000
  $request.ReadWriteTimeout = 5000
  $request.Headers['Authorization'] = "Bearer $($BridgeRuntime.secret)"
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 20 -Compress
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($json)
    $request.ContentType = 'application/json; charset=utf-8'
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
  }

  try {
    $response = $request.GetResponse()
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if ($null -eq $response) { throw 'pipe_broker_http_bridge_unavailable' }
  }

  try {
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $parsed = if ([string]::IsNullOrWhiteSpace($text)) { @{} } else { $text | ConvertFrom-Json }
    return [pscustomobject]@{ statusCode = [int]$response.StatusCode; body = $parsed }
  } finally {
    $response.Dispose()
  }
}

function Get-PipeBrokerProjectMapping {
  param(
    [Parameter(Mandatory = $true)][object]$Config,
    [Parameter(Mandatory = $true)][string]$ProjectId
  )
  return $Config.projectWorkspaceMappings.PSObject.Properties[$ProjectId].Value
}

function Get-PipeBrokerIssue {
  param(
    [Parameter(Mandatory = $true)][object]$Config,
    [Parameter(Mandatory = $true)][string]$IssueId
  )
  return Invoke-RestMethod -Uri "$($Config.paperclipBaseUrl)/api/issues/$IssueId" -TimeoutSec 5
}

function Assert-PipeBrokerSubmission {
  param(
    [Parameter(Mandatory = $true)][object]$Config,
    [Parameter(Mandatory = $true)][object]$Payload
  )

  $role = [string](Get-PipeBrokerProperty -Object $Payload -Name 'role')
  $companyId = [string](Get-PipeBrokerProperty -Object $Payload -Name 'companyId')
  $projectId = [string](Get-PipeBrokerProperty -Object $Payload -Name 'projectId')
  $issueId = [string](Get-PipeBrokerProperty -Object $Payload -Name 'issueId')
  $idempotencyKey = [string](Get-PipeBrokerProperty -Object $Payload -Name 'idempotencyKey')
  if ($role -notin @('unreal-code', 'unreal-qa')) { throw 'invalid_role' }
  if (-not (Test-PipeBrokerGuid -Value $companyId) -or -not (Test-PipeBrokerGuid -Value $projectId) -or -not (Test-PipeBrokerGuid -Value $issueId)) {
    throw 'invalid_task_identity'
  }
  if ($idempotencyKey -notmatch '^[A-Za-z0-9_-]{8,128}$') { throw 'invalid_idempotency_key' }

  $mapping = Get-PipeBrokerProjectMapping -Config $Config -ProjectId $projectId
  if ($null -eq $mapping -or [string](Get-PipeBrokerProperty -Object $mapping -Name 'companyId') -ne $companyId) {
    throw 'project_not_mapped'
  }
  $workspacePath = [string](Get-PipeBrokerProperty -Object $mapping -Name 'workspacePath')
  $configuredProjectFile = [string](Get-PipeBrokerProperty -Object $mapping -Name 'projectFile')
  if (-not (Test-Path -LiteralPath $workspacePath -PathType Container) -or -not (Test-Path -LiteralPath (Join-Path $workspacePath $configuredProjectFile) -PathType Leaf)) {
    throw 'mapped_workspace_unavailable'
  }
  $requestedProjectFile = Get-PipeBrokerProperty -Object $Payload -Name 'projectFile'
  if ($requestedProjectFile -and [string]$requestedProjectFile -ne $configuredProjectFile) {
    throw 'project_file_mismatch'
  }

  $issue = Get-PipeBrokerIssue -Config $Config -IssueId $issueId
  if ($issue.companyId -ne $companyId -or $issue.projectId -ne $projectId -or $issue.assigneeAgentId -or $issue.status -in @('done', 'blocked', 'cancelled') -or -not $issue.parentId) {
    throw 'task_room_not_eligible'
  }
  $parent = Get-PipeBrokerIssue -Config $Config -IssueId $issue.parentId
  if ($parent.companyId -ne $companyId -or $parent.projectId -ne $projectId -or $parent.parentId -or $parent.assigneeAgentId -or $parent.status -in @('done', 'cancelled') -or $parent.title -notmatch '^\[Agent Room\] ') {
    throw 'agent_room_parent_not_eligible'
  }
  $configuredGoalId = Get-PipeBrokerProperty -Object $mapping -Name 'goalId'
  if ($configuredGoalId -and ($issue.goalId -ne $configuredGoalId -or $parent.goalId -ne $configuredGoalId)) {
    throw 'goal_mismatch'
  }
}

function Invoke-PipeBrokerOperation {
  param(
    [Parameter(Mandatory = $true)][object]$Config,
    [Parameter(Mandatory = $true)][object]$BridgeRuntime,
    [Parameter(Mandatory = $true)][object]$Request
  )

  $requestId = [string](Get-PipeBrokerProperty -Object $Request -Name 'requestId')
  $operation = [string](Get-PipeBrokerProperty -Object $Request -Name 'operation')
  if (-not (Test-PipeBrokerGuid -Value $requestId)) { throw 'invalid_request_id' }
  if ([int](Get-PipeBrokerProperty -Object $Request -Name 'protocolVersion' 0) -ne $script:PipeProtocolVersion) { throw 'unsupported_protocol' }

  if ($operation -eq 'health') {
    return [pscustomobject]@{
      requestId = $requestId
      statusCode = 200
      body = [ordered]@{ ok = $true; service = 'paperclip-direct-task-pipe-broker'; transport = 'windows-named-pipe'; bridge = 'ready' }
    }
  }

  if ($operation -eq 'submit') {
    $payload = Get-PipeBrokerProperty -Object $Request -Name 'payload'
    if ($null -eq $payload) { throw 'missing_submit_payload' }
    Assert-PipeBrokerSubmission -Config $Config -Payload $payload
    $forwarded = Invoke-PipeBrokerHttpBridge -BridgeRuntime $BridgeRuntime -Method POST -Path '/direct-task/submit' -Body $payload
    return [pscustomobject]@{ requestId = $requestId; statusCode = $forwarded.statusCode; body = $forwarded.body }
  }

  if ($operation -eq 'status') {
    $jobId = [string](Get-PipeBrokerProperty -Object $Request -Name 'jobId')
    if ($jobId -notmatch '^job-[a-f0-9]{32}$') { throw 'invalid_job_id' }
    $forwarded = Invoke-PipeBrokerHttpBridge -BridgeRuntime $BridgeRuntime -Method GET -Path "/direct-task/status/$jobId"
    return [pscustomobject]@{ requestId = $requestId; statusCode = $forwarded.statusCode; body = $forwarded.body }
  }

  throw 'unsupported_pipe_operation'
}
