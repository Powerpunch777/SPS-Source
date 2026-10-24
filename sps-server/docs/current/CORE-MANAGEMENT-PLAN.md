# Core Management Incremental Plan

Status: stage 1 and the Agent-session cancellation/cross-lane history slices of
stage 2, plus stage 3 usage provenance, summaries, Host diagnostics, Agent
receipts and Claude-only neutral Node ingestion, are implemented in source,
2026-10-24. No new installer or Stable claim.

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
3. Implemented in source: usage provenance (reported/estimated/unavailable),
   billing basis/currency and Plugin attribution in the common read model;
   Agent-session receipts; read-only own-Plugin aggregates; and bounded neutral
   Node Claude usage receipts. Remaining: provider-issued receipt verification,
   correction/reconciliation and any non-Claude Node source under a separate
   versioned contract. Unknown is not zero.
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
  cost is not presented as free. At this observation slice, neutral Node usage
  was unavailable; the later ingestion slice below adds only Claude `modelUsage`
  result evidence. Other runtimes and model identity remain unknown; do not infer
  usage from command arguments or plaintext.
- No prompts, arguments, environment, stdin, output, local paths or raw error text
  are included. Existing detailed APIs and Artifact storage are not replaced.
- This observation API slice required no DB migration or user-data rewrite. The
  separate Node-ingestion slice below adds nullable `usage_json` in migration 0162
  without a backfill. SDK additions remain unreleased and require pinned source
  plus a compatible Host. Published v0.11.0 does not contain these methods.
  Read-only UI aggregation is a subsequent slice.

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
- The summary API itself adds no schema migration or historical backfill. The
  separate Node-ingestion migration is documented below. UI usage surfaces and
  budget/admission enforcement remain follow-ups; this slice is API/SDK only.
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
  or two-device release evidence is included in this UI slice. At that point,
  neutral Node usage ingestion remained a follow-up; the separate Claude-only
  ingestion slice below supersedes that item. Provider-issued receipt
  correction/reconciliation, other-runtime Node usage, admission/budget
  enforcement and broader common management views remain follow-ups.

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

## Adapter Usage Receipt Slice (2026-10-24)

- Reuse `heartbeatRuns.usageJson`; no new billing ledger, DB migration or public
  SDK method. Plugin Agent completions with usage retain a bounded v1 receipt
  bound to Workspace/run/Agent/Plugin/session identity. The accepted terminal
  transition and receipt share one running-only conditional write.
- Read the bound receipt in history and summaries. Invalid digest, scope or
  unknown fields makes usage unavailable without falling back to mutable sibling
  evidence. Older rows without receipts keep their previous versioned-evidence
  behavior; no backfill or reinterpretation of unmarked legacy costs.
- SHA-256 detects inconsistency; it is not a provider signature, invoice or
  defense against a DB administrator replacing both the report and digest.
  Unknown provider data and late cancelled completions are not reconciled by this
  Agent-session receipt slice. Neutral Claude Node ingestion is a separate slice
  below. Business success/reassignment stays Plugin-owned.
- Optional adapter `usageReportedFields` separates actual Codex/Claude token
  values from legacy parser defaults. Missing/invalid fields stay null, actual
  zero remains zero, malformed supplied masks fail closed. No new provider scope
  assumption or inherited accounting/delta behavior is introduced.
- Luna 6 xhigh produced the initial receipt and parser changes but hit the usage
  limit before completion. The parent retained/reviewed those changes, fixed
  scope type narrowing and invalid model-entry completeness, and added DB
  completion, late-write, scoped history and summary coverage. Luna was retried
  on the user's instruction; its review is not claimed complete unless returned.
- Remaining: provider-issued receipt verification/correction/reconciliation,
  other-runtime Node ingestion, admission/reservation/budget enforcement and
  broader common views. None is implied by an Agent adapter-completion receipt.

Final checks: seven-file usage/parser/execute set 103/103; actual DB execution
history and heartbeat recovery 113 passed, one platform-inapplicable skip.
Recursive Core typecheck, full build, compatibility boundary and UI entry budget
passed. Source Electron Workspace E2E completed with exit 0: real Builder
Send/Stop, exact process exit, safe run summary, unknown usage, time windows and
refresh, plus 1024/1280/1440 layouts. Mock Identity/no-provider execution was used;
no live Agent was invoked or user Workspace reset.

An additional inherited CLI-execute set failed 34 POSIX extensionless-script
fixtures on Windows (15 passed); it is not reported as a passing adapter suite.
The new mocked execution transport tests passed cross-platform. An initial DB
test incorrectly awaited Agent idle after an artificial external terminal write;
the corrected test awaits the rejected late finalization itself, then verifies
the retained receipt and zero appended cost rows. The complete DB rerun passed.

Both Luna retries completed: bounded receipt/context/observation review found no
actionable issue, and execute transport tests passed 8/8. Parent reviewed the
patches and independently reran the full 103-test set. Private ignored records:
`usage-receipt-unit.log`, `usage-receipt-db.log`, `usage-receipt-e2e.log`. No full
Linux Core regression, new installer or Stable/two-device claim is included.

Desktop full `npm test` also passed 374/374 without exclusions after the Core
gitlink and support matrix were committed. The existing persistent DEV app was
normally exited and restarted, preserving its login and Workspace. New backend
code is active without rebuilding an installer. `usage-receipt-desktop.log`
records the local Desktop run. The previous global UI token-gate debt remains;
this backend-only slice does not claim it resolved.

## Neutral Plugin Node Claude Usage Ingestion Slice (2026-10-24)

- The Desktop Node collector is enabled only for `claude_cli`. It recognizes
  structured JSON Lines objects with `type: "result"` and a `modelUsage` object;
  it does not infer usage from other CLI output, plaintext, command arguments,
  or Claude's top-level `usage` field. Ordinary plaintext is ignored and does
  not create or revise a report.
- Bound each line to 64 KiB and `modelUsage` to 1..64 model entries. Extract
  only `inputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, and
  `outputTokens`. For each aggregate independently, every model must provide a
  nonnegative safe integer and the total must not overflow; otherwise that
  aggregate is null. `inputTokens` includes cache-creation input, and
  `cachedInputTokens` is cache-read input. Model identifiers are not retained.
- The last recognized result replaces the prior report; it never accumulates.
  Missing/invalid usage in a recognized result, malformed JSON-like or
  truncated structured input, invalid UTF-8, and oversized lines clear stale
  usage. A report is emitted only when at least one aggregate is known.
- The strict optional completion `usageReport` is v1, source
  `claude_model_usage_v1`, with three required nullable token fields and no
  cost, model, billing, freeform, or Agent-attribution fields. Older Nodes omit
  it; older Hosts strip it. No public SDK method changes.
- Core accepts the report only from a signed Node completion for the matching
  Claude run with current authority. Its internal receipt binds Workspace, run,
  Node, runner, execution grant and Plugin. Receipt plus terminal result are
  written through an active-state CAS: duplicates/late completions cannot
  overwrite the accepted report. A cancellation that won first remains
  cancelled but may retain usage from its completion acknowledgement;
  revocation that already made the run terminal cannot append usage.
- Scoped history, summary and Host UI verify this receipt; absent, invalid,
  mismatched or altered receipts produce unknown usage, with no fallback to
  unbound sibling fields. The digest is Node application-report integrity, not a
  provider signature/invoice, TPM attestation, or protection from an admin
  changing both payload and digest.
- Add nullable `usage_json` with additive migration `0162_sps_node_usage` only;
  existing rows stay null with no backfill. The generated snapshot reconciles
  the earlier hand-authored SPS migration baseline; migration SQL only adds the
  column. No second ledger, cost, model identity, billing, Agent attribution,
  admission, reservation, budget enforcement, or automatic business decision
  is added.
- This is Claude-only. Codex and other runtimes remain unknown; any future
  support needs an explicit versioned source contract, bounded parser, strict
  schema, compatibility behavior and focused tests. It must not infer Codex
  scope or silently expand this contract into budgets or admission policy.
- Initial interim checks recorded at implementation time: Core DB 26/26, Core
  pure 31/31, and shared 278 passed. These are intermediate results, not full
  repository checks; final local checks for this ingestion slice are recorded
  below. No full Core regression, installer, or release claim is made here.

Final local checks: Core usage/schema/receipt set 60/60; signed DB Node routes
26/26; Desktop Node 55/55, including a real child process and lost completion
response retry. Recursive Core typecheck/full build, compatibility boundary and
UI entry budget passed. Re-running migration generation reports no schema drift.
The first generated SQL reflected older hand-authored migrations missing from
the snapshot; it was not applied. The final SQL contains only ADD COLUMN, and
fresh isolated databases migrated and passed the signed-route tests.

Source Electron Workspace E2E completed with exit 0 (Builder Send/Stop, process
exit, unknown usage, period/refresh controls and 1024/1280/1440 layouts). This is
a UI regression test, not a real Claude provider or two-device usage test. Node
parser/child-process and signed Core ingestion are separately tested. No paid AI
or existing Workspace mutation was used for fixtures.

Parent audit also found that a lost completion response triggered a generic
failed retry without usage. The runner now retries the same prepared completion
payload with a fresh signed request, without rerunning the process. The bounded
retry can still fail during prolonged outage; durable offline receipt recovery
is not implemented. Luna 6 xhigh implemented collector/shared schemas/docs and
the retry test; parent reviewed/integrated Core persistence and DB checks. Luna
review found no actionable Core receipt/CAS issue. Quota interruptions were
retried; the last runner verification returned 55 passing tests.

Private ignored evidence: `node-usage-{unit,db,node-tests,typecheck,build,e2e}.log`
and `node-usage-migration-generation.log`. No full Linux Core regression, fresh
dependency audit, signed installer, release or physical two-PC claim is made.

Final Desktop suite passed 374/374 after the Core pin was committed and local
Desktop Node was synchronized. The final source Electron rerun also passed
(exit 0 after cleanup), recorded in `node-usage-e2e-final.log`. The persistent
DEV Host was normally restarted; its log confirms exactly migration
`0162_sps_node_usage.sql` applied, and the existing logged-in Workspace reopened.
No account reset or historical usage backfill occurred. One transient native
input geometry error was recovered by selecting the current window again.
`node-usage-desktop.log` records the full Desktop suite. Previous global UI token
gate debt is unchanged, not claimed resolved.

## Neutral Plugin Execution Timeout and Node Ownership Guards (2026-10-24)

- Core `dispatchRun` accepts an omitted or null timeout as unset. A supplied
  non-null value must be a positive safe integer; zero, negative, fractional,
  non-finite, unsafe, and non-number values are rejected before a run is
  inserted. Valid values clamp to 1 second through 4 hours.
- The Local Node independently validates/clamps neutral Plugin command timeouts.
  An omitted/null value uses the existing 30-minute Node default. Legacy command
  timeout handling is unchanged; this validation does not widen to that lane.
- Before claim, Core checks the persisted timeout on each queued neutral Plugin
  run. Invalid persisted data marks the run failed and claim processing skips it
  without dispatching a process.
- Neutral Plugin claims are not silently requeued after 10 minutes. Silence is
  not evidence that a process stopped, so an old claimed run stays `claimed`;
  explicit cancellation stays `cancelling` until the signed Node acknowledges
  completion. No automatic retry is made for uncertain process execution. The
  legacy command lane's existing stale-claim handling is unchanged.
- Local Node rejects an active duplicate command ID across all execution lanes
  before replacing the tracked entry, spawning a process, or sending a synthetic
  completion. Distinct IDs may execute concurrently. This is a per-ID ownership
  guard, not a shared concurrency limit.
- Existing Node lease, Workspace Source, and authorization checks remain in
  force. This slice adds no DB migration, API or SDK method, arbitrary global
  concurrency default, or Workspace usage-budget enforcement. Configurable
  capacity limits and admission/reservation policy remain future contracts.
- Core verification for this guard slice: focused four-file set 50/50 and
  actual DB-backed signed Node tests 27/27; `pnpm -r typecheck`, full build,
  compatibility boundary, and UI bundle checks passed. No full Linux Core
  regression or new security audit is claimed.
- Final Local Node suite: 60/60, including active-ID collision rejection,
  cancellation of the original process, concurrent distinct IDs, and a real
  timeout/PID check confirming the child is dead before completion is accepted.
  `execution-guards-node-tests.log` records the parent rerun.

Integrated verification: Core `8fe9b6d93b56f147b65c9b341507937adbb6da33`
and Source implementation `3d575db7` (verification-only documentation follows).
Full Desktop suite 374/374 after Node sync and Core pin. The isolated source
Electron Workspace E2E exited 0, including cleanup: real Builder Send/Stop,
process termination, scoped/unknown usage, period selection/refresh, and
1024/1280/1440 layouts. These UI checks use mock Identity/no-provider fixtures;
the neutral Node ownership guard is covered separately by DB and real-process
tests, not claimed as an end-to-end remote Node test.

Private ignored logs: `execution-guards-{unit,db,node-tests,typecheck,build,desktop,e2e}.log`
under `desktop/dist`. Reproduce the 50-test Core set with
`pnpm exec vitest run server/src/__tests__/sps-execution-timeout.test.ts server/src/__tests__/sps-node-usage.test.ts server/src/__tests__/sps-execution-observation.test.ts server/src/__tests__/sps-execution-summary.test.ts`;
the DB set uses `pnpm exec vitest run server/src/__tests__/sps-nodes-routes.test.ts`.
Node and Desktop use their respective `npm test`; source app smoke uses
`SPS_DESKTOP_E2E_SOURCE=1`, `SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS=120000`, and
`node scripts/smoke-workspace-surfaces-desktop.mjs`.

The existing DEV app was normally exited and restarted without a data reset;
the logged-in Workspace and Plugin Builder navigation were visually confirmed.
No installer/tag/SDK release, fresh dependency audit, full Linux regression,
paid-provider or physical two-PC validation is claimed. Stable prerequisites
and prior global UI token-gate debt remain unchanged.

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
