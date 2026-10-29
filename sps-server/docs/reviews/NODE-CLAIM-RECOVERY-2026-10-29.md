# Node claim response-loss recovery — 2026-10-29

This increment addresses the Runner task-receipt gap recorded before Core work
resumed. It does not start new Native networking or Builder implementation.

## Implemented behavior

- Core opt-in claims bind a versioned signed request ID to one result in the
  same transaction as the queued-task claim. An empty result is also durable;
  it cannot consume later work on retry. Legacy request/response behavior is
  preserved for callers without the ID.
- A signed qualification endpoint advertises the recovery protocol without
  claiming a task. Desktop rejects unsupported/malformed Hosts before sending
  resumable claims, without silently falling back to an unsafe new claim.
- Positive replay requires the same scoped task, active authority and execution
  epoch. Request/result digests prevent changing the task or resolved runtime
  under the same ID. Expired, stopped, terminal or reassigned work cannot turn
  into the next queued task. Request lifetime is fixed at 24 hours, including
  after expired receipt cleanup.
- Desktop stores only request identity, task identity and execution phase in an
  encrypted slot bound to account, Host, Node and public-key identity. It retries
  an unentered request after restart, including the Plugin lane before polling
  unrelated Agent work. It never automatically replays entered/uncertain work.
- The execution-entry marker is persisted before spawn. Local cancellation and
  the remote execution lease are checked again after that awaited save. Storage
  failure or revoked authority prevents process launch.
- One in-process owner covers preflight through executor settlement across poll
  generations. Stale-poll not-started reports require a durable abort transition
  before reporting; an entered/owned claim cannot be aborted by another poll.
  Restarted aborted claims resume final reporting only. This avoids falsely
  terminalizing a task which a reconnect is already executing.
- The existing final-completion outbox remains independent. A durable final
  report can reconcile its matching claim journal before the report is
  acknowledged/removed, including a restart between those two local writes.

The protocol does not promise exactly-once execution. A crash between the entry
marker and actual launch remains uncertain. Such work and expired unresolved
claims remain held with a truthful local status; they are not reset by age.
Physical Windows app/Host/Member qualification is still required.

## Data and compatibility

Core migration `0176_sps_node_claim_receipts` adds a 10-column table, two indexes
and two scoped cascade foreign keys. A snapshot comparison confirmed all 165
existing tables unchanged. Work IDs intentionally have no task FK whose delete
could erase the original positive association. Existing task/credential rows
are not migrated or reset.

Desktop adds optional `encryptedNodeClaimJournal` to the existing state format.
Current state, accounts, Node keys and completion reports are preserved. Old
clients still use legacy claims. New Desktop polling requires a matching Host
that advertises this recovery protocol; no installed app or customer Host was
replaced during development.

## Verification and remaining gates

Local Node is `24.16.0`; Source CI uses Node 22. Only focused local checks were
run. This document is an implementation record, not full release acceptance.

- DB package build/migration safety passed. The new generated snapshot adds only
  the receipt table and does not change existing tables.
- The final selected Core run passed 9 tests: 3 lifetime unit tests plus 6
  real-DB new/legacy cases. This includes 12 simultaneous replay requests,
  exact payload binding, empty results, cross-kind conflicts, expired IDs,
  revoked grants and Workspace stop/resume epoch rejection. Admission authority
  reads use the transaction connection, avoiding pool exhaustion while other
  replay transactions wait for the Workspace lock.
- A first legacy case timed out under the default 5-second test budget because
  it dynamically imported the route during the first test. Moving route import
  to module setup preserved assertions and timeouts; that selected run passed.
- After payload binding and stop/resume cases were added, a follow-up run passed
  3 unit tests but its DB suite hit the unchanged 120-second setup limit before
  test execution. After the concurrent typecheck ended, the final selected run
  executed alone with unchanged deadlines and passed. That earlier setup
  failure is not silently counted as a successful run.
- Desktop journal/Main/outbox/state run: 60 passed, 2 skipped. The skips are
  existing file-symlink permission restrictions on this Windows host. Two
  subsequent state-field persistence/damage cases passed separately.
- Node selected protocol/claim/launch-fence cases: 9 passed. Actual changed Node
  modules were copied into Desktop's owned development dependency and its
  package exports were imported successfully; no native-helper rebuild was
  required by these JavaScript changes.
- Six final Main restart/refusal scenarios passed after the status-message
  refinement. They check exact request reuse, pending Plugin priority,
  no replay after entry, completion/journal reconciliation and safe Host refusal.
- After adding the reconnect/preflight owner and durable abort fence, the final
  journal/Main/completion-outbox run passed all 43 tests. It preserves the
  original stale-response/account-isolation assertions and adds the actual
  overlapping-poll scenario plus aborted-report restart recovery. These runs
  overlap earlier counts and must not be added as independent test totals.

Final `pnpm --filter @paperclipai/server run typecheck` exited 0 on the fixed
Core inputs. The final real-DB selected run exited 0 as described above. No full
local suite, release, new Windows Desktop E2E or remote CI has been claimed.

The existing High Zod security gate remains unresolved and has no waiver. See
[current-patch evidence](CORE-RESUME-2026-10-29.md). These recovery changes do not
resolve it or qualify the platform as complete.
