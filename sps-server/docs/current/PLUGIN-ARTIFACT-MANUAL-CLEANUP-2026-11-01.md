# Host-Reviewed Plugin Artifact Cleanup

Status: user-approved policy; allocation/inventory foundation implemented,
reference/fence/API/confirmation/removal/Settings composition pending. 2026-11-01 KST.

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
