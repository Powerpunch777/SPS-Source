[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TaskName = "SPSStartup",
  [string]$LegacyTaskName = "",
  [string]$LauncherPath = (Join-Path $PSScriptRoot "Start-SPSScheduled.ps1"),
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
try {
  [Console]::InputEncoding = $utf8NoBom
  [Console]::OutputEncoding = $utf8NoBom
} catch {
  # A scheduled task may run without an attached console.
}
$OutputEncoding = $utf8NoBom

$resolvedLauncher = (Resolve-Path -LiteralPath $LauncherPath -ErrorAction Stop).Path
$powershellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$resolvedLauncher`""

$action = New-ScheduledTaskAction `
  -Execute $powershellPath `
  -Argument $arguments `
  -WorkingDirectory (Split-Path -Parent $resolvedLauncher)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

if ($PSCmdlet.ShouldProcess($TaskName, "Register the per-user SPS Workplane logon task")) {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Start SPS Workplane and Memory Sidecar at user logon." `
    -Force | Out-Null
}

$legacyTaskDisabled = $false
$legacyTaskDisableError = $null
$legacyTaskTriggerEnabled = $false
if (-not [string]::IsNullOrWhiteSpace($LegacyTaskName) -and $LegacyTaskName -ne $TaskName) {
  $legacyTask = Get-ScheduledTask -TaskName $LegacyTaskName -ErrorAction SilentlyContinue
  $legacyTaskTriggerEnabled = [bool]($legacyTask -and (@($legacyTask.Triggers) | Where-Object { $_.Enabled } | Select-Object -First 1))
  if ($legacyTaskTriggerEnabled -and $PSCmdlet.ShouldProcess($LegacyTaskName, "Disable the superseded standalone SPS startup task")) {
    try {
      Disable-ScheduledTask -TaskName $LegacyTaskName -ErrorAction Stop | Out-Null
      $legacyTaskDisabled = $true
      $legacyTaskTriggerEnabled = $false
    } catch {
      $legacyTaskDisableError = $_.Exception.Message
      Write-Warning "Legacy startup task '$LegacyTaskName' could not be disabled: $legacyTaskDisableError"
    }
  }
}

if ($StartNow -and $PSCmdlet.ShouldProcess($TaskName, "Start the SPS Workplane task now")) {
  Start-ScheduledTask -TaskName $TaskName
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $task = Get-ScheduledTask -TaskName $TaskName
  } until ($task.State -ne "Running" -or (Get-Date) -gt $deadline)
}

$registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
$registeredAction = @($registered.Actions) | Select-Object -First 1
$registeredTrigger = @($registered.Triggers) | Select-Object -First 1

[pscustomobject]@{
  taskName = $registered.TaskName
  state = [string]$registered.State
  userId = [string]$registered.Principal.UserId
  logonType = [string]$registered.Principal.LogonType
  execute = [string]$registeredAction.Execute
  arguments = [string]$registeredAction.Arguments
  triggerEnabled = [bool]$registeredTrigger.Enabled
  triggerUserId = [string]$registeredTrigger.UserId
  lastRunTime = $info.LastRunTime
  lastTaskResult = $info.LastTaskResult
  legacyTaskName = $LegacyTaskName
  legacyTaskDisabled = $legacyTaskDisabled
  legacyTaskTriggerEnabled = $legacyTaskTriggerEnabled
  legacyTaskDisableError = $legacyTaskDisableError
}
