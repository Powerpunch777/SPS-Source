# Workspace Agent Session Admission and Output

Date: 2026-11-02. Development increment, not Core completion or real AI acceptance.

## Purpose and Boundary

The separate Builder v15 needs existing Agent Session services, not a new AI
server or Core-owned Lead/CTO/Worker workflow. This increment connects the five
existing session capabilities to the dedicated Workspace worker and adds an
optional bounded answer field. The Builder's send control remains unavailable
until durable session recovery and message deduplication are implemented and
qualified. No public Marketplace or deferred Native feature is added.

## Implemented Contract

- Workspace calls allow only create/list/sendMessage/getRun/cancel, under the
  existing individual capabilities. Close and global Agent mutations remain
  unavailable. Worker input cannot supply a trusted authority callback.
- The actual manager captures its Host-issued invocation and supplies a
  process-local liveness callback. The scoped service binds Workspace/plugin
  ownership through AsyncLocalStorage and invalidates the scope after the nested
  call. Missing, foreign, stale and detached invocations are rejected.
- Session services recheck authority around awaited service work, immediately
  before wakeup and cancellation mutations, and before returning their data.
  This is not a transaction over an external provider or an execution lease
  extending beyond the originating invocation.
  Revocation during an admitted heartbeat wakeup can reject the response after
  a run was queued or started; it does not automatically undo that work. The
  independent review confirmed this existing admission limit, not continuous
  authorization or an automatic-cancellation guarantee.
- New custom task keys must use the caller plugin's session prefix, have a
  nonempty suffix, fit 1,024 UTF-8 bytes and contain valid text without control
  characters. General Host creation also rejects foreign task-key namespaces.
- getRun retains exact Workspace/Agent/session/run/conversation ownership. Its
  additive output is not_ready while queued/running, available only for a valid
  successful persisted summary, or withheld with a reason. The bound is65,536
  UTF-8 bytes before and after existing common-pattern redaction; no truncation,
  raw result/log/configuration/credential fields are returned in this DTO.
  Common-pattern redaction is not DLP or an unknown-secret guarantee.
- Dedicated Workspace services do not subscribe to the legacy raw Agent Session
  event feed. Explicit getRun polling is the observation path. Existing general
  Host notifications remain compatible.
- Cancellation still distinguishes a request from confirmed process/Node
  closure. Existing queue locks, local exit and signed remote closure checks
  remain in place. No database migration or new workflow role is introduced.

## Verification Record

The parent inspected all implementation and SDK changes. Public SDK tests passed
184/184 on Node24.22.1. All30 Core workspace typechecks and builds passed; existing
CSS, dependency annotation and chunk-size build warnings remain.

Initial isolated PostgreSQL execution passed34/35 and failed one newly added
fixture that inserted the same globally unique plugin twice. The test now reuses
that plugin's scoped service; this initial failure is not relabeled as a pass.
The subsequent parent focused run passed10files/153tests, including real isolated
PostgreSQL host-service tests, actual child RPC manager tests, invocation
liveness/concurrency, capability denial, result bounds and existing cancellation
and Workspace execution regressions. Provider wakeup/cancel are mocked in the DB
suite; it is not real AI or provider termination evidence.

After two additional mutation-point tests, the final same10-file parent run
passed155/155, including37 isolated PostgreSQL cases. Revocation after Agent
lookup prevents session insertion; revocation after a cancellation marker write
rolls back that transaction and does not invoke the process cancellation callback.
Core commit is `db37ee1a444db577b01ee9cba754e882c5cf659b`; public SDK runtime/types
commit is312955f and documentation HEAD is `e58138e6e153c31b813f62a88932abf5d4cd495c`.
Production dependency policy gate passes with0critical/high, two reported low and
one reviewed moderate advisory (minimatch1244012 until2026-11-07), not zero
vulnerabilities or a full development-dependency audit. Default-branch GitHub
Dependabot alerts are a separate scope, not this candidate's policy result.

Command from the Core root (Node24 on PATH):

```powershell
node node_modules/vitest/vitest.mjs run server/src/__tests__/plugin-agent-session-context.test.ts server/src/__tests__/sps-agent-session-output.test.ts server/src/__tests__/sps-workspace-agent-sessions.test.ts server/src/__tests__/sps-workspace-agent-session-invocation.test.ts server/src/__tests__/sps-workspace-plugin-host.test.ts server/src/__tests__/plugin-worker-manager.test.ts server/src/__tests__/sps-workspace-plugin-workers.test.ts server/src/__tests__/sps-workspace-plugin-process.test.ts server/src/__tests__/sps-workspace-execution-control.test.ts server/src/__tests__/sps-execution-observation.test.ts --no-file-parallelism --maxWorkers=1
```

Ignored local logs use `desktop/dist/workspace-agent-sessions-*` for focused
checks, typecheck, build and SDK tests. Final committed tuple, further tests and
actual app rechecks are recorded below once observed, never inferred.

## Still Required

Durable session ensure and request/result receipts, ambiguous-send recovery,
three Lead conversations with shared structured memory, project CTO, Dev/QA,
GitHub Actions/Runner and actual AI remain Builder work or generic execution
prerequisites. No automatic retry is authorized by this increment. SDK package
version0.11.0 denotes an unreleased source API pinned by commit, not a changed
published tag.

The [previous-tuple CI record](CI-SOURCE-MUTATION-2026-11-02.md) proves only its
listed exact commits. It does not qualify this new Core/SDK increment. Artifact
cleanup eligibility/Host confirmation/Settings, uncertain Native claims, full
execution ownership, installed and physical two-PC acceptance remain within the
unchanged Core completion goal. User apps, profiles, Vaults, external projects
and Production were not changed.

Reference: Node.js [AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage).
