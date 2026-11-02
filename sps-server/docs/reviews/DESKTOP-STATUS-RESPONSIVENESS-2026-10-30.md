# Desktop Status And Optional npm Inspection

Date: 2026-10-30. Independent responsiveness defect, not a claim that the
historical CDP timeout's exact cause has been proven.

## Reproduction

`desktop:status` awaits `refreshOwnerRuntimeStatus()` before returning its
snapshot. Previously an initial `checking` plugin-runtime status made that
read start and await `inspectSpsPluginRuntime()`. On Windows the inspector can
try two PATH names and up to three standard installation candidates in
sequence, each with a five-second subprocess timeout. A status request could
therefore wait on an optional npm dependency for longer than the unchanged
ten-second CDP observation limit. Repeated polls could also start duplicate
inspections while another probe was pending.

The new test loads the actual Main function body and holds the npm response
unresolved. Before the fix its status-response assertion failed: status had
not returned while the optional probe was held. The test resolves its fixture
promise in cleanup; no real npm process or real profile is used by that unit
test.

## Correction

- Status reads use the last plugin-runtime snapshot. They neither start nor
  await an optional npm subprocess. A fresh profile says `not-inspected`, not
  that a nonexistent inspection is running or that npm is ready.
- Host initialization and the explicit runtime inspection still perform and
  await the real check. Concurrent explicit checks share one pending result.
- A genuine probe reports `checking` while pending, `ready` only on success,
  or the existing `local-folder-only` fallback when unavailable. Unexpected
  errors do not expose private environment diagnostics in the public status.
- No new background npm process is spawned by polling, and no shutdown, Core
  health, authentication, lease or permission check is bypassed.
- The existing Host/Memory health reads and runtime-pack snapshot remain in
  place. Their own responsiveness is not certified by this npm-specific fix.
- No CDP timeout was increased and no failed run was relabeled as passing.

## Local Verification

```powershell
node --test test/desktop-status-runtime.test.mjs test/plugin-runtime.test.mjs test/core-settings-main-contract.test.mjs
node scripts/smoke-core-settings-desktop.mjs
$env:SPS_DESKTOP_E2E_SOURCE='1'
node scripts/smoke-workspace-surfaces-desktop.mjs --runtime-discovery --owned-job-cleanup-pending
```

The 13 focused tests passed. Actual isolated Core Settings opened and its Quit
button completed a natural Main shutdown. The actual source No-AI Workspace
scenario also passed: empty Agent-free entry, explicit reference-plugin
installation, A/B data and capability isolation, simulated Runtime observation,
loopback-only fake model request/cancellation, manual Workspace Job, persisted
state through restart, and independent recovery Settings. All three spawned
Mains exited naturally and all six tracked output streams ended. The caller
observed the required exit 76; external whole-Job qualification is still a CI
responsibility. No real provider, account, CLI command or user data was used.

The subsequent full Desktop command `node --test test/*.test.mjs` completed
with 1564 total tests: 1562 passed, two environment-dependent skips, zero failed.

The `377b4f0` remote runs predate this correction. Any success on them is
evidence only for that commit. A new exact-HEAD CI run is required after the
correction is committed; the old intermittent Host-creation CDP failure remains
historically unattributed rather than being retroactively explained away.
