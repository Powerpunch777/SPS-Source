# CMP-62: Deployment Preflight Strict Read-Only Correction

## Context

CTO review found two violations/gaps in `scripts/Test-DirectTaskPluginDeploymentReadiness.ps1` from CMP-61:

1. It uses `Start-Process cmd.exe /c npm run check`, which violates the stated rule that the read-only preflight itself must not spawn processes.
2. If the live-runs GET check fails, it silently reports zero active runs, which is not fail-closed.

The live runtime remains Preview-only and disabled. Correct the preflight source only. Do not install/reload/configure/start anything.

## Required Corrections

1. Separate source validation from the read-only preflight process.
   - Remove `Start-Process`, `cmd.exe`, `npm`, `npx`, shell invocation, and every process-spawn mechanism from the preflight script.
   - Add an explicit source-validation input, for example a `-SourceValidationStatus passed|failed|not_run` parameter. The caller must run `npm run check` externally, then pass its result to the preflight.
   - The preflight reports `sourceReady=true` only for `passed`; `failed` is unsafe/nonzero; `not_run` is a clearly blocked/not-ready status without pretending source validation passed.
   - Update docs with the two-command invocation order.

2. Make live runtime checks fail closed.
   - If GET `/api/companies/{companyId}/live-runs` fails or returns an unrecognized shape, record `liveRunsCheck="unavailable"`, set activation blocked, and do not claim no runs exist. Treat this as unsafe/nonzero unless in explicit hermetic TestMode.
   - Add explicit structured fields for `missingSourceCapabilities`, `sourceDirectTaskApiRoutes`, `sourceDirectTaskJobs`, `sourceActionRegistered`, `liveDirectTaskApiRoutePresent`, `liveDirectTaskJobPresent`, `liveDirectTaskActionPresent`, and `liveRunsCheck`.
   - The current expected live state should accurately be: source validation passed (provided by caller), live Preview-only, missing source capabilities, no live direct-task route/job/action, bridge unconfigured, active runs check successful with zero results, activation blocked, authorization required.
   - Do not read any secret/config values.

3. Strengthen `-TestMode` self-check.
   - Prove no mutating HTTP verbs, file writes, bridge process creation, or generic process-spawn mechanism (`Start-Process`, `cmd.exe`, `npm`, `npx`, `pwsh`/`powershell` launch) exists in the preflight source.
   - Add hermetic cases for source validation passed/failed/not-run and live-runs GET unavailable.

4. Execute `npm run check` externally in `paperclip-memory-plugin`, then run the corrected preflight with its status explicitly passed and verify its real local output. Update the CMP-61 log/README/fit/audit or add a concise correction log after 51.

## Boundaries

- No plugin install/reinstall/reload, config or secret mutation/read, bridge config/process, job/audit file, real bridge/agy run, issue write, agent wakeup, memory promotion, or edit to `02-final-operating-model-ko.md`.

## Completion Report

List changed files, exact external validation/preflight commands and results, plus confirmation that activation is blocked pending explicit authorization. Include `## Close Summary`.
