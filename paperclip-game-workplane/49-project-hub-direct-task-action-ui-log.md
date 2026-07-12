# Project Hub Direct Task Action UI (CMP-59) Log

## Objective
Extend the existing **Project Hub > Direct Task Preview** tab to support a user-facing action to request a Direct Task Room via the plugin action bridge, without changing the live runtime. This implementation is source-only.

## Implementation Details
1. **Worker Action Handler**:
   - Registered `direct-task-submit` action using `ctx.actions.register`.
   - Verified that only users with a valid company context can invoke this endpoint; non-user or missing-company contexts are refused immediately with no side effects.
   - Enforced host-provided `companyId` for anti-spoofing.
   - Integrated with existing `handleDirectTaskSubmit` logic and mapped responses to the structured action contract: success: `{ ok: true, issueId, identifier, jobId, status, taskHref }`, failure: `{ ok: false, code, message }`.
   - Ensured that error responses and catches never leak private bridge URLs, secrets, or raw exceptions.

2. **Frontend Preview Tab UI**:
   - Modified `ProjectDirectTaskPreviewTabElement` in `src/ui/MemoryTab.jsx` only.
   - Preserved preview functionality; displayed the "Launch Task Room" button inline *only* after a successful preview of the exact stored draft.
   - Added input/change listeners on the form fields that automatically clear the preview state and hide the launch controls if the form is edited.
   - Generated a random, compliant idempotency key upon successful preview. Reused this key for retries on the exact same draft.
   - Communicated with the backend action endpoint `/api/plugins/{pluginId}/actions/direct-task-submit` dynamically using `fetch`.
   - Bound error rendering, escaped variables using `escapeHtml`, and handled launching states.

3. **Hermetic Integration Tests**:
   - Extended `scripts/verify-direct-tasks.mjs` with 6 new tests:
     - Context validation/refusal for non-user/missing-company contexts has zero side effects.
     - Disabled valid board action returns launch disabled code with zero secret resolution/issue writes.
     - Valid board action forces companyId scope, calls existing submit path, creates exactly one unassigned issue, and returns only safe structured fields.
     - Duplicate submissions with the same idempotency key return the cached result and do not re-dispatch.
     - Action failures do not leak secrets or raw bridge error details.
     - Source/UI validation check reads and parses `MemoryTab.jsx` to confirm it calls the correct endpoint, keeps launch unavailable before preview, uses/reuses the idempotency key, and never references loopback bridge URLs or secrets.

## Verification Results
- Ran `npm run check`.
- Verified that all 18 automated tests passed successfully, including the 6 new integration and source check cases.
- Successfully built the UI bundle using `esbuild`.

## Boundaries & Containment
- The plugin is **not installed or reinstalled, feature is disabled by default, and no secret, config, or bridge process exists in the live environment**.
- No automatic launch after preview, no keyboard shortcut launch, no polling loop, and no direct browser call to `127.0.0.1`.
- Zero writes, secret resolution, network calls, state changes, or wakes on refused contexts.
