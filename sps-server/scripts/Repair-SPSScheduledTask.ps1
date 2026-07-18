[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TaskName = "SPSLocalServer",
  [string]$LauncherPath,
  [string]$ResultPath
)

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
try {
  [Console]::InputEncoding = $utf8NoBom
  [Console]::OutputEncoding = $utf8NoBom
} catch {
  # Elevated scheduled-task repair may run without an attached console.
}
$OutputEncoding = $utf8NoBom

trap {
  if (-not [string]::IsNullOrWhiteSpace($ResultPath)) {
    try {
      $resultDirectory = Split-Path -Parent $ResultPath
      if (-not [string]::IsNullOrWhiteSpace($resultDirectory)) {
        New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
      }
      $failure = [pscustomobject]@{
        taskName = $TaskName
        usesLocalLauncher = $false
        error = $_.Exception.Message
      }
      [System.IO.File]::WriteAllText($ResultPath, ($failure | ConvertTo-Json -Depth 4), $utf8NoBom)
    } catch {
      # Preserve the original failure if diagnostics cannot be written.
    }
  }
  exit 1
}

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($LauncherPath)) {
  $LauncherPath = Join-Path $PSScriptRoot "Start-SPSLocalServer.ps1"
}

$resolvedLauncher = (Resolve-Path -LiteralPath $LauncherPath -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $resolvedLauncher -PathType Leaf)) {
  throw "SPS local launcher was not found: $resolvedLauncher"
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$resolvedLauncher`""
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments -WorkingDirectory (Split-Path -Parent $resolvedLauncher)

if ($PSCmdlet.ShouldProcess($TaskName, "Replace the scheduled action with the local Workplane core launcher")) {
  try {
    Set-ScheduledTask -TaskName $TaskName -Action $action -ErrorAction Stop | Out-Null
  } catch {
    if ($_.Exception.Message -match "Access is denied|0x80070005") {
      throw "Updating scheduled task '$TaskName' requires an elevated PowerShell window. Re-run this script as administrator."
    }
    throw
  }
}

$updated = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$updatedAction = @($updated.Actions) | Select-Object -First 1

$result = [pscustomobject]@{
  taskName = $updated.TaskName
  state = [string]$updated.State
  userId = [string]$updated.Principal.UserId
  execute = [string]$updatedAction.Execute
  arguments = [string]$updatedAction.Arguments
  launcherPath = $resolvedLauncher
  usesLocalLauncher = ([string]$updatedAction.Arguments).IndexOf($resolvedLauncher, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

if (-not [string]::IsNullOrWhiteSpace($ResultPath)) {
  $resultDirectory = Split-Path -Parent $ResultPath
  if (-not [string]::IsNullOrWhiteSpace($resultDirectory)) {
    New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($ResultPath, ($result | ConvertTo-Json -Depth 4), $utf8NoBom)
}

$result
