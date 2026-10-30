# Interrupted plugin removal recovery — 2026-10-29

Status: implementation and focused verification complete; current-candidate CI
and packaged acceptance remain pending. This is not full Core completion.
New plugin/Builder development remains outside this increment.

## Problem and implementation

Previously, uninstall removed artifacts before registry soft/hard removal. A
process crash or lost database response in between could leave the registry
pointing to a missing package, without durable evidence of the removal intent.

Core `ae16542383fa5a6e80d30e3d87680d4f2583f819` now records that intent and
quarantines the plugin in a database transaction before deleting artifacts.
Product startup reconciles pending removals before bundles/loadAll. The record
survives hard deletion and supports retry after lost responses. Exact package
identity/path/version/manifest and data-removal policy must still match. New
activation, upgrade and same-key reinstall are denied while removal is pending.

Cleanup continues through the existing Workspace drain, exact tracked-worker
close, scoped maintenance permit and owned-path classifier. Shared npm cleanup
still requires the exclusive maintenance window. Caller-owned local checkouts
remain preserved. Unknown or changed packages are preserved, not swept by age.

Migration0177 adds one Host-private table. Prior schema objects are byte-equivalent
as structured snapshot data; only the new table is added. Generated SQL, snapshot
and journal match their copied DB build artifacts. Hard uninstall does not
cascade-delete its intent. Backup restore marks pending intents cancelled while
preserving history, so another Host cannot replay the original deletion paths.
No SDK/API payload, dependency policy or product startup deadline changes.

## Actual verification

- New lifecycle recovery11/11; existing cleanup/startup10/10. Store failure,
  cleanup failure, restart resume, lost hard-delete response, changed identity/
  path, unconfirmed closure, admission denial and data-policy mismatch covered.
- Existing install/upgrade/restart/start-fence selection38/38. After adding
  key/prepared-commit guards, private-npm file15/15. Overlapping runs are not summed.
- Real PostgreSQL journal suite6/6, without skips. Fresh DB applies all migrations
  through0177. Tests reopen the client connection, confirm durable intent and
  quarantine, enforce retry policy, preserve intent across hard deletion, verify
  transaction rollback/invalid-record rejection and cancel deletion on restore.
  Owned fixture shutdown/cleanup completed.
- Restore sanitizer12/12; migration safety/numbering checks, DB build and server
  typecheck passed. Existing historical migration-safety baseline is unchanged.
- An independent fresh-DB diagnostic also verified persisted reconnect/removal/
  restore behavior and confirmed cleanup. It measured57seconds for initialization
  plus migrations and67seconds through cleanup. The new PostgreSQL suite initially
  failed its30second setup budget; its setup allowance was calibrated to90seconds.
  Assertion/cleanup limits remain, and no product execution/exit deadline changed.
- New PostgreSQL file is in the existing serialized Core test list, not skipped.
  Normal and all-disabled startup assertions are retained.

The preceding Source3839eea push40838450558 completed18/18CI jobs successfully;
Sourcefebfd3e push40837834865 and PR40837843451 also succeeded. Those exact runs
precede this journal change and are not substituted for new-candidate CI.
Core PR27's external review-key configuration remains a separate known issue.

## Schema-aware upgrade failure follow-up

Core `d9ac43c9e164ed14887b1ece7edb28f99a5975fd` also addresses a separate
upgrade failure: plugin SQL migrations commit before worker startup, so failed
activation cannot establish that the previous code remains schema-compatible.
After entering activation with pending migrations, lifecycle now preserves the
new package pointer, records error status, attempts exact-close/runtime cleanup,
and reports `plugin_upgrade_data_recovery_required`. It never reactivates the old
package on that path. No-pending-migration and pre-activation failures retain
their existing rollback. This guard does not automatically restore a Host backup
or implement durable upgrade phase recovery.

Upgrade safety17/17 passed including4new controlled cases; final combined removal/
upgrade selection28/28 and server `tsc --noEmit` passed. These controlled lifecycle
cases do not claim a real database schema downgrade was tested.

Source0285ff7 CI blocked direct legacy imports in the new SPS-owned journal
service. The follow-up imports through the existing explicit compatibility facade;
the unchanged boundary check and3regression tests pass. In that same0285ff7 run,
Linux serialized3/4 job123349007577 ran the actual PostgreSQL journal suite:
6/6passed, no skips. Its log is retained separately from new-candidate results.
New full CI is still required after this follow-up.

## Remaining required work

Removal intent is now durable. Installation-stage recovery, durable upgrade/
activation rollback snapshots and safe previous-artifact retirement are still
unfinished. This implementation does not scan unreferenced directories or claim
power-loss atomic runtime-cache replacement. An older binary cannot interpret
pending journal entries; compatible rollback must preserve this state and avoid
resuming package mutations with that binary.

New-candidate full CI, rebuilt packaged Windows/runtime verification, unresolved
local Electron startup, independent signed data-preserving install/update/
rollback/restore and physical Host/Member/Runner qualification remain required.
Same-user workers remain process boundaries, not complete OS sandboxes.
