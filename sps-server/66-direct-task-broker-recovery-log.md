# Direct Task Broker Recovery

## Goal

Restore the already enabled local Named Pipe Direct Task Broker after a reboot
without changing SPS core code or placing a bridge secret in SPS.

## Implementation

- Added `direct-task-pipe-broker/Start-DirectTaskPipeBrokerBackground.ps1`.
- It first performs a current-user named-pipe health request.
- When the enabled broker is already healthy, it returns without creating a
  duplicate process.
- When the local configuration is absent or disabled, it reports an inactive,
  healthy-by-design component and starts nothing.
- When enabled but unavailable, it starts the existing foreground broker as a
  hidden child PowerShell process, waits for pipe health, and stops that child
  if startup fails.
- `scripts/Start-SPS.ps1` now includes this recovery step after
  SPS and the Memory Sidecar are ready. `-SkipDirectTaskBroker` is an
  explicit diagnostic escape hatch.

## Verification

- `scripts/Test-StartSPSWorkplane.ps1` passed with the live broker
  detected as already running and no runtime mutation in dry-run mode.
- `direct-task-pipe-broker/Test-DirectTaskPipeBroker.ps1` passed, including
  missing-config behavior for the background starter.
- `scripts/Test-DirectTaskPluginDeploymentReadiness.ps1` now distinguishes an
  inactive legacy Bridge from an active healthy Named Pipe Broker. Its active
  mode reports `READY` without treating the Broker child process as unsafe.
- A real bootstrap returned `ready: true` and reused the active SPS,
  Sidecar, and Broker processes.
- No Task Room, Direct Task job, SPS managed run, or external `agy.exe`
  process was created during recovery verification.

## Operating Rule

After a Windows reboot, run:

```powershell
.\scripts\Start-SPS.ps1
```

This restores only the local control-plane services. A Task Room is created
only when the user explicitly launches a goal from Project Hub Direct Task
Preview.
