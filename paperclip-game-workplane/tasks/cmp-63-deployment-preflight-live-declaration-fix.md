# CMP-63: Fix deployed Direct Task preflight declaration detection

## Context

The Direct Task plugin is now deployed to the local Paperclip runtime with execution disabled. `npm run check` passes and the live plugin manifest correctly exposes:

- `apiRoutes: [{ routeKey: "direct-tasks-submit", path: "/direct-tasks/submit", method: "POST" }]`
- `jobs: [{ jobKey: "direct-task-finalizer", ... }]`
- `ui.action.register` capability

However, `scripts/Test-DirectTaskPluginDeploymentReadiness.ps1 -SourceValidationStatus passed` reports:

- `liveDirectTaskApiRoutePresent: False`
- `liveDirectTaskJobPresent: False`

This is a false negative caused by reading obsolete declaration shapes (for example `api.routes` / `key`) rather than the installed Paperclip manifest shape (`apiRoutes` / `routeKey`, `jobs` / `jobKey`).

## Objective

Correct the read-only deployment preflight so it accurately recognizes the deployed Direct Task API route and finalizer job, without weakening any read-only or fail-closed safety boundaries.

## Requirements

1. Modify only the preflight script and its focused verification/documentation as needed. Do not alter `02-final-operating-model-ko.md`.
2. Support the actual live manifest declaration shape above. Keep compatibility with any previously supported safe shape if it is inexpensive and clear.
3. Ensure source and live route/job checks use the correct route and job identifiers:
   - route key: `direct-tasks-submit`
   - route path: `/direct-tasks/submit`
   - job key: `direct-task-finalizer`
4. Preserve strict read-only behavior: no process spawning, plugin reload/install, POST/PATCH/PUT/DELETE, file writes, secret resolution, or bridge process start.
5. Extend or correct `-TestMode` assertions so a matching live manifest reports both fields `True`, while missing/malformed declarations report `False` and remain activation-blocking when appropriate.
6. Run the focused test mode, `npm run check` in `paperclip-memory-plugin`, and the live read-only preflight with `-SourceValidationStatus passed`.
7. Keep the Direct Task bridge unconfigured and `enableDirectTaskLaunch` disabled. Do not create issues through the newly deployed UI, do not start Agy through the bridge, and do not assign or wake Paperclip-managed agents.

## Acceptance

The live read-only preflight reports:

- `sourceReady: True`
- `livePreviewOnly: False`
- `capabilityEscalationRequired: False`
- `liveDirectTaskApiRoutePresent: True`
- `liveDirectTaskJobPresent: True`
- `liveDirectTaskActionPresent: True`
- `bridgeUnconfigured: True`
- `activationBlocked: True`

Summarize changed files and verification in the task output.
