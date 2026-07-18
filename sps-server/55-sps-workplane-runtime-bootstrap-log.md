# SPS Workplane Runtime Bootstrap Log

Date: 2026-07-10
Task: CMP-64 Add idempotent local workplane runtime bootstrap

## Goal

Create an idempotent helper script under `scripts/` that detects, starts, and verifies the SPS local server plane (`127.0.0.1:3100`) and the Memory Sidecar (`127.0.0.1:3188`) together after reboot/restart, preserving any already healthy components without interruption.

## Design and Implementation

We added a new PowerShell helper: [Start-SPS.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/scripts/Start-SPS.ps1)

### Features

1. **Idempotency**: It checks if TCP connections are already listening on 127.0.0.1:3100 (SPS) and 127.0.0.1:3188 (Memory Sidecar). If a component is already listening, it is preserved and not restarted.
2. **Local Launch Paths**:
   - If SPS is unavailable, it starts it via `npx.cmd paperclipai run` in a hidden window (`-WindowStyle Hidden`), redirecting standard output and error to `logs/paperclip.out.log` and `logs/paperclip.err.log` under the workspace root.
   - If Memory Sidecar is unavailable, it starts it via `memory-sidecar/Start-MemorySidecarBackground.ps1`, which in turn configures its local JSON and launches the Node service.
3. **Readiness and Polling**: It polls the unauthenticated health API endpoints for both components (`/api/health` for SPS and `/health` for Memory Sidecar) every 1 second until both respond successfully, up to a configurable timeout (default 30 seconds).
4. **Dry Run Support**: A `-DryRun` switch is provided to check and report the status of components and simulate what actions would be taken, without launching processes or mutating the runtime.
5. **No OS-Login Auto-start Overhead**: This script provides a single manual recovery step for the operator after a reboot or network plane disruption without assuming automatic startup configurations.

## Test Verification

We added a dedicated test suite: [Test-StartSPSWorkplane.ps1](file:///C:/Users/young/Documents/AGENT%20%EA%B5%AC%EC%B6%95/sps-server/scripts/Test-StartSPSWorkplane.ps1)

The test suite validates:
1. Syntax / Static command checks on `Start-SPS.ps1`.
2. Dry run behavior on active live ports (detects them as healthy, reports ready).
3. Dry run behavior on simulated offline ports (detects them as offline, reports not ready, and does not spawn any background processes).
4. Safety validation that `DryRun` does not mutate any processes.

### Test Run Output

```
=============================================
 Starting Start-SPS Test Suite
=============================================
[TEST 1] Syntax / Static check on Start-SPS.ps1... [PASS]
[TEST 2] Dry Run with active live ports (should detect healthy components)... [PASS]
[TEST 3] Dry Run with offline ports (should detect offline status without spawning)... [PASS]
[TEST 4] Live DryRun does not mutate runtime... [PASS]
=============================================
   All Start-SPS Tests Passed!
=============================================
```

## Live Idempotent Invocation

Running the script when both services are healthy:

```powershell
& "scripts/Start-SPS.ps1" | Format-List
```

Produces:

```
ready         : True
paperclip     : @{ok=True; alreadyRunning=True; started=False; processId=8516; url=http://127.0.0.1:3100}
memorySidecar : @{ok=True; alreadyRunning=True; started=False; processId=3480; url=http://127.0.0.1:3188}
```

Both services are confirmed healthy, no processes were stopped or restarted, and the script finished instantly.

## Post-Reboot Recovery Step

When the local machine is restarted or SPS/Memory Sidecar goes offline, run the following single command from the workspace root:

```powershell
.\scripts\Start-SPS.ps1
```
