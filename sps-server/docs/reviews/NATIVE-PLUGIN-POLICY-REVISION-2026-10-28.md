# Native Plugin policy revision fence

Status: implementation present; actual DB-backed runtime validation remains
unproven after a setup timeout. This addresses continuity of
Plugin authority for an admitted Native request, not OS isolation or a new SDK
permission. Desktop remains0.4.137 development-candidate with Native opt-in.

## Product failure

Native Plugin authorization rechecked the current enabled state and captured
only the global Plugin version, manifest and update timestamp. A Workspace
disable followed by re-enable could restore all checked values while an older
Worker call was still held. Deleting a disabled override could similarly return
to the default-enabled state. Global config was not part of the captured Plugin
snapshot. Re-reading the final values alone therefore could revive old authority.

## Platform-owned correction

Core maintains two private durable equality fences:

- A catalog UUID revision rotates in the same transaction as Plugin or global
  configuration mutations. It covers additions, removals, manifest/status and
  dependency/conflict graph changes, including changes later reverted.
- Each Workspace has a private Plugin-policy UUID revision. Settings mutations
  rotate the old/new Workspace revisions; deleting an override or Workspace
  retains the revision row as a non-authorizing tombstone. Workspace creation
  and actual identity/status transitions establish or rotate the Workspace fence.
  A setting change in A does not rotate B's token.

The UUIDs are opaque comparison identities, not ordered counters or user grants.
Database triggers cover direct writes as well as existing route/registry paths.
Statement-level truncate handling rotates the catalog fence. The migration
backfills existing Workspaces, and post-restore sanitization rotates restored
tokens. Missing revision state fails closed, without legacy fallback or lazy
creation by a read request. Public Plugin/Workspace DTOs and SDK methods do not
include these tokens.

The Native runtime reads both tokens in one SQL statement before authorization,
then reads them again after its asynchronous availability, manifest, surface and
permission checks. The first accepted pair is retained for that request. Later
checks must match it, including worker Host callbacks, Native connectivity
observation and final result delivery. A change within a check or between checks
rejects the old request. A fresh request can use the new policy after current
authorization succeeds.

Catalog/config mutations conservatively fence all Native Plugin requests; a
Workspace policy mutation fences Plugin requests only in that Workspace. This
avoids missing newly introduced dependency/conflict candidates. It is not a
minimal dependency-graph optimization or per-Plugin execution grant generation.

## Boundaries and rollback

The existing session/device/membership/capability/activation checks remain
mandatory. This Plugin-policy fence does not establish persistent revision
tracking for every membership or permission mutation, process cancellation,
per-Workspace Worker memory, secret brokering or Windows sandboxing. Effects
already admitted before a policy change are not retroactively undone. No new
background poller, signal, timeout, execution profile or public capability is
introduced.

Existing data/config/settings are preserved. The additive tables and triggers
must be migrated with the matching Core. An older binary does not enforce this
Native continuity check; rolling back code can reintroduce the original gap.
Do not remove tombstones or replay backup tokens into a live runtime. Supported
restore remains the separately controlled Host restore flow and its sanitizer.
An administrative SQL owner can bypass triggers; this does not claim to isolate
untrusted same-OS-user code from database ownership.

## Verification plan

Use the existing isolated Native runtime DB fixture to hold a Worker call while
committing disable/re-enable, override deletion, or reverted global config,
manifest and status mutations. Require the old call to fail and a fresh call to
succeed. In the A/B case require B to continue while A is held. Cover transaction
rollback, settings-row retargeting and truncate-trigger behavior. Existing
availability/DTO assertions and restore sanitizer tests remain relevant.

Only terminal results will be recorded below. No whole local suite, physical
LAN, signed installer, real account or current release qualification is implied.

## Recorded results

The DB package compiled and the generated migration contained only the two
new authority tables plus the intended trigger/backfill SQL. Migration numbering
and safety checks exited0; the safety check retained20 historical baseline
findings. The focused restore sanitizer file passed10/10. The final server-only
incremental typecheck exited0 after the runtime and Identity changes.

Actual Native runtime run97714 exited1: the top-level support probe/import took
143.22s and the beforeAll hook then exceeded its existing120s budget. All15
cases were skipped; zero runtime assertions executed. Its log is
`core-native-policy-revision-test-2026-10-28.log` in the outer task work directory.
This does not prove the migration's trigger behavior, stale-call rejection or
fixture cleanup. No database retry or whole local suite was added. The existing
helper shutdown deadlines and failure-preservation rules remain unchanged.

After that failed run, the fixture hook was changed to retain and join its own
startup promise during teardown, then close its client and run the returned
fixture cleanup in nested finally blocks. The120s setup/60s teardown/5s client
drain limits are unchanged. A startup promise that never settles can still
outlive teardown; this change is not proven cleanup for the failed run. It was
reviewed statically and was not followed by another actual database run.
