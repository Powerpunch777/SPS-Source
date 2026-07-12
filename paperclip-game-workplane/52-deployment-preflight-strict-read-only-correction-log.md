# Deployment Preflight Strict Read-Only Correction (CMP-62) Log

## Objective
Correct the Direct Task deployment preflight checker script (`scripts/Test-DirectTaskPluginDeploymentReadiness.ps1`) to strictly adhere to read-only boundaries by removing all process-spawning mechanisms (e.g., `Start-Process`, `cmd.exe`, `npm`, `npx`), making live runtime checks fail closed on unavailability or unrecognized data shapes, and strengthening its internal `-TestMode` self-check.

## Implementation Details

1. **Strict Process-Spawn Removal & Externalized Validation**:
   - Removed `Start-Process cmd.exe /c npm run check` and all process spawning logic from the preflight script.
   - Added an explicit `[ValidateSet("passed", "failed", "not_run")]` parameter `-SourceValidationStatus` (defaulting to `"not_run"`).
   - In `-TestMode`, if `-SourceValidationStatus` is not explicitly provided, it defaults to `"passed"` to allow mock execution checks.
   - The script now reports `sourceReady=true` only for the `"passed"` status. A status of `"failed"` triggers `status=unsafe` (exits 1), and `"not_run"` results in a blocked/not-ready status (exits 0 but `sourceReady=false` and activation remains blocked).

2. **Fail-Closed Live Runtime Checks**:
   - The GET `/api/companies/{companyId}/live-runs` checker was updated to catch API request errors or unrecognized data shapes.
   - If the request fails or the returned shape is unrecognized, `liveRunsCheck` is set to `"unavailable"`, activation is blocked, and the script does not claim zero runs exist.
   - In production (when not in `$TestMode`), an `"unavailable"` runs check is treated as unsafe/nonzero, causing the script to exit 1.

3. **Expanded Output Schema**:
   - Added explicit structured fields to the preflight report object:
     - `missingSourceCapabilities`
     - `sourceDirectTaskApiRoutes`
     - `sourceDirectTaskJobs`
     - `sourceActionRegistered`
     - `liveDirectTaskApiRoutePresent`
     - `liveDirectTaskJobPresent`
     - `liveDirectTaskActionPresent`
     - `liveRunsCheck`

4. **Strengthened Hermetic Test Mode**:
   - The `-TestMode` safety assertions were updated to read and scan the script itself using string concatenation for all forbidden cmdlets/keywords (preventing self-matching).
   - Confirms that the non-test portion of the script does not contain any file writing (`Set-Content`, `Out-File`, etc.), mutating HTTP methods (`POST`, `PUT`, etc.), or process-spawn mechanisms (`Start-Process`, `cmd.exe`, `npm`, etc.).
   - Added unit test cases inside `-TestMode` asserting:
     - Scenario 1: validation status `"passed"` succeeds.
     - Scenario 2: validation status `"failed"` triggers unsafe state.
     - Scenario 3: validation status `"not_run"` results in blocked status (not unsafe).
     - Scenario 4: live runs check `"unavailable"` is tolerated in `$TestMode=true`.
     - Scenario 5: live runs check `"unavailable"` triggers unsafe state in `$TestMode=false`.

5. **External Validation & Documentation Execution**:
   - Ran `npm run check` externally inside `paperclip-memory-plugin` directory, which successfully verified all 13 direct task integration tests, managed agent lifecycle probe tests, and UI contract tests.
   - Executed the preflight checker script with its status explicitly passed, verifying correct output and exit codes across passed/failed/not-run scenarios.

## Verification Results

- **Self-Test Verification**: Running `scripts/Test-DirectTaskPluginDeploymentReadiness.ps1 -TestMode` successfully verified all safety assertions and mocked outputs.
- **External Plugin Check**: Executed `npm run check` in `paperclip-memory-plugin` successfully.
- **Real Local Preflight (Passed)**:
  - Command: `powershell -File .\scripts\Test-DirectTaskPluginDeploymentReadiness.ps1 -SourceValidationStatus passed`
  - Result: `status=ready`, `sourceReady=True`, `livePreviewOnly=True`, `activationBlocked=True`, `requiresExplicitDeploymentAuthorization=True`.
- **Real Local Preflight (Failed)**:
  - Command: `powershell -File .\scripts\Test-DirectTaskPluginDeploymentReadiness.ps1 -SourceValidationStatus failed`
  - Result: `status=unsafe` (exit code 1), `unsafeReasons: {Source validation failed (npm run check failed)}`.
- **Real Local Preflight (Not Run)**:
  - Command: `powershell -File .\scripts\Test-DirectTaskPluginDeploymentReadiness.ps1 -SourceValidationStatus not_run`
  - Result: `status=ready` (exit code 0), `sourceReady=False`, `activationBlocked=True`.
- **Real Local Preflight (Connection Unavailable)**:
  - Command: `powershell -File .\scripts\Test-DirectTaskPluginDeploymentReadiness.ps1 -SourceValidationStatus passed -BaseUrl http://127.0.0.1:9999`
  - Result: Fails closed on connection failure (exit code 1).

## Boundaries & Containment

- **No Active Deployment**: The plugin remains Preview-only and disabled in the live environment. No installation, config/secret mutation, or bridge process execution occurred.
- **Strictly Process-Spawn Free**: Script contains no process spawning or file mutating commands in its executable code path.
