# Host-Reviewed Plugin Artifact Cleanup

Status: user-approved policy; allocation/inventory, private preparation/Registry/
Worker references, Core-only composition and process-local activity admission implemented.
Desktop-composed references, cross-process fencing, API/confirmation/removal/Settings
remain pending. 2026-11-01 KST.

The Host sees a cleanup list in Settings and explicitly selects and confirms
unused old Plugin execution packages. No automatic artifact retirement is
authorized by this policy. This does not authorize cleaning any current user
installation during development.

## Boundary

Core owns package references, pending operation journals, maintenance fencing
and tracked Worker closure. Desktop owns its private Registry staging/index
and the local Host settings surface. Do not add workflow Tasks, Agent roles,
AI decisions, a public Marketplace or a new general-purpose filesystem API.

Keep the existing package uninstall behavior. This tool only retires SPS-owned
execution artifacts whose absence of references can be proved. Plugin data,
database state, backups, credentials, logs and caller-owned local checkouts are
not cleanup candidates. A recognized directory name alone is not ownership.

## Required Protection

- Preserve the committed packagePath of every retained Plugin record, including
  disabled, pending-review and softly uninstalled records that retain a path.
- Preserve both previous and candidate artifacts of every pending operation;
  invalid or unreadable journals block cleanup rather than imply no references.
- Preserve explicitly retained rollback/review stages and active install,
  update, rollback, restore, preview or developer-package operations.
- Preserve artifacts referenced by tracked package and Workspace Workers,
  starts or uncertain termination. Stops require actual closure, not a DB status.
- Never remove external local checkouts, shared legacy npm roots or unknown
  paths through this tool. Existing dedicated maintenance rules still apply.
- An old stage's label or UUID is insufficient to prove all directory contents
  are SPS-owned execution files. Require a previously verified file inventory
  or reverified original archive; packages without that provenance stay protected.
- Reject links/reparse entries, changed identities, escaped paths, duplicate
  selections, foreign Host/profile scope and unknown package ownership.

## Implementation Sequence

1. Add a read-only inventory composed from existing Core Plugin/journal/Worker
   sources and Desktop Registry metadata. Inspect declarative metadata only;
   never import a package to discover its identity or references.
2. Return a bounded list with package identity/version, size and protected or
   eligible reason. Opaque scoped IDs replace absolute paths at the UI boundary.
   A missing or incomplete source returns unavailable, not an empty safe list.
3. The Host selects exact eligible entries and confirms the list and total size.
   Bind that confirmation to the account, Host/profile, inventory fingerprint
   and captured filesystem identities. A changed list requires a fresh review.
4. Reenter the existing package maintenance/mutation fence. Reread all reference
   sources and check current ownership immediately before removal. A lost
   authority, changed reference, uncertain process or failed recheck stops the
   operation and preserves the artifact. Do not trust the earlier UI snapshot.
5. Remove only the selected, still-eligible owned artifacts. Keep a bounded
   technical audit result, refresh the list, and accurately report partial
   failure. Never state that Plugin data was removed or that cleanup succeeded
   before filesystem removal is confirmed.

## Acceptance

- Real current/pending/rollback/active-worker artifacts and external sentinels
  survive list generation, cancelled confirmation and rejected deletion.
- Current references added after preview, lost Host authority, replacement
  directories, junctions, missing DB, malformed journals and concurrent package
  operations reject under the real mutation fence.
- Only selected genuinely unused artifacts are removed; unaffected package
  bytes, data and credentials remain unchanged after restart.
- Settings is Host-only, includes loading/unavailable/empty/partial-failure
  states, and is exercised in the actual isolated Desktop UI.
- API/SDK compatibility is preserved; there is no public SDK arbitrary-delete
  permission and no automatic background collection.

## Separate Recovery Evidence

Runtime-cache rename-crash tests do not establish Plugin SQL activation crash
recovery or general artifact collection. The two runtime tests currently
preserve old/staging copies and sometimes an abandoned lock. Their outcome
must not be relabeled as implementation of this manual cleanup tool.

## Implemented Foundation

Core `491794820c23f956912d69eba271c1ef07ba36a1` records only newly allocated
Core-owned npm install and prepared-upgrade UUID roots. Exclusive private
allocation/verified records bind storage and root identities, package identity
and complete regular-file inventories. Observation never imports code or grants
deletion. A copied record, fabricated ticket, replaced root, link or incomplete
record is not cleanup authority. Existing linked storage and unavailable record
stores keep normal installation behavior without cleanup ownership.

The five focused Core suites passed35/35; server typecheck and compatibility
boundary passed. This is not full Linux or packaged acceptance of this Core SHA.
Old packages and Desktop Registry stage folders do not acquire retroactive
ownership merely because their names match. No existing user package was moved
or removed; no cleanup API or Settings list is present yet.

Desktop additionally preserves extraction bytes once Registry registration has
been entered: a lost response cannot prove the server did not commit its path.
Known pre-registration validation rejection still cleans its own extraction.
The focused Registry/transfer/bundle/controller/cross-device-fixture selection
passed34/34; this does not establish a live database crash or two-PC lease test.

## Read-Only Follow-Up

Ownership `listAllocatedIds()` now reads the existing private record directory
without creating it, returns allocation-only and paired IDs, and rejects unknown
names, orphan verification, links/hardlinks, oversized entry sets and changing
identities/membership. IDs alone do not certify current bytes or grant cleanup.

The actual Core Worker manager now captures a private immutable launch path and
owner ID for each registered handle before startup. Its optional private reader
keeps Host/Workspace, starting, stopped-but-restartable and uncertain-close
references; ordinary HTTP diagnostics and the public SDK gain no file paths.
Only the path is frozen, preserving the original behavior of other startup
options. The caller must resolve those paths and recheck every source under the
future shared fence. This does not implement that fence, eligibility, deletion
or the Settings screen.

Focused Worker reference, closure and ownership tests include actual Node
start/stop/restart and controlled uncertain-close cases. The ownership observer
uses actual owned temporary files. Final exact-tuple CI and complete Settings
acceptance remain separate requirements.

Core follow-up `673466ea3dce0512adae59f8f00bc5b4ba8aa9bc` contains this read
model. The final combined ten-file selection passed90/90 (31 ownership/inventory,
59 Worker), with no skips. Typecheck and build of all30 Core workspace projects
passed locally. No artifact removal or existing user package mutation occurred.

## Preparation And Registry Follow-Up

The next read-model increment retains loader upgrade preparations before their
first await, unresolved allocations, returned candidates, actual commit inputs,
and uncertain original/attempted paths. A normal lifecycle return is not treated
as a commit or abandonment. A generic scoped-release experiment was removed
after review; typed abandonment/review handoff and durable restart reconstruction
remain unfinished. The existing lifecycle coordinator itself is unchanged.

The Registry stage service now has a separate strict private reference reader.
All staged, pending-review and registered roots remain references, including
missing managed package paths. Reads create no files/imports, reject malformed,
duplicate, unknown-field, nonregular/linked, oversized or changing indexes, and
are limited to8MiB/10,000records. Only the current pretty-JSON writer spelling
with optional BOM/LF/CRLF/final newline is accepted; ordinary list/write paths
retain their existing behavior. Windows case aliases are supported only with
matching plain-directory identities in both original and canonical ancestries;
missing descendants stay protected. Unsupported paths remain unavailable, never
silently omitted from cleanup protection. Actual 8.3 coverage is skipped when
the filesystem supplies no short alias.

The final fourteen-file selection passed151 tests with one unavailable-8.3 skip
(152 total). All30 Core workspace typechecks and the full build passed locally.
This is not final packaged or full Linux acceptance of the new Core revision.

These read-model additions by themselves do not supply the actual Settings list, a coherent reference
snapshot, cross-process Preview protection, shared non-draining maintenance
fencing, review-bound confirmation or removal. They are not complete cleanup
acceptance and do not authorize touching existing user packages.

## Non-Draining Admission Follow-Up

The next Core increment connects a process-local activity/maintenance coordinator
to the actual Worker manager, runtime loader, lifecycle/recovery, Workspace
adapter preparation and Registry-stage writers. Activity is admitted before its
first await. If any activity exists, maintenance rejects without draining or
waiting; during maintenance new activity/start attempts reject, while existing
Workers retain their process and read-only references remain observable.
Results and errors propagate unchanged and both lanes release in `finally`.

Authorized Registry enable and ordinary upgrade cover the whole route, including
gaps between preview, Registry lookup, lifecycle and stage acknowledgement. This
is not a replacement for existing package journals or lifecycle drain policy.
It does not serialize ordinary writers against one another or grant deletion.
The complete app startup chain and direct configured-bundle bootstrap are also
admitted; a maintenance conflict cannot soft-uninstall the old bundle and then
deny its replacement. Existing per-bundle logging/continuation is unchanged.

The combined25-file selection passed348/349 with one unavailable8.3 skip. It
includes real owned Worker process preservation, startup/retained restarts,
HTTP admin/busy behavior, actual temporary Registry files and paused operation
boundaries. Bundle Registry callback tests are synthetic, not live SQL crash
acceptance. The initial integration exposed a route-parameter type error;
the route helper now retains its explicit parameter contract, without a cast.
All30 Core workspace typechecks and the full build then passed. Actual isolated
source Desktop no-AI acceptance passed real install/update and failed-init/
explicit rollback, state/events/Workspace jobs, A/B/capability separation and
Host restart. All3 owned Main exits and6 output streams closed normally; exact
temporary cleanup completed. It did not exercise the unfinished cleanup UI,
installed bytes, SQL crash windows, two physical devices or full descendants.

The coherent all-source snapshot, Desktop cross-process Preview/restore fence,
current ownership/inventory recheck, typed review/abandonment, fresh Host-bound
confirmation, actual removal and Settings UI remain mandatory and incomplete.
Unsupported custom Worker owners must not be treated as fully fenced merely
because the app created a fallback coordinator. Existing user packages remain
untouched. Sourceb2b/Core7952 hosted results do not qualify this newer code.

## Core-Only Composition Follow-Up

The private app reader now joins all Plugin rows, pending journals, completed
review-required old/candidate/backup records, actual Worker handles, preparation
and uncertain initial-install roots, and strict Registry stages. Completed
upgrade outcomes are validated before filtering; malformed/missing sources deny
the entire observation. Initial COMMIT-response-loss roots stay protected rather
than disappearing when the caller returns an error.

Reference snapshots run under Core activity exclusion, are frozen and expire on
return. Every source and original/canonical path identity is rechecked. Missing
paths remain protected and their appearance invalidates the observation. Links,
unsupported network/device roots or changed identities are unavailable. No
package code import, storage creation, public API, SDK permission, eligibility or
deletion is added. The app rejects a custom Worker owner lacking the real shared
coordinator/reference reader. The scope explicitly reports `core-only`, not full
Desktop/process coverage or a Host-approved cleanup ticket.

Explicit package paths are also consistent across Host, Workspace and Native UI:
only null/undefined uses retained legacy resolution. Empty/relative/invalid or
missing explicit paths cannot substitute a different old copy. New tests use
real temporary legacy copies; Native UI tests reproduced8 failures before the
correction and17/17 after it.

The final14-file selection passed253/254 with one unavailable8.3 skip; all30 Core
workspace typechecks/build passed. Actual source Desktop no-AI install/update,
rollback, state/events/Workspace Job, A/B/capability separation and restart
passed, with3 normal Main exits,6 ended output streams and exact temporary-data
cleanup. Focused journal DB/source callbacks are synthetic, not live SQL-crash
evidence. Desktop cross-process Preview/restore references, inventory eligibility,
fresh Host confirmation, removal and actual Settings UI remain incomplete.
