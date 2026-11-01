# Workspace Agent Session Ensure

2026-11-02. Development evidence for Core `83b9bd62918abe0ba8087945a89631ca27c3b689`
and public SDK `bfd81cdae374ad5ac5e7e621ab99b6af8affee7e` (unreleased source API,
package0.11.0). Not remote CI, app acceptance or Core completion.

## Contract

The dedicated Workspace worker now exposes six scoped Agent Session methods:
`ensure`, `create`, `list`, `sendMessage`, `getRun`, and `cancel`. `ensure` is the
explicit `agents.sessions.ensure` RPC. Both `ensure` and `create` reuse the
existing `agent.sessions.create` capability; the other methods retain their
existing individual capabilities. Every call remains bound to the exact live
Host-issued invocation, Workspace, Plugin and Agent. The worker cannot provide
or override the authority callback. An older Host that does not know the RPC
must reject it; it must not emulate it with `create` or `list`.

Session keys use `plugin:<pluginKey>:session:<suffix>`, require a non-empty
suffix and are limited to 1,024 UTF-8 bytes. `ensure` requires a stable task key.
Its compatibility `context` is optional; an issue is not required. Supplied
project, project-workspace and issue references must resolve within the same
Host scope and agree on their project.

`expectedSessionId` is an optional UUID, canonicalized to lowercase. When
provided, it must match the existing row for that exact caller-owned key. A
missing row or mismatched ID fails before insertion; it never silently creates
a replacement for a known ID. Without an expected ID, a missing key creates a
row and returns `{ sessionId, created: true }`. A matching existing session
returns `created: false` only while active, open, on the current Agent adapter,
and with the exact normalized context. Multiple matching rows, a retained
closed row, adapter change or context mismatch fail closed for explicit review.

Both `create` and `ensure` lock the parent Agent row inside their creation
transaction, then select the current adapter from that locked row before
inserting. This serializes adapter selection against concurrent changes and
prevents a delayed legacy adapter read from inserting an old-adapter twin.
PostgreSQL documents that `FOR UPDATE` locks the selected row against competing
writers/lockers until transaction end ([Explicit Locking, Row-Level Locks](https://www.postgresql.org/docs/current/explicit-locking.html)).

The expected ID is a scoped identity check, not a lease or permanent tombstone.
Legacy general-Host close/reset may still delete the row and release its key;
after that, an ensure without `expectedSessionId` may create a new row. A
retained closed row is rejected. Send must recheck the exact ID at use because
concurrent close may retire it after ensure returns. This does not add message
deduplication, durable request receipts or exactly-once provider execution.
Existing `getRun`, `cancel`, bounded output, Host raw-session-feed and No-AI
boundaries remain unchanged. This contract does not assert provider readiness
or actual AI execution.

## Development Verification

The current working-tree validation reports a final 13-file Core focused
selection at 207/207, all 30 Core workspace typechecks and builds passing, and
SDK validation at 187/187. The final parent13-file rerun after fixture and
memory-harness validation alignment passed207/207 again; private SDK typecheck
also passed. These are local results, not remote CI or app acceptance.

The initial isolated PostgreSQL run failed at42/48 because the extracted service
used table/type references missing from the compatibility facade. Those exports
were corrected; this was not six missing RPC methods.
During the same development work, a delayed legacy Agent read could race an
adapter change and create a session with the stale adapter. A regression now
covers that case, and creation reads the adapter under the parent Agent row
lock. The initial PostgreSQL failure remains a failure; the later focused
207/207 result is recorded separately, not substituted for it.

The prior [Workspace Agent Session review](WORKSPACE-AGENT-SESSIONS-2026-11-02.md)
records the earlier five-method surface and its own tuple-specific results; it
does not prove this new `ensure` contract. Earlier Source Desktop evidence on a
different pinned tuple is not evidence that the current uncommitted ensure RPC
works in the app. No new CI result or app run is claimed here.

Builder `508033341b9498675ab6544f1327f53a1952df8c` pins the new public SDK;
Node24 `npm run check` passed48/48 plus SDK validate/test. Only dependency and
contract documentation changed, not Lead session initialization or AI Send.
The parent read-only review found no additional security defect, but this is
not independent GitHub approval. Three Luna follow-up tasks reached quota after
some file edits; the parent inspected those edits and reran their focused tests.

Exact Core command (Node24.22.1 on PATH):

```powershell
node node_modules/vitest/vitest.mjs run server/src/__tests__/plugin-agent-session-context.test.ts server/src/__tests__/sps-agent-session-output.test.ts server/src/__tests__/sps-workspace-agent-sessions.test.ts server/src/__tests__/sps-workspace-agent-session-invocation.test.ts server/src/__tests__/sps-workspace-plugin-host.test.ts server/src/__tests__/plugin-worker-manager.test.ts server/src/__tests__/sps-workspace-plugin-workers.test.ts server/src/__tests__/sps-workspace-plugin-process.test.ts server/src/__tests__/sps-workspace-execution-control.test.ts server/src/__tests__/sps-execution-observation.test.ts packages/plugins/sdk/tests/host-client-factory.test.ts packages/plugins/sdk/tests/testing-actions.test.ts packages/plugins/sdk/tests/worker-rpc-host.test.ts --no-file-parallelism --maxWorkers=1
```

Ignored local logs: `desktop/dist/session-ensure-parent-final-20261102.log`,
`session-ensure-final-typecheck-20261102.log`, `session-ensure-final-build-20261102.log`,
and `session-ensure-final2-sdk-tests-20261102.log`. Build warnings about existing
CSS/annotations/chunk size remain. The new operation reuses existing tables and
indexes; there is no migration or user-data conversion in this increment.

## Not Yet Complete

Durable submission/message receipts and ambiguous-send recovery remain planned,
not implemented. Builder Send remains disabled until that work is implemented
and qualified. The ID comparison is not a tombstone and the row lock does not
provide message deduplication. Physical-device and Stable acceptance remain
unproven. This note records the public-facing contract and development results;
it does not reproduce private Core source or imply that unfinished work is done.
