# Core Management Incremental Plan

Status: stage 1, Agent-session cancellation and cross-lane history slices of stage 2,
and usage provenance/summary of stage 3 implemented in source, 2026-10-24.
No new installer or Stable claim.

Core owns technical execution state, usage evidence, limits, artifacts, audit and
recovery. Plugins own assignments, roles, approvals and business evaluation.
Retain both Agent-session and neutral Node execution lanes behind additive APIs;
do not replace either engine or import the upstream workflow model.

## Stages

1. Implemented and tested: neutral plugin Run list/cancel, capability and tenant boundaries,
   cancellation request versus Node completion, race and late-output tests.
   This stage does not add Agent-session cancellation or Builder UI controls.
2. Partly implemented: exact Agent-session run reads/cancel bridge and Builder
   Lead stop, safe cross-lane technical read model and conservative failure
   classification. Remaining: parent/child execution ownership and complete
   result/usage recovery. No automatic retry of unknown external effects.
3. Partly implemented: usage provenance (reported/estimated/unavailable), billing
   basis/currency and Plugin attribution in the common read model. Remaining:
   immutable/idempotent provider usage receipts and neutral Node usage ingestion.
   Own-plugin aggregate queries are now implemented as a read-only projection.
   Unknown is not zero.
4. Partly implemented: existing Plugin Status diagnostics consumes the read-only usage
   projection. Shared admission limits and budget reservations/settlement,
   broader Dashboard/Inbox integration and optional result evidence remain planned.

## Stage 1 Contract

- Add sps.runs.list under existing runs.observe and sps.runs.cancel under a new
  runs.cancel primitive/capability. A Plugin may cancel only its own Workspace runs.
- Queued -> cancelled, claimed/running -> cancelling, cancelling -> cancelled
  only after an authenticated Node completion report. Disconnected runs remain
  visibly pending; a timeout is not proof of process exit.
- Reject late output resurrection and preserve cancellation across completion
  races. Repeated cancellation/completion must be safe.
- List uses bounded descending ID pagination. Return safe metadata only.
- Existing string status storage supports these states without a destructive
  migration; older SDK clients retain their methods. New plugins must not assume
  an old Host supports new operations. Package release/versioning remains gated.
- Node completion is application-level evidence, not OS/TPM attestation. Existing
  Windows process-tree termination and close-event reporting remain the transport.

## Stage 2 Cancellation Slice

- Agent-session run reads and cancellation have separate capabilities. Require
  exact Workspace/session/run ownership and literal Plugin prefixes, not SQL LIKE
  wildcards. A terminal callback cannot overwrite a newer turn's session pointer.
- Keep cancellation request separate from process termination. Queued work can
  be confirmed as not started; active remote work remains pending until the signed
  Node completion. Late output uses a status/sequence CAS and cannot revive it.
- Serialize duplicate cancellation requests, permit explicit retries after a
  failed control-plane operation, preserve cancellation during adapter setup and
  Host recovery, and block automatic retries of cancelled work. Signed completion
  receipts also resolve the completion-before-cancel race without assuming that
  a server-written failed status proves process exit.
- Node checks its lease before spawn as well as during execution. Windows uses
  taskkill tree termination; POSIX uses a detached process group and escalation.
  Failed or unconfirmed termination must not send a completion acknowledgement.
  POSIX behavior is implemented but not validated on a physical POSIX device.
- Builder's Stop targets only the selected Lead message/run, not its Workers.
  It blocks new turns while termination is pending and allows explicit stop retry.
  Lead/Worker relationships and any future cascade policy remain Plugin-owned.
- Source Electron E2E uses an isolated mock-Identity Host and a no-provider Node
  process. It sends a Builder message through the UI, clicks Stop, checks the
  Core cancellation state and verifies the PID is dead. It is not a packaged or
  two-device test. User Workspaces and paid AI accounts remain untouched.
- Older Builder restart handling still marks non-cancellation in-flight turns
  interrupted without reconnecting their transcript callbacks. Full reconnection,
  Worker stop controls and complete result/usage recovery remain follow-up work.

Stage 2 results: exact session/Node/API and SDK bridge tests 59/59; expanded
recovery/Windows supervisor set 145 passed, one platform-inapplicable skip (146
total); public SDK 153/153; Builder 16/16; Desktop Node 41/41 including a denied
initial lease that creates no file and a real Windows parent/child termination.
Desktop 373/373 and Core recursive typecheck/full build passed, as did the
compatibility boundary. These are focused Core tests, not full Core regression.
Source Electron Workspace E2E passed with Builder button/PID assertions and
1024/1280/1440 responsive checks. Earlier harness attempts read the bridge response
without its `data` envelope and failed to locate the run; the harness was corrected
and rerun. This does not erase the historical intermittent Identity startup issue.
Luna 6 xhigh implemented and tested the public SDK and reviewed cancellation races;
the parent implemented Core, Node, Builder, and integration verification. No full
Linux Core regression, packaged installer or two-PC certification is claimed.

## Cross-Lane Observation and Usage Foundation

- Add read-only `sps.executions.list/get` with separate `sps.executions.read`
  capability and `executions.observe` primitive. Existing `sps.runs.read` remains
  Node-only. Both lanes are scoped to the calling Plugin and Workspace.
- Chronological pagination uses `(createdAt, runId, lane)` descending, truncating
  PostgreSQL microseconds to the public millisecond precision for filtering and
  ordering. Query at most limit+1 rows per lane; return at most 100 rows. This is
  live history, not a frozen invoice or accounting snapshot.
- Agent-session history uses the durable Core-written Plugin/session snapshot;
  it does not require a current session row. Historical runtime is captured at
  execution, never inferred from a subsequently edited Agent configuration.
- Return technical phase, cancellation/termination, elapsed time and coarse
  failure category. Unknown errors do not leak raw messages. All retries require
  Plugin review; no automatic retry authorization or reassignment is introduced.
- Persist versioned usage evidence beside existing usageJson, without changing
  the legacy ledger. Explicit per-run adapter token values are reported; computed
  session deltas are estimated. Invalid/missing values and unmarked legacy records
  are unavailable, not zero. An explicit valid zero remains zero.
- Cost requires explicit adapter `costUsdBasis: per_run`, independent from token
  usageBasis. Unknown/cumulative scope is unavailable; do not claim the cumulative
  total as this run's cost. Existing adapters require a separately verified scope
  declaration before this common DTO can show their cost. Their ledger is unchanged.
  Cost means adapter-reported USD, not a provider invoice. Subscription reference
  cost is distinguished from incremental metered/overage charge. Absent subscription
  cost is not presented as free. Neutral Node usage/model remain unavailable until
  an explicit provider report contract exists; do not parse command arguments.
- No prompts, arguments, environment, stdin, output, local paths or raw error text
  are included. Existing detailed APIs and Artifact storage are not replaced.
- No DB schema migration or user-data rewrite is needed. The SDK additions remain
  unreleased and require pinned source plus a compatible Host. Published v0.11.0
  does not contain these methods. Read-only UI aggregation is a subsequent slice.

Verification (2026-10-23): Core scoped DB/observation/session/recovery/SDK bridge/
manifest set 205 passed, one platform-inapplicable skip (206 total); public SDK
155/155; Builder check 16/16; recursive Core typecheck, full build and compatibility
boundary passed. The real adapter-completion test preserves a per-run usage
snapshot, including absent cached tokens and explicit cost scope, without changing
the legacy ledger. Source Electron Workspace E2E passed again with actual Builder
Send/Stop, process exit, runtime snapshot and 1024/1280/1440 layout checks. These
tests use mock Identity and a no-provider process, not paid AI or user Workspace
data. Final PowerShell orphan cleanup temporarily stalled, as did an independent
Get-Date probe. Cleanup eventually completed and the E2E command exited 0. The
first full Desktop run failed at the archive PowerShell timeout and the not-yet-
committed gitlink baseline. A bounded run excluding that archive body passed, but
was not treated as full-suite evidence. After Windows commands recovered and
gitlinks were committed, the archive test passed independently and `npm test`
completed normally: 373/373, no exclusions. Final log: stage-3-desktop-full-verified.log.
Core/SDK checks also completed via cmd.exe. The generated Builder Worker was
rebuilt against the new pinned SDK. These are local checks, not Linux/full Core or
physical two-PC release evidence.

An intermediate aggregate run loaded the old observation module before a duration
test edit and failed one assertion (204 passed/one failed/one skipped). After edits
stopped, the complete same eight-file set passed 205/one skipped. Do not use the
earlier failed log as current evidence. Luna 6 xhigh implemented SDK/bridge work
and reviewed the read model; the parent fixed cost-scope uncertainty and secret-
shaped runtime labels. Cost scope remains opt-in for existing adapters. No full
Core regression, packaged installer, signed release or two-PC evidence is claimed.

## Usage Summary Slice (2026-10-24)

- Complete `sps.executions.summarize` / `executions.summarize` with the existing
  `sps.executions.read` capability. No new write authority or business policy.
- Accept canonical UTC millisecond `from/to` in a positive range of at most 31
  days. Use execution creation time `[from, to)`, with optional lane or Agent
  filter; neutral Node executions cannot be filtered by an invented Agent ID.
- Read both lanes in one read-only repeatable-read transaction. Query bounded
  rows and reject over 10,000 matching executions instead of partial totals.
- Deduplicate lane/run identities in the projection. Repeated summary reads do
  not insert usage/cost events. This reuses the existing per-run snapshot and
  guarded terminal write; it does not add a second ledger or claim that provider
  receipt ingestion/correction/reconciliation is complete.
- Separate reported/estimated subtotals and unavailable counts. Empty or unknown
  metrics stay null, explicit zero stays zero, and overflow becomes unknown.
  API, subscription-reference and other USD costs remain separate. These numeric
  adapter-report sums are not provider invoices or settlement amounts.
- No schema migration or historical backfill. UI usage surfaces and budget /
  admission enforcement remain follow-ups; this slice is API/SDK only.
- An interrupted earlier edit left the new required client method without mock
  and Worker implementations, preventing the DEV Owner Host SDK build. Restored
  protocol, capability map, Host service, Worker client/finite RPC and test mock
  together. SDK/server typechecks pass and the actual DEV app was restarted into
  the existing Workspace without resetting login or data.
- Focused Core nine-file set: 215 passed, one platform-inapplicable skip (216
  total). DB limit/boundary additions also passed independently (25 scenarios),
  including an actual 10,001-row refusal. Core recursive typecheck/full build and
  compatibility boundary passed. Public SDK verified separately. No full Core
  Linux regression, signed installer or physical two-PC evidence is claimed.
- Luna 6 xhigh implemented the public SDK and performed a bounded read-model
  review; parent completed Core plumbing, DB behavior, tests and app recovery.

Final slice checks: public SDK 156/156, Builder check 16/16 and Desktop full
`npm test` 373/373 (no exclusions). Source Electron Workspace E2E completed with
exit 0 after real Send/Stop, process-exit/runtime assertions and responsive
1024/1280/1440 checks. The persistent DEV Workspace also opened successfully with
existing login and conversations. No usage-summary UI was added. Future required
client methods must be applied together with protocol, implementation and mocks
before treating a stopped DEV checkout as runnable.

## Host Usage UI Slice (2026-10-24)

- Reuse Plugin Settings > Status, without adding a page, sidebar entry, workflow
  role, or another ledger. Periods are 24 hours, 7 days and 30 days. Refresh is
  explicit; no usage polling or automatic retries are added.
- The human Host API requires both local Host authority and Workspace access.
  Resolve the Plugin key from its registry ID, not a caller-selected key. Reads
  work for retained disabled Plugin history. Invalid/ambiguous queries return
  400; missing scopes return 404; over 10,000 matches return actionable 422.
  Agent/Member callers do not gain an alternate capability bypass.
- Desktop supplies its second Host proof only for the exact summary GET route
  on the active local Host origin. The first live-app attempt exposed the missing
  allowlist entry; it was fixed without weakening Core authorization.
- Show reported and estimated values/coverage separately, unavailable counts,
  technical phase totals and recorded duration. Never combine API incremental
  cost with subscription reference or present unknown usage as zero/free.
  Tiny positive costs remain distinguishable from a real zero.
- Scope and window are part of the query key. Workspace/Plugin changes remount
  the panel, and aborted/failed requests do not show prior-scope totals. Loading,
  no-execution, forbidden, oversized and generic error states are covered.
- Source static startup previously preferred a stale `server/ui-dist` packaging
  copy. Source workspaces now require the current `ui/dist`; a missing source
  build does not silently certify old UI. Standalone packages still use their
  bundled `ui-dist`. Earlier source E2E runs alone are not proof of the latest UI.
- Initial E2E attempts failed to activate Radix Status with synthetic click.
  The harness now uses keyboard activation and awaits the ready summary control.
  A rerun against the current source UI passed real scoped run lookup, unknown
  usage, period changes, refresh, process cancellation and responsive checks.
  Mock Identity and a no-provider process preserve live accounts and user data.
- No DB migration, paid AI invocation, new installer, full Linux Core regression
  or two-device release evidence is included. Provider receipts/reconciliation,
  neutral Node usage ingestion, admission/budget enforcement and broader common
  management views remain follow-ups.

Final Host usage UI checks: focused Core/UI tests 71/71; actual DB Node/execution
suite 25/25; Desktop full `npm test` 374/374 without exclusions. Recursive Core
typecheck/full build, final UI typecheck/build, compatibility boundary and UI
entry bundle gate passed. The global token gate failed at 124 pre-existing
findings (79 color, 43 arbitrary-value, 2 font-size); no new usage files appeared
in its findings. That global gate is not claimed clean.

Final compact source Electron E2E exited 0. It checks the real Builder run's safe
summary, unknown tokens/cost, all three time windows, refresh and non-overflowing
usage tables at 1024/1440; the existing Workspace checks include 1280. Screenshots
were visually inspected. The persistent DEV app also loaded existing recorded
usage through its normal Host window. Local ignored logs: usage-ui-final-tests.log,
usage-ui-db.log, usage-ui-final-typecheck.log, usage-ui-final-core-build.log,
usage-ui-desktop-tests.log, usage-ui-e2e-compact.log and usage-ui-observation/*.png.
These are private development records, not published release attestations. Luna 6
xhigh implemented UI/client/tests; parent reviewed and implemented Core, Desktop
transport, source-static selection and integration. No new installer was built.

## Verification and Safety

Core DB-backed tests: tenant/plugin isolation, capability rejection, queued and
active cancellation, negative lease, completion acknowledgement, late events,
terminal idempotence, no secret/path disclosure and bounded pagination.
SDK contracts and Core server/shared/bridge typechecks follow. Source app smoke
does not certify signed packages or two-device execution. Preserve all user data.

Stage 1 results: Core Node/API and SDK bridge 50 tests; existing Plugin/session
authorization compatibility 80 tests; shared manifest/Agent platform 30 tests;
Desktop Node 40 tests; Desktop 373 tests; public SDK 149 tests. Server/shared/UI typechecks and the
SPS compatibility-boundary gate passed. A real Windows Node process with a child
process was started and both PIDs were checked dead before completion was accepted
by the test transport. DB-backed signed Node tests separately verify the lease and
completion state transition. This is not a real two-machine E2E or UI validation.

Luna 6 xhigh implemented the public SDK slice and reviewed Core cancellation
changes; the parent implemented Core and integration tests. No actionable findings
were returned in the bounded secondary review. No live user runs were cancelled.

Upstream findings: Hive budgets and stop-metadata already match SPS; no bulk merge.
Official Paperclip timeout resolution is a small future selection. Its accounting
exposure design is useful but coupled to reservations/browser/native tables;
adapt the design in stage 4 rather than copying the module wholesale. Preserve MIT
copyright/license notices for any selected code and audit added dependencies.
