# CMP-61: Read-Only Direct Task Deployment Preflight

## Context

The source-only Direct Task plugin path is complete through CMP-60: board-user action context, hardened submit/finalizer, Task Room UI, strict bridge contracts, and retry safety. The installed runtime plugin remains Preview-only, source has stronger capabilities, `enableDirectTaskLaunch` is disabled by default, and no Direct Task Bridge configuration/secret/daemon exists.

Before any future reinstall or enablement, create a **read-only deployment preflight** that makes the state and required authorization obvious. Do not install/reload/configure/enable anything in this task.

Also apply one small UI correction: a host `companyPrefix` must match a conservative same-origin path segment pattern before it can be used for the Task Room link; non-empty alone is insufficient.

## Required Implementation

1. Add `scripts/Test-DirectTaskPluginDeploymentReadiness.ps1`.
   - Read-only only. No HTTP POST/PATCH/PUT/DELETE, no plugin reinstall/reload, no config writes, no process spawn, no secrets resolution/read, and no bridge invocation.
   - Parameters: SPS base URL, plugin ID/key, source plugin path, and optional expected company/project IDs. Use safe defaults for this workplane where appropriate.
   - Run the existing source validation (`npm run check`) and record pass/fail.
   - Read the source manifest and live SPS plugin record via GET. Compare and report:
     - source-only capabilities absent from the live Preview-only manifest;
     - source API route/job/action support versus live absence;
     - live plugin status/package path;
     - source `enableDirectTaskLaunch` default is false.
   - Verify no deployment activation artifacts exist: no `direct-task-bridge/config.local.json`, `jobs.json`, `audit.log`, or `job-results` content; no active `direct-task-bridge.mjs` process. Do not inspect secret values or SPS secret storage.
   - Verify no active SPS run belongs to the relevant current Task Rooms/project (or report accurately if one exists; do not mutate it).
   - Output one structured object with explicit fields such as `sourceReady`, `livePreviewOnly`, `capabilityEscalationRequired`, `bridgeUnconfigured`, `activationBlocked`, and `requiresExplicitDeploymentAuthorization`. The expected state today is ready source + blocked activation, not failure.
   - Fail only on unsafe/unexpected active deployment state or source validation failure; provide non-secret diagnostic codes/messages.

2. Add a small hermetic PowerShell test or test mode for the preflight that stubs GET/npm/process/filesystem checks and proves it cannot use mutating HTTP verbs or create config/process artifacts.

3. Tighten `ProjectDirectTaskPreviewTabElement` route validation:
   - Only build the link when `pluginContext.companyPrefix` matches `^[A-Za-z0-9_-]{1,80}$` and identifier matches the expected safe issue identifier pattern (for example `^[A-Za-z0-9_-]{1,120}$`).
   - Continue `encodeURIComponent` usage and omit the link for invalid/missing values.
   - Extend existing source/UI contract checks to prove the validation exists.

4. Run the new preflight against the live local Preview-only runtime and `npm run check` in `sps-memory`.

5. Create a new numbered log after `50-...`, update README/fit checklist/operating-model audit, and state plainly: no deployment occurred; the final enable/install step requires explicit authorization plus configured local bridge credentials/workspace.

## Non-Negotiable Boundaries

- No SPS plugin install/reinstall/reload, config mutation, secret creation/read, bridge config, bridge daemon/process, jobs/audit artifacts, real bridge call, or agy execution.
- No issue/comment/status write or agent assignment/wakeup.
- Do not edit `02-final-operating-model-ko.md` or promote memory candidates.

## Completion Report

List changed files, test/preflight results, exact live status, capability escalation summary, and confirmation that activation is blocked pending explicit authorization. Include `## Close Summary`.
