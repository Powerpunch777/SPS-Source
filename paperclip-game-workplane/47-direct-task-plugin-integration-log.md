# 47. Direct Task Plugin Integration (CMP-55)

## Objective
Implement the local plugin source portion of the Direct Task integration: a board-authenticated submit route plus a scheduled finalizer job, while keeping the live Paperclip plugin in its current **Preview-only** manifest/configuration.

## Architectural Changes & Implementation Details

1. **Manifest Updates (`paperclip-memory-plugin/dist/manifest.js`)**:
   - Registered the API route `POST /direct-tasks/submit` with `auth: board` and resolved the company from the required `companyId` body field.
   - Declared the scheduled job `direct-task-finalizer` on a 1-minute cadence (`*/1 * * * *`).
   - Added configuration fields: `enableDirectTaskLaunch` (default: false), `directBridgeUrl`, and `directBridgeSecretRef`.
   - Included all required future capabilities: `issues.create`, `issues.update`, `issue.comments.create`, `plugin.state.read`, `plugin.state.write`, `jobs.schedule`, `api.routes.register`, `secrets.read-ref`, and `projects.read`.

2. **Worker Integration (`paperclip-memory-plugin/dist/worker.js`)**:
   - Implemented `onApiRequest` routing for `direct-tasks-submit` to validate request payloads (company/project IDs, allowlisted role, title/description lengths, relative uproject filename format, and strict idempotency key format).
   - Validated that the project belongs to the company using the SDK (`ctx.projects.get`).
   - Gated the endpoint behind `enableDirectTaskLaunch` config value to fail-closed immediately.
   - Validated that `directBridgeUrl` is a strict loopback address (localhost/127.0.0.1/::1) before any writes.
   - Resolved the bridge token securely via `ctx.secrets.resolve(directBridgeSecretRef)` and ensured the token text is never logged, stored, or returned.
   - Created an unassigned Paperclip issue (status `"todo"`) with origin metadata (`originKind` and `originId` as idempotency key) for tracking.
   - Submitted normalized payload to Direct Task Bridge using Node standard `fetch` over loopback.
   - Stored exactly one active job record in the plugin instance state (`stateKey: "active-job"`) to prevent duplicate issue/job pairs.
   - Handled dispatch/network failures gracefully by posting a comment on the unassigned issue, marking it `"cancelled"`, and clearing the active job lock.
   - Registered `direct-task-finalizer` job which polls DTB status over loopback, creates a final Close Summary comment, updates the issue status (`"done"` for success, `"blocked"` for failure), and clears the active job lock. Finalization is idempotent and never assigns/wakes an agent.

3. **Hermetic Test Suite (`paperclip-memory-plugin/scripts/verify-direct-tasks.mjs`)**:
   - Created a mock-based test suite that verifies disabled config handling, invalid inputs/URL rejection, valid submission issue/payload generation, duplicate idempotency key deduplication, successful/failed finalizer status resolution, idempotency of finalizer runs, lack of agent wakeups/assignments, and strict secrecy of resolved tokens.
   - Integrated the test suite into the package `npm run check` pipeline.

## Non-Negotiable Operational Constraints Enforced
* **Source-Only Implementation**: The source code has been modified and successfully verified, but **no plugin install/reinstall or config alteration has been performed**. The live runtime remains Preview-only.
* **Feature Disabled**: The `enableDirectTaskLaunch` flag defaults to `false` in manifest configuration, and is checked first-thing in the routes.
* **No Real Bridge / Config Process**: No `direct-task-bridge/config.local.json` was created or updated, no bridge process was started, and no real agy executions were triggered.
* **No Sidecar Memory Mutation**: Memory candidates are untouched, and no managed candidates were promoted.

## Verification Performed
- Ran `npm run check` in `paperclip-memory-plugin/` directory, confirming that all existing (view verification and lifecycle hooks) and new (direct tasks integration) automated tests pass successfully.
