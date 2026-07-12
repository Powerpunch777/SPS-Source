# Direct Task Deployment Preflight (CMP-61) Log

## Objective
Establish a read-only Direct Task deployment preflight readiness check that validates source readiness, checks live runtime status, capability escalations, and ensures no unauthorized bridge config or processes are active. Also, tighten client-side UI route regex validations to prevent route navigation injection.

## Implementation Details

1. **Read-Only Preflight Checker Script**:
   - Created `scripts/Test-DirectTaskPluginDeploymentReadiness.ps1` to perform preflight checks strictly without side effects:
     - No mutating HTTP verbs (POST/PATCH/PUT/DELETE).
     - No plugin installation, reinstallation, or reloading.
     - No configuration or filesystem writes.
     - No secrets resolution or Paperclip secret reading.
     - No bridge daemon/process spawning.
   - Script performs the following checks in default mode:
     - Runs the local source validation (`npm run check` via `cmd.exe /c` wrapper) and records the exit status.
     - Compares local manifest capabilities, API routes, and jobs against the live Paperclip plugin record (via GET request), highlighting any capability escalations and missing features.
     - Verifies that no deployment activation artifacts exist in `direct-task-bridge/` (specifically `config.local.json`, `jobs.json`, `audit.log`, or `job-results` files).
     - Verifies that no active `direct-task-bridge.mjs` process is running.
     - Queries Paperclip GET `/api/companies/$CompanyId/live-runs` to confirm no active runs exist.
     - Returns a structured object containing: `sourceReady`, `livePreviewOnly`, `capabilityEscalationRequired`, `bridgeUnconfigured`, `activationBlocked`, and `requiresExplicitDeploymentAuthorization`, along with diagnostics.
     - Exits with non-zero code on unsafe state or source check failures.

2. **Hermetic Script Self-Test**:
   - Implemented a `-TestMode` switch that stubs all filesystem, process, and API operations.
   - Includes safety checks that parse the script's own content (using concatenated string matching to avoid self-match) to assert that no mutating cmdlets (e.g. `Set-Content`, `Out-File`, `WriteAllText`) or mutating HTTP methods exist in the file, proving it is strictly read-only.
   - Validates that `-TestMode` produces the correct structured readiness object.

3. **Tightened UI Route Validation**:
   - Tightened path validations in `ProjectDirectTaskPreviewTabElement` in `src/ui/MemoryTab.jsx` before building same-origin links.
   - Restricts link construction to cases where `pluginContext.companyPrefix` matches `^[A-Za-z0-9_-]{1,80}$` and the issue identifier matches `^[A-Za-z0-9_-]{1,120}$`.
   - Continues using `encodeURIComponent` and omits the link if validation fails or parameters are missing.
   - Extended the source/UI contract checks in `verify-direct-tasks.mjs` to assert that these regex validation checks exist in `MemoryTab.jsx`.

## Verification Results

- **Source Checks (`npm run check`)**: Executed successfully, confirming all 13 direct task integration tests, managed agent lifecycle probe tests, and UI contract tests passed.
- **Preflight Test Mode**: Running `Test-DirectTaskPluginDeploymentReadiness.ps1 -TestMode` successfully verified all safety assertions and mocked outputs.
- **Live Local Preflight**: Executed `Test-DirectTaskPluginDeploymentReadiness.ps1 -AsMarkdown` against the live local Preview-only environment:
  - Verified source code check passed successfully.
  - Verified live plugin is Preview-only, with capability escalation required (source uses 10 extra capabilities).
  - Confirmed no bridge daemon is running and no configuration file (`config.local.json`) exists.
  - Confirmed no active Paperclip runs exist.
  - Reported status: `READY` (meaning ready source + blocked activation, which is safe).

## Boundaries & Containment

- **No Deployment Occurred**: The live environment remains Preview-only and disabled. The final enable/install step remains blocked and requires explicit authorization plus configured local bridge credentials/workspace.
- **No Side Effects**: The preflight check is strictly read-only. No configurations were created or written, no bridge processes were spawned, no secrets were resolved, and no agent wakeups occurred.
