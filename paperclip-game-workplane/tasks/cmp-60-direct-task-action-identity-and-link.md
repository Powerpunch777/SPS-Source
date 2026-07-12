# CMP-60: Direct Task Action Identity and Task-Link Correction

## Context

`CMP-59` added a source-only Project Hub action UI. CTO review found two correctness gaps before the source can be considered ready for installation:

1. The action accepts `actor.type === "user"` without requiring an authenticated non-empty user id.
2. The worker returns `taskHref: "/issues/<issueId>"`, but Paperclip's actual Task Room route is company-prefix based (for example `/<companyPrefix>/issues/<identifier>`). The worker action context has company ID but not the host UI's `companyPrefix`, so it must not manufacture a route from an issue UUID.

The plugin must remain source-only and live runtime must remain Preview-only/disabled. Do not install/reload/update live plugin or configuration.

## Required Work

1. Tighten action identity.
   - `direct-task-submit` must require action context actor type `user`, a non-empty authenticated `actor.userId`, and a non-empty `actionCtx.companyId`.
   - Missing user id must return the same generic structured refusal and make zero calls to secret resolver, issue/state APIs, bridge fetch, or wake APIs.
   - Update every successful action harness case to provide the correct authenticated user-id field expected by the SDK test harness.

2. Correct Task Room navigation without adding a company-read capability.
   - Worker action must return only safe identifiers/status. It may return `taskHref: null` or omit it; it must not return `/issues/<uuid>` and must not construct a company route from untrusted client text.
   - In `ProjectDirectTaskPreviewTabElement`, use the immutable host `pluginContext.companyPrefix` and action response `identifier` to build an internal same-origin route `/${encodeURIComponent(companyPrefix)}/issues/${encodeURIComponent(identifier)}` only when both values are present and valid.
   - If the host prefix is missing/invalid, show the successful issue identifier but no broken link. Do not use a hard-coded company prefix, an external URL, or a UUID-based route.
   - Escape rendered values and preserve the existing preview -> explicit click -> action sequence, idempotency reuse, error states, and no loopback browser access.

3. Tests.
   - Add a missing-user-id action refusal test with zero side effects.
   - Assert successful action response has no UUID-route `taskHref`.
   - Add a source/UI contract test for companyPrefix + `encodeURIComponent` route construction and absence of `/issues/${body.issueId}`/hardcoded `CMP` route patterns.
   - Keep all prior action, secret, idempotency, and state-safety tests.

4. Run `npm run check`. Add a concise numbered hardening log after `49-...` and update README/fit/audit text.

## Boundaries

- No live plugin installation/reinstallation/reload/config/secret/bridge daemon/jobs/audit file.
- No real bridge or agy execution.
- No agent assignment/wakeup, memory promotion, or edit to `02-final-operating-model-ko.md`.

## Completion Report

List changed files, verification result, and confirm the live runtime is still Preview-only and disabled. Include `## Close Summary`.
