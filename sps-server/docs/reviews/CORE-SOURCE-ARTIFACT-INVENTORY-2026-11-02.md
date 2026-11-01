# Core Source Artifact Inventory

2026-11-02 KST. Core `bebc04f7bfa54ad25c8676ade61fafe1ab0c4e2e`.
Private metadata observation, not complete cleanup readiness.

## Implemented

The new read-only inventory covers all retained Workspace Sources and legacy
Host project shares plus their Node grants in the owned database. No selected
Workspace filter, active-only filter or revoked-grant omission is used. Four
explicit projections run in one repeatable-read, read-only transaction, each
bounded before materialization. The merged result is limited to4096 Sources and
16384 grants and6MiB canonical output. Reads create no records, import code,
inspect folders, contact SMB endpoints or change any Windows sharing settings.

The strict projector validates IDs, Source/grant Workspace correspondence,
duplicate identities/targets, supported UNC authority/share spelling, canonical
dates and plain data fields. Disabled Sources, unknown retained status labels
and revoked grants remain present. Accessors, sparse/oversized input, malformed
relationships, invalid dates/routes, unknown fields and unavailable DB fail with
a fixed technical error instead of a partial safe inventory. Stable sorting uses
codepoint comparison, not locale-dependent ordering; the returned data is frozen.

Only opaque IDs, status, hashed case-insensitive transport routes and revision/
revocation timestamps remain. Display names, user IDs, Host-local paths and raw
UNC routes are not returned; credential envelopes are not selected at all.
The fingerprint describes this metadata, not credential contents, Node authority
or complete filesystem references. No new DB columns, migrations, API, SDK
capabilities or permissions were added.

The actual `createApp` composition supplies this fingerprint to the private
Core artifact reader. Initial observation, checks and successful callback exit
re-read and compare it. Metadata changes invalidate the held reference scope.
The inventory itself is not added to parent IPC; its hash is bound to the
existing opaque artifact fingerprint. Existing private callers without this
optional reader retain their narrower behavior, not a claim of Source coverage.

## Verification

Bundled Node24.22.1 final six-file focused command passed55/55 with no skips:

```powershell
pnpm exec vitest run --project @paperclipai/server --no-file-parallelism --maxWorkers=1 server/src/__tests__/sps-source-artifact-inventory.test.ts server/src/__tests__/sps-source-artifact-inventory-db.test.ts server/src/__tests__/sps-plugin-artifact-references.test.ts server/src/__tests__/sps-plugin-artifact-parent-channel.test.ts server/src/__tests__/sps-plugin-artifact-parent-paths.test.ts server/src/__tests__/plugin-recovery-startup-contract.test.ts
```

Four tests use an actual isolated embedded PostgreSQL database: two Workspaces,
unshared/disabled Sources, routed Sources, project shares, normal/revoked grants,
no raw private values in output, unchanged rows after read, changed fingerprints
and invalid cross-Workspace grants. The actual reference reader plus DB rejects
a Source change inside its held callback, releases maintenance, and restores
its own test rows. Test database shutdown and temporary-root cleanup are awaited.

The14 pure projection tests cover deterministic ordering, frozen results,
preservation, per-field changes and fail-closed input. Early use of the wrong
Vitest project name (`server`) failed discovery, not product execution. A test
then found user-info-like UNC authority spelling was accepted; validation was
tightened before the final passing run. Early status/revision test variants also
changed route unintentionally; they were corrected to isolate each field.

`pnpm -r typecheck` and `pnpm build` passed across all30 Core workspace projects.
Build still warns about chunks over500kB; passing build is not bundle-size
optimization. Compatibility boundary passed. Shard partition tests passed5/5;
the new DB suite is explicitly serialized in the stable runner, not omitted.
Independent Luna privacy/bounds/determinism review found no actionable issue.
This is not a local or remote full-Core-test pass on the new revision.

Ignored local logs: `desktop/dist/core-source-inventory-final-tests-20261102.log`,
`desktop/dist/core-source-inventory-typecheck-20261102.log` and
`desktop/dist/core-source-inventory-build-20261102.log`.

The first Desktop `test:ci` run before committing the parent gitlink correctly
failed one baseline check: Source HEAD still tracked Coref8 while the updated
matrix required Corebeb. Remaining tests passed except three unavailable8.3
aliases. This is not an accepted whole-suite pass. Commit the gitlink/matrix
together and rerun the exact full selection; do not relax baseline validation.

Reference consulted, not copied code:
[Drizzle read-only transaction options](https://orm.drizzle.team/docs/transactions),
existing SPS Source/share schema and private artifact reader.

## Remaining Work

A before/after change detector is not a complete mutation fence. Source routes,
Node/device revocation, project/Workspace deletion and cascades still need
coherent coordination before destructive cleanup. The sanitized inventory also
still needs a private contract with Desktop's protected local mapping and share
state, including retained or restored handles without folders. Do not replace
that reconciliation with display-name matching, ordinary synchronization writes
or selected-Workspace HTTP listing. Never invent or relocate a local folder.

Main's result stays `cleanupReady:false`. Native restart/ambiguous-claim recovery,
ownership/inventory eligibility, fresh Host-bound confirmation, selective removal
and Settings remain pending. Final candidate Linux/Windows/Electron/installed,
SQL-crash/abnormal-loss, historical recovery, two-PC and full Builder AI/Runner
requirements are not waived. Existing user apps/profiles/AppData/Vaults, original
dirty checkout, external projects and Production were not modified.
