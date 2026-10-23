# Core Management Incremental Plan

Status: stage 1 implemented in source, 2026-10-23. No new installer or Stable claim.

Core owns technical execution state, usage evidence, limits, artifacts, audit and
recovery. Plugins own assignments, roles, approvals and business evaluation.
Retain both Agent-session and neutral Node execution lanes behind additive APIs;
do not replace either engine or import the upstream workflow model.

## Stages

1. Implemented and tested: neutral plugin Run list/cancel, capability and tenant boundaries,
   cancellation request versus Node completion, race and late-output tests.
   This stage does not add Agent-session cancellation or Builder UI controls.
2. Planned: cross-lane read contract, Agent-session cancel bridge, explicit
   technical failure/retry classifications and parent/child execution ownership.
   No automatic retry of unknown external effects.
3. Planned: usage provenance (reported/estimated/unavailable), billing basis and
   currency, Plugin attribution and idempotent usage receipts. Unknown is not zero.
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
