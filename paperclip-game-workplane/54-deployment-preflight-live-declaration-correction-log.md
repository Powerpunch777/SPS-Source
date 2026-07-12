# Deployment Preflight Live Declaration Correction Log

## Objective

Correct a post-deployment false negative in the read-only Direct Task deployment preflight without changing runtime behavior or enabling execution.

## Finding

The deployed Paperclip manifest correctly used the current declaration shapes:

- `apiRoutes[{ routeKey: "direct-tasks-submit", path: "/direct-tasks/submit" }]`
- `jobs[{ jobKey: "direct-task-finalizer" }]`

The preflight originally looked for obsolete field shapes and incorrectly reported both live declarations as absent. The feature itself was present and still disabled; only the readiness report was wrong.

## Correction

`scripts\Test-DirectTaskPluginDeploymentReadiness.ps1` now recognizes both current structured declarations and the prior compatible forms:

- `apiRoutes` with `routeKey`, `path`, and optional string entries.
- Legacy `api.routes` entries with `key` or `id`.
- `jobs` with `jobKey`, and compatible `key`, `id`, or string entries.
- Legacy `api.jobs` entries.

The hermetic test mode now proves matching modern declarations, matching legacy declarations, and non-matching declarations. The script remains read-only: it does not start processes, resolve secrets, write files, reload plugins, or make mutating HTTP requests.

## Verification

- `Test-DirectTaskPluginDeploymentReadiness.ps1 -TestMode`: passed.
- `paperclip-memory-plugin` `npm run check`: passed.
- Live preflight with `-SourceValidationStatus passed`: passed.
- Live result: source ready, no capability escalation, API route present, finalizer job present, action capability present, bridge unconfigured, activation blocked.

## Runtime Boundary

This correction changes only the reliability of deployment reporting. The Direct Task plugin remains installed but disabled, and no bridge configuration, secret, execution workspace binding, issue launch, Agy bridge invocation, managed-agent wakeup, or memory promotion occurred.
