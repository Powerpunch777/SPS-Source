# 48. Direct Task Plugin Hardening Corrections (CMP-56)

## Objective
Harden the source-only Paperclip memory plugin integration for the Direct Task Bridge. Ensure strict validation of the bridge endpoint URL and secrets, protect token confidentiality across all outputs, enforce correct API and finalizer response shapes, and introduce retry-safe finalization convergence using deterministic comment markers and state namespacing. The runtime plugin remains strictly Preview-only and disabled.

## Hardening Corrections & Implementation Details

1. **SDK Secret-Reference Contract**:
   - Updated the `directBridgeSecretRef` manifest schema definition (`paperclip-memory-plugin/dist/manifest.js`) to be a `string` config type instead of an `object`.
   - Validated that `directBridgeSecretRef` is a non-empty string in the worker (`paperclip-memory-plugin/dist/worker.js`) before calling `ctx.secrets.resolve()`.
   - Updated all hermetic tests in `scripts/verify-direct-tasks.mjs` to use string secret references and assert that the correct string is passed to `secrets.resolve`.

2. **Tightened Bridge Routing**:
   - Implemented strict validation for `directBridgeUrl`. It accepts only `http://127.0.0.1:<port>` URLs.
   - It explicitly rejects hostname aliases (e.g. `localhost`), IPv6 hosts (e.g. `::1`), credentials/userinfo, query parameters, hashes, non-HTTP schemes (e.g. `https`), missing or invalid explicit ports, and non-root paths.
   - This validation is performed first-thing in the routes before any state/issue writes or secret resolution.

3. **Confidentiality & Error Sanitization**:
   - Introduced a `redactToken` helper function in the worker to search and replace any occurrences of the resolved bridge secret with `[REDACTED]`.
   - Applied this redaction to all comments posted to the Task Room, API response bodies, state writes, and logger messages/stack traces.
   - Replaced raw exception and upstream response body texts with generic, bounded user-facing error messages in case of submit or finalizer failures.
   - Bound all comments to a maximum of 4000 characters.

4. **Company Mismatch Rejection**:
   - Enforced validation to compare the body `companyId` with the host-resolved `input.companyId`, rejecting mismatches with a `400 Company ID mismatch` API response before any side effects.

5. **Submit Response Validation & Job-ID Contract**:
   - Implemented a dedicated job-id validator function enforcing the exact contract `^job-[a-f0-9]{32}$` (representing "job-" followed by 32 lowercase hexadecimal characters).
   - Validated that a successful bridge submit response contains a `jobId` matching this exact contract, alongside a supported nonterminal status (`"running"`, `"pending"`, or `"queued"`).
   - Any malformed or invalid response (such as an invalid format `jobId`) fails closed, leaving the unassigned Task Room issue `"cancelled"` with a bounded generic comment and deleting the active job state.

6. **Retry-Safe Finalization & Convergence (CMP-57 & CMP-58 Hardened)**:
   - Namespaced all Direct Task Bridge state keys under the namespace `"direct-task-bridge"` to prevent collisions.
   - Embedded a deterministic, unique marker containing the explicit terminal outcome (`done` or `blocked`) into terminal comments (format: `<!-- direct-task-bridge-marker: <jobId> - <outcome> -->`).
   - Validates the persisted `activeJob.jobId` against the exact `^job-[a-f0-9]{32}$` contract before using it in marker construction or status URL paths. An invalid/corrupt record fails closed immediately (transitions the Task Room to `"blocked"`, posts a bounded generic comment, and deletes active state) without interpolating the untrusted/corrupt ID into any regex, URL, comment, log, or response.
   - Checks existing issue comments for the terminal marker at the very start of `handleDirectTaskFinalizer`, prior to any bridge URL validation or secret resolution. If found, it immediately converges by updating the status and clearing state without resolving secrets or contacting the bridge.
   - Strict transition order is maintained: find/post marker-bearing comment -> update issue status -> clear state.
   - Validated bridge status response shape. Mismatched or malformed responses fail closed to a `"blocked"` issue status and clear the state.

## Non-Negotiable Operational Boundaries Enforced
* **Source-Only Status**: The integration is verified only in the local source tree and its hermetic tests. **No plugin installation or configuration change was performed in the live environment.**
* **Preview-Only and Disabled**: The `enableDirectTaskLaunch` flag remains `false` by default, keeping the plugin integration disabled at runtime.
* **No Real Bridge Execution**: No configuration files, credentials, bridge daemons, or agy subprocesses were run or created in this change.

## Verification Performed
- Ran `npm run check` in the `paperclip-memory-plugin` directory.
- All 13 integration tests in the test suite (`scripts/verify-direct-tasks.mjs`) passed successfully:
  - Disabled config has zero side effects (verifies `secrets.resolve` is called 0 times)
  - Invalid input/config/URL is rejected before writes (verifies `secrets.resolve` is called 0 times)
  - Host-resolved companyId mismatch is rejected (verifies `secrets.resolve` is called 0 times)
  - Valid submit produces one unassigned issue and one bridge payload (verifies `secrets.resolve` is called exactly 1 time with valid bridge-format job IDs)
  - Duplicate idempotency does not duplicate work (verifies `secrets.resolve` is called 0 times on duplicate hit)
  - Finalizer paths are idempotent and preserve boundaries (verifies `secrets.resolve` is called exactly once per active poll, and 0 times on terminal status check)
  - Invalid bridge success response fails closed
  - Secret text remains completely hidden
  - Finalizer partial-update retry produces exactly one marker-bearing comment and converges (simulates real database update failure by throwing on the first `issues.update` call; verifies the retry converges using the outcome-encoded marker with 0 bridge fetches or secret resolutions)
  - Malformed or mismatched bridge status cannot mark done
  - Generic outer errors never expose a known secret value (verifies that any raw exceptions caught by onApiRequest or jobs wrapper return generic bounded message and do not log/expose secret tokens)
  - Submit response with invalid but non-empty job ID is rejected (asserts issue is cancelled, no active state is written, and no raw job ID is leaked)
  - Corrupt persisted active-state job ID fails closed without fetch or secret resolution (asserts issue is blocked/cleared safely with bounded generic output and zero URL construction, fetch, or secret resolution)
