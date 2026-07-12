# CMP-58: Direct Task Plugin Bridge Job-ID Contract

## Context

The source-only Direct Task plugin now has correct feature-flag/secret ordering (`CMP-57`), but CTO review found that a successful bridge submit currently accepts any non-empty `jobId`. The local Direct Task Bridge itself generates IDs in the exact form `job-` followed by 32 lowercase hexadecimal characters. The plugin must enforce the same contract before it persists a job, creates marker text, or polls status.

No live plugin install/reload/configuration, secret, bridge process, or browser work is permitted. The installed Paperclip plugin remains Preview-only and the feature remains disabled.

## Required Work

1. Introduce one clear bridge job-id validator in `paperclip-memory-plugin/dist/worker.js` matching exactly `^job-[a-f0-9]{32}$`.
   - Use it for successful submit responses before state persistence. A malformed ID is an invalid bridge response: leave the unassigned Task Room cancelled, with a bounded generic comment and no active state.
   - Validate persisted `activeJob.jobId` before using it in marker construction or status URL paths. An invalid/corrupt record must fail closed to a bounded blocked Task Room and clear state without interpolating the untrusted ID into a regex, URL, comment, log, or response.
   - Keep marker construction independent of untrusted text where possible. Preserve outcome-encoded retry markers for valid IDs.
   - Preserve all CMP-56/57 rules: disabled/invalid routes must not resolve secrets, external calls only go to strict `http://127.0.0.1:<port>/`, no raw upstream errors, namespaced state, no assignment/wakeup, and outcome-marker retry convergence.

2. Update the hermetic test suite:
   - Replace mock "valid" job IDs with valid bridge-format IDs everywhere.
   - Add a submit response test for an invalid but non-empty job ID; it must cancel the created unassigned issue, write no active state, expose no raw bridge text, and never schedule/poll a job.
   - Add a corrupt persisted active-state job ID test; it must block/clear safely with bounded generic output and no URL construction, fetch, or secret resolution.
   - Retain all zero-secret-resolution and real partial-update retry assertions.

3. Run `npm run check` in `paperclip-memory-plugin`. Update the direct-task hardening log and fit/audit text to state the exact job-id contract.

## Boundaries

- Source-only; no plugin install/reinstall or live Paperclip data/config mutation.
- No Direct Task Bridge configuration, secret, jobs/audit artifact, daemon, or real plugin-originated agy invocation.
- Do not edit `02-final-operating-model-ko.md`.
- Do not enable or promote memory candidates.
- Do not assign or wake agents.

## Completion Report

List changed files, exact validation result, and confirm live runtime remains Preview-only and disabled. Include `## Close Summary`.
