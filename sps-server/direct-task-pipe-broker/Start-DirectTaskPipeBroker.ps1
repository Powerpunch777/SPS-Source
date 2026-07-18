<#
.SYNOPSIS
  Starts the local Windows Named Pipe gateway for Direct Task execution.
.DESCRIPTION
  This broker is disabled by default. It owns a current-user ACL protected named
  pipe and an in-memory token for its child loopback bridge. It never reads or
  writes Paperclip plugin secrets.
#>
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.local.json'),
  [string]$StateDirectory = (Join-Path $PSScriptRoot 'runtime'),
  [int]$MaxRequests = 0
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\PipeBroker.Core.ps1"

$config = Read-DirectTaskPipeBrokerConfig -ConfigPath $ConfigPath
if (-not $config.enabled) {
  throw 'pipe_broker_disabled'
}
if ($MaxRequests -lt 0) {
  throw 'invalid_max_requests'
}

$bridgeRuntime = $null
$handledRequests = 0
try {
  $bridgeRuntime = Start-PipeBrokerHttpBridge -Config $config -StateDirectory $StateDirectory
  while ($MaxRequests -eq 0 -or $handledRequests -lt $MaxRequests) {
    $pipe = New-FirstInstancePipeServer -PipeName $config.pipeName
    try {
      $pipe.WaitForConnection()
      $request = $null
      try {
        $request = Read-PipeBrokerRequestLine -Pipe $pipe
        $operationResult = Invoke-PipeBrokerOperation -Config $config -BridgeRuntime $bridgeRuntime -Request $request
        $response = [ordered]@{
          protocolVersion = 1
          requestId = $operationResult.requestId
          ok = ($operationResult.statusCode -ge 200 -and $operationResult.statusCode -lt 300)
          statusCode = $operationResult.statusCode
          body = $operationResult.body
        }
      } catch {
        $requestId = if ($request) { [string](Get-PipeBrokerProperty -Object $request -Name 'requestId') } else { $null }
        $response = [ordered]@{
          protocolVersion = 1
          requestId = $requestId
          ok = $false
          statusCode = 400
          body = [ordered]@{ error = $_.Exception.Message }
        }
      }
      Write-PipeBrokerResponseLine -Pipe $pipe -Response $response
      $handledRequests++
    } finally {
      $pipe.Dispose()
    }
  }
} finally {
  Stop-PipeBrokerHttpBridge -BridgeRuntime $bridgeRuntime
}
