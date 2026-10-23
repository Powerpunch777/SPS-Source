# Core Management Incremental Plan

Status: stage 1, Agent-session cancellation and cross-lane history slices of stage 2,
and the usage-provenance foundation of stage 3 implemented in source, 2026-10-23.
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
   idempotent usage receipts, aggregate queries and neutral Node usage ingestion.
   Unknown is not zero.
4. Planned: shared admission limits and budget reservations/settlement, then
   read-only Dashboard/Diagnostics/Inbox integration and optional result evidence.

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
the legacy ledger. Source Electron Workspace E2E UI assertions passed again with actual Builder
Send/Stop, process exit, runtime snapshot and 1024/1280/1440 layout checks. These
tests use mock Identity and a no-provider process, not paid AI or user Workspace
data. Its final PowerShell orphan-cleanup command subsequently stopped responding
on this PC; the process did not exit normally, so this is not a fully completed
E2E run. An independent PowerShell Get-Date probe also stalled. The full Desktop
suite likewise stalled at its Windows archive/PowerShell test; do not carry forward
the previous full-suite result as proof of this tuple. A subsequent bounded run
with `--test-skip-pattern=Windows.runtime.pack.archive` completed with 373 passed
as reported by Node 26 (its empty skipped file is counted as a passing file wrapper;
the archive test body was not executed). This is not full-suite certification.
An initial bounded run failed only because the new matrix preceded the committed
gitlinks; after committing the exact gitlinks it passed. Core/SDK checks completed
using cmd.exe. The generated Builder Worker was rebuilt against the new pinned SDK.

An intermediate aggregate run loaded the old observation module before a duration
test edit and failed one assertion (204 passed/one failed/one skipped). After edits
stopped, the complete same eight-file set passed 205/one skipped. Do not use the
earlier failed log as current evidence. Luna 6 xhigh implemented SDK/bridge work
and reviewed the read model; the parent fixed cost-scope uncertainty and secret-
shaped runtime labels. Cost scope remains opt-in for existing adapters. No full
Core regression, packaged installer, signed release or two-PC evidence is claimed.

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
