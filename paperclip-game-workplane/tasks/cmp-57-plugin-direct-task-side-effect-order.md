# CMP-57: Direct Task Plugin Side-Effect Order and Retry-Test Correction

## Context

`CMP-56` hardened the source-only Direct Task plugin integration but CTO review found a remaining contract violation in `paperclip-memory-plugin/dist/worker.js`:

- `onApiRequest` resolves the bridge secret before `handleDirectTaskSubmit` checks `enableDirectTaskLaunch` and validates the request/bridge URL.
- The scheduled-job registration wrapper similarly resolves the secret before `handleDirectTaskFinalizer` checks the disabled flag.

This breaks the intended fail-closed rule: when disabled or when request/config validation fails, there must be **zero** secret resolution, network access, issue/state write, or bridge effect. The installed Paperclip plugin must remain Preview-only. No live installation/reload/config/secret/bridge process is permitted.

## Required Work

1. Refactor the source worker so the only bridge secret resolution is inside the successful, validated paths of `handleDirectTaskSubmit` and `handleDirectTaskFinalizer`.
   - Do not pre-resolve a secret in `onApiRequest` or the job-registration wrapper merely to redact outer errors.
   - The disabled submit path, disabled finalizer path, invalid input, company mismatch, invalid URL, and invalid/missing secret reference must make zero calls to `ctx.secrets.resolve`.
   - Keep raw errors out of API responses and logger fields. The outer catch must return/log a generic bounded internal error without needing a resolved token.
   - Preserve string secret refs, strict `http://127.0.0.1:<explicit-port>/` validation, namespaced state, unassigned issue creation, no wakeups, and all existing boundaries.

2. Strengthen finalizer marker semantics and tests.
   - Keep deterministic terminal-comment markers keyed by bridge job id, but make the stored marker unambiguously encode the terminal outcome (`done` or `blocked`) rather than inferring it from arbitrary summary text.
   - On retry after comment creation but before issue status update, converge using the marker without contacting the bridge and without adding a second comment.
   - The test must simulate a real partial failure by making the first `issues.update` after terminal comment creation throw. Do not merely reset a previously completed issue in the test.

3. Extend `scripts/verify-direct-tasks.mjs` to prove:
   - disabled submit and disabled finalizer call `secrets.resolve` zero times;
   - each invalid input / company mismatch / invalid URL branch calls `secrets.resolve` zero times;
   - the valid path resolves the exact configured string ref once per handler invocation;
   - the simulated post-comment update failure results in exactly one terminal comment, then retry ends in the marker's declared terminal status with no bridge fetch;
   - generic outer errors never expose a known secret value.

4. Run `npm run check` in `paperclip-memory-plugin` and update the source-only hardening log/README/fit audit as needed. Correct any stale claim that the old test was a real partial-update failure.

## Non-Negotiable Boundaries

- Do not install/reinstall the Paperclip plugin, mutate the live plugin record, or use the browser UI.
- Do not create a bridge config, bridge secret, bridge jobs/audit file, or start a bridge daemon.
- Do not run a plugin-originated agy process.
- Do not edit `02-final-operating-model-ko.md`.
- Do not enable memory extraction or promote memory candidates.
- Do not assign or wake any Paperclip agent.

## Completion Report

Report the exact changed files, validation command/result, and confirm the live runtime remains Preview-only and disabled. Include `## Close Summary`.
