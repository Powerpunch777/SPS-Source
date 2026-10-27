# Workspace execution control integration — 2026-10-27

This work follows Source544bdce/Core595e9577 and pins Core
`80fecfa8f5979d72eceeafc173cbb05ac95b0bec`, implementing the read-only next-implementation
contract. The full Core/Desktop goal remains incomplete. Native is still opt-in,
AI is optional, and no Marketplace policy or Plugin Builder restructuring is
included. This review is a development record, not release qualification.

## Behavior and ownership

Core owns a durable per-Workspace admission row and decimal execution generation.
Pause blocks new enqueue/claims while active work may finish. Stop increments
the generation, closes admission, and persists cancellation intent in the same
transaction. Resume admits future work at that generation without replaying
cancelled/interrupted work. Existing budgets/archive rules remain independent.
The detailed implementation contract is Core
`doc/SPS-WORKSPACE-EXECUTION-CONTROL.md`.

The control transaction cancels queued Node/Plugin/Agent/Job/model work and
queued/deferred wakeups. Active remote commands/jobs remain cancelling, model
resources remain reserved until settlement, and Agent termination markers stay
pending until their existing local/signed-Node acknowledgement. This does not
require a process-local callback to have run first. Delayed fanout filters strictly
older generations so it cannot cancel later resumed work. Stale signed success
is recorded only as cancellation acknowledgement. Old retry/recovery callbacks
must match their originating generation before creating new work.

Shared Plugin workers remain running for other Workspaces. Stop invalidates each
affected invocation and blocks subsequent Host RPCs. Actual worker response or
exit is acknowledgement; an RPC timeout alone leaves cancellation pending and
retains scheduler accounting. Non-cooperative Plugin computation/descendants and
OS process containment remain a separate unfinished requirement.

The embedded Core settings now have status and Host-only pause/stop/resume
controls, without AI/Plugin prerequisites. Strict revision-bound HTTP mutations
require current Core Host authority. Members may read their own Workspace status;
ordinary Member/Agent/Plugin credentials cannot mutate execution policy. Pending
counts are separate from admission state and do not claim process/provider exit.

## Schema and compatibility

Generated migration0171 adds `sps_workspace_execution_control`, default0 epoch
columns on the five execution-history tables, and a Plugin Job cancellation
timestamp. No old row or workflow meaning is reinterpreted. Shared Plugin Job
status adds nonterminal `cancelling`; restore sanitization covers this status.
Control policy remains durable across restart/restore and cancelled work is not
automatically replayed. Older Core binaries do not enforce the new policy; a
downgrade cannot be advertised as preserving stopped admission without a
compatible runtime gate. No customer database or installed application was used.

## Verification observed so far

- Database schema generation initially failed on an existing cleanup fixture's
  untyped EventEmitter stdout/stderr fields. Assigning the extended object to the
  declaration fixed the same TS2339 reported by Core and Desktop preparation in
  Source544bdce CI. A later generation completed and produced0171; deadlines and
  cleanup failure policy were not relaxed.
- New Core settings component tests3/3 PASS, EXIT0, using the thread pool after
  the initial test worker startup timed out before assertions. Typed component/API
  selection also passed. Logs `workspace-control-ui-threads-2026-10-27.log` and
  `workspace-control-ui-types-2026-10-27.log` are kept outside the repository.
- New route authority/input tests3/3 PASS, EXIT0:
  `workspace-control-auth-2026-10-27.log`.
- First DB attempt failed because the compatibility DB facade did not re-export
  the new table. The facade was corrected; the concurrent-fixture test now joins
  admission failure instead of leaving an unhandled promise.
- The next combined DB attempt had5 actual control assertions pass but failed
  PostgreSQL shutdown with safe `shutdown_timeout` metadata. The model fixture
  timed out before assertions; its startup promise/late cleanup are now retained,
  and setup budget is aligned with the observed provisioning time. Neither suite
  from that failed command is counted as clean acceptance.
- Final focused durable-control file6/6 PASS, terminal23252 EXIT0, including owned
  DB/fixture cleanup: `workspace-control-durable-intent-final-2026-10-27.log`.
  It covers A/B separation, pause, stale screen revision, stop/retry/resume without
  old-generation authority, control-lock serialization, archive-policy retention,
  and durable multi-lane queued/active intent even with no local handlers.
- Worker RPC selections passed: full file19/19 at the recorded intermediate
  implementation, followed by the two named timeout/Workspace-isolation cases2/2
  after the acknowledgement changes. These use actual owned worker processes,
  not production Plugin/CLI OS sandbox qualification.
- Narrow lane types passed once after correcting source mappings/fixture types;
  later race fixes have a separate final check in progress. No full local suite,
  build, or manual hosted-CI rerun.
- Required UI token scan fails existing debt79 color literals/36 bracket values/
  1 font-size value; neither new execution-control component is listed. No
  exception or unrelated styling refactor was added.

The selected three-file lane command62736 completed EXIT1: model3/3 and Plugin
Job2/2 selected cases passed, Node1/2 selected cases passed. The other Node
scenario hit the default five-second test deadline; its pending runner then
raced fixture deletion, producing audit/Node foreign-key errors and an unhandled
rejection. Its old ten-second teardown budget also expired. It is not a clean
Node pass. The fixture now observes each runner promise immediately and joins
owned command/fanout cleanup before row deletion; the final affected Node cases
need a new focused result. A claim-loop review also found candidate reads using
the outer database while stale-row updates used a transaction; candidate reads
now use that same transaction, preventing repeated stale-row reads.

Final narrow lane types1488 passed EXIT0 after source mapping and optional-run
guard repairs. Final UI types76607 passed EXIT0 before the additional pending-count
text. A later UI regression worker-start attempt timed out before assertions;
the previous three passing assertions are retained, and another focused attempt
is observed separately rather than counted as passed.

The final UI component file then passed3/3, terminal66986 EXIT0, when run directly
from the UI project (`workspace-control-ui-direct-2026-10-27.log`). The late
pending-count text is included. Restore sanitization and owned DB cleanup
helpers passed21/21, terminal20345 EXIT0, without starting another database
(`workspace-control-restore-cleanup-2026-10-27.log`). All unchanged historical
token-gate failures are reported above, not waived.

## Outstanding evidence and risks

The final Node two-case rerun43783 passed2/2, EXIT0, including owned DB cleanup:
`workspace-control-node-corrected-2026-10-27.log`. It covers pause denying enqueue,
stopped claimed work retaining pending state until signed cancellation completion,
resume/new generation, stale queued work preceding a new-generation claim, and
completion racing delayed stop fanout. Combined with model3/3 and Plugin Job2/2
from62736, all seven selected lane scenarios now have passing assertions; the
earlier combined command remains a failed run. Final lane types1488 passed; later
source changes were the same-typed candidate read through tx and scheduler
unregister ordering, plus fixture import/lifecycle fixes.

Final restore9/9 passed88567 after the actual Plugin Job predicate was corrected
and explicitly asserted. The earlier21/21 helper/restore command preceded that
predicate correction and is not used to claim coverage of the new predicate.
Generated migration numbering/safety passed54678 after0171 was generated.

These focused results verify the selected integration scenarios. They do not
prove all adapters or every runtime/recovery race. Embedded settings rendering
does not certify Native remote settings parity, actual two-PC Node cancellation,
production provider/Identity, signed installation/update/restore, OS containment,
or the complete release tuple. Known unwaived Zod High and broader release gates
remain. All earlier failed logs are retained; no security or cleanup gate is
suppressed. Coordinator with GPT-6 Luna high subagents, with limit retries.
