# Direct Task Identity and Task-Link Correction (CMP-60) Log

## Objective
Tighten worker action context identity validation for user submissions and correct Task Room navigation routes to prevent security flaws (spoofing, unauthenticated actions) and incorrect routes (manufactured UUID routes) in the source code of the local SPS Memory Plugin.

## Implementation Details
1. **Worker Action Identity Hardening**:
   - Updated `direct-task-submit` action registration inside `dist/worker.js` to strictly require action context `actor.type === "user"`, a non-empty authenticated `actor.userId`, and a non-empty `actionCtx.companyId`.
   - Refused contexts missing any of these authenticated fields immediately with the generic structured `forbidden` response, making zero calls to the secret resolver, issues APIs, state store, or Direct Task Bridge.

2. **Route Construction Correction**:
   - Modified worker action `direct-task-submit` return value to omit the UUID-based route and set `taskHref: null` instead.
   - Updated `ProjectDirectTaskPreviewTabElement` in `src/ui/MemoryTab.jsx` to dynamically build the same-origin route `/${encodeURIComponent(companyPrefix)}/issues/${encodeURIComponent(identifier)}` on the client using the host's immutable `pluginContext.companyPrefix` and the action response `identifier` only when both values are valid and non-empty.
   - Handled missing/invalid host prefix gracefully by displaying the successful issue identifier but rendering no broken task room link.

3. **Hermetic Verification Tests**:
   - Updated successful `performAction` harness calls in `scripts/verify-direct-tasks.mjs` to supply a mock authenticated `userId` on the actor object.
   - Added validation test cases in Test 13 ensuring empty, whitespace, null, or missing `userId` contexts are refused with the generic forbidden response, calling secrets.resolve 0 times and creating 0 issues.
   - Asserted that successful actions return `taskHref: null` (no UUID-based route).
   - Added Test 18 source/UI contract checks confirming `MemoryTab.jsx` references `companyPrefix`, uses `encodeURIComponent` on both prefix and identifier, and contains no `/issues/${body.issueId}`/hardcoded `CMP` route patterns.

## Verification Results
- Ran `npm run check`.
- Verified that all automated integration and contract validation tests passed successfully.
- Compiled the UI components successfully into the plugin bundle using `esbuild`.

## Boundaries & Containment
- The plugin remains **source-only, disabled by default, and is not installed/reinstalled/reloaded in the live SPS environment**.
- No live configuration, secrets, bridge processes, or agent runtimes were modified.
