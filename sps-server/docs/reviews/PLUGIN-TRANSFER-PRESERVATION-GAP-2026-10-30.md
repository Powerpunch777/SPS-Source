# Registry Plugin Transfer Preservation Gap

Reviewed: 2026-10-30, Source `a7e5859fdbad7ffcce500ac4349b1d9fb66be8ed` / Desktop 0.4.137 development
candidate, original Core `01fe9b16162fb8f6c0023e5efda30c1189094f10`, SDK
`61a929f6c783f78e5af603682de1543c7e24abc0`. This records a confirmed gap and
the subsequent approved correction. Integration qualification is still pending.

## Pre-Correction Behavior

- Actual Main export requests a whole-DB backup. The transfer copies that
  snapshot unchanged plus its existing allowlisted managed data directories.
- Plugin records, state, Workspace runtime configuration and artifact metadata
  are DB data; the sanitizer does not discard these as disposable credentials.
  It does retire pending package operations and rotate authority/config revisions.
- Desktop Registry package extraction uses `registry-staging/packages` inside
  the Owner Vault. That directory is not in the export/import allowlist.
- The DB can therefore retain an installed plugin and its old absolute
  `package_path` while the transfer omits the corresponding executable files.
  Rechecking a manifest's compatibility alone does not relocate those files.
- Local-folder plugins can also refer outside the Owner Vault; such external
  folders must not be silently read/copied or granted execution authority on a
  different Host. The old absolute reference is not proof of new-Host approval.

Relevant sources for the original diagnosis: `desktop/src/main.mjs` export/restore handlers,
`desktop/src/owner-vault-transfer.mjs`, `desktop/src/registry-staging.mjs`,
Core `packages/db/src/post-restore-sanitizer.ts` and
`server/src/services/plugin-loader.ts`.

## Evidence And Limits

The parent reviewed Luna's read-only finding against the production allowlist,
actual Main export/restore handlers and sanitizer. Normal and historical real
Main acceptance currently prove project/Workspace and managed attachment
preservation, not installed Registry package preservation. The separate actual
signed plugin lifecycle acceptance proves install/update/failing activation/
rollback/restart, but it does not cross a transfer/restore boundary.

This is an actual file-scope omission, not a report of lost production user
data. No installed profile, transfer or package was modified. Execution through
an old absolute path after restore has not been reproduced by the parent;
retain that as a risk to test, not an already demonstrated exploit.

## Approved Decision

The user was asked whether new Host transfer should:

1. Preserve SPS-managed Registry package bytes and data, with a new-Host review
   before execution; or
2. Preserve data only and require reinstalling the matching plugin package.

After clarification, the user selected preserving SPS-managed Registry plugin
data and package bytes, subject to new Host approval before any restored plugin
can execute. This applies to every restored plugin, including official bundled
copies supplied by the current app; bundled or bootstrap provenance is not an
approval exception. Disabled, uninstalled, and pending-upgrade records must
not auto-reactivate. Managed Registry records/data and package bytes are in
scope. Code in an external local-folder plugin directory is out of scope: do
not copy or execute it, and require the owner to reselect that folder on the
new Host. A transfer backup does not uninstall or change the original Host's
plugins.

New Host review covers plugin metadata, requested capabilities, and Host
compatibility, followed by explicit owner approval. It is not an external
security audit or a guarantee that plugin code is safe. Read and validate
plugin identity/metadata before importing its module: Node.js ESM `import()`
loads the referenced module and can execute its code ([Node.js ESM import
expressions](https://nodejs.org/api/esm.html#import-expressions)). This policy
requires no SDK, API, or schema change.

Future acceptance must cover every restored plugin class, including official
bundled copies; prove metadata is read before module import; verify managed
Registry data/package preservation, external-folder code exclusion and
reselection, disabled/uninstalled/pending-upgrade non-reactivation, explicit
new-Host approval, and restart behavior. Tests must distinguish data retention
from code execution and must not treat backup provenance as approval.

## Historical Implementation And Local Evidence (2026-10-30)

The following describes implementation and test evidence recorded on
2026-10-30 only. It is historical evidence, not qualification of the policy
above; in particular, it does not establish the clarified approval requirements
for official bundled copies or every restored plugin state.

Core `ee400bccc0258185e89fa01187336625d0eeb8b4` uses the existing soft-uninstall
state to retire prior-Host execution approval and clears all old package paths
inside the restore sanitizer transaction. IDs, manifests and durable plugin
data remain. The existing explicit Registry reinstall can recover the same ID
at a newly validated package path; no new lifecycle status or migration is added.
Focused sanitizer tests passed 15/15; the DB build, full Core build and all 30
workspace type checks passed. Existing CSS/third-party annotation build warnings
remain. These are not real Main package-transfer acceptance by themselves.

Source work adds a version-2 transfer, retains legacy version-1 reading, copies
only managed Registry package files, inventories their bytes, resets their
static stages to unreviewed local provenance and rebases only the copied index
before final Vault promotion. No publisher trust or source credentials are
implicitly migrated. Parent review required the actual Core array schema,
public static-manifest validation, exact stage identity, explicit field projection,
ancestor-link rejection, missing-index compatibility and environment-independent
inventory sorting. Those corrections are included; no speculative alternate
index format or regex-based credential stripping remains.

The actual Main acceptance at that time included a reviewed package and two
distinct Workspace data canaries. Its fixture manifest writes an owned marker
only when genuinely imported. The target must preserve exact package bytes,
keep that marker absent before new-Host review, recover the same plugin ID and
both data canaries only after explicit review, and retain them across restart.
The final local `node scripts/smoke-owner-vault-transfer-desktop.mjs` exited 0.
It reported `managedRegistryPluginTransferQualified: true`, natural Main exits,
complete output EOF, no fixture processes, and temporary-data cleanup. It used
the real Registry folder picker callback, signed public-SDK package creation,
the actual Host review UI and unchanged confirmation, Core install/worker and
actual Main export/restore/sanitizer/startup/restart. It did not patch approvals,
invoke a worker directly, or fake DB/package-path values. The Registry API's
intentional path redaction stays intact; the fixture checks its own bounded
Vault index separately for byte/path assertions.

The first two local attempts failed test assumptions, not accepted passes:
the Registry folder input is readonly and requires its native picker; and the
public stage response intentionally excludes `packageRoot`. The corrected
acceptance uses both existing production boundaries instead of relaxing them.

`node scripts/smoke-owner-vault-transfer-desktop.mjs --historical-core-backup`
also exited 0 with the exact pinned 157-to-176 schema evidence, both old projects,
storage file and restart. This ensures missing Registry indexes remain valid;
it does not seed a historical executable plugin or qualify installed old data.

Full Desktop `node --test --test-reporter=spec test/*.test.mjs`: 1640 total,
1638 pass, two environment-specific 8.3-alias skips, zero failures. The earlier
full run correctly caught stale VM dependency wiring and generated candidate
metadata before correction. Main-flow injection adds a failing-rebase case
that proves no config publication, receipt, promotion or Host activation.
The new transfer, existing transfer and acceptance fixture tests passed 25/25.
Fresh production audit: two Low, zero Critical/High, no exceptions.

At that time, exact new-HEAD hosted CI and installed-byte qualification remained
required. These historical results do not claim tests passed for the policy
clarified above.
The transfer inventory detects accidental changes, not an authenticated backup
signature. New Host review remains required even when all hashes match. No real
installed user profile or external plugin checkout was a test target.

## Hosted Follow-Up And Test Synchronization

Source `e189d575f3046585d316d9a23459810a7ee8a7dc` push run `41071168629`
failed two tests in Linux serialized shard 3/4: the real PostgreSQL package-
operation tests still expected status `error` after restore. The approved new
policy deliberately produces `uninstalled` and a cleared package path. Core
`258800f0d931932d855e275ed7cfab2c1bf0a080` updates those two stale expectations
and additionally requires unchanged plugin ID/key/version/manifest and retained
journal identity/snapshots. All 13 tests passed against actual temporary
PostgreSQL; production behavior and prior cancellation assertions are unchanged.

The same Source push's Windows source runtime-discovery test observed the new
Registry stage through Core before the renderer had inserted its review button.
It failed immediately with `not found`, rather than proving an activation bug.
The acceptance now uses the existing bounded polling helper to await the actual
enabled stage-specific review control before requesting/clicking its unchanged
confirmation. It still requires the same artifact/version and real UI action;
there is no direct lifecycle/approval bypass or increased timeout.

The combined actual source runtime-discovery acceptance exited 0 after that
correction: signed v1/v2 update, genuine failing-v3 activation rollback, exact-v1
Host-confirmed rollback, both Workspace states, simulated signed Node/Agent
descriptor/loopback model control, natural restart and all three Main exits/six
output EOFs/owned-data cleanup. It does not use a real model provider or external
Runner computer. The dedicated lifecycle/transfer fixture tests passed 5/5.

Separately, PR run `41071175798` for Source e189d57, Windows job `124115433184`,
completed its actual Main managed-plugin transfer step successfully at
14:33:55 UTC (started 14:33:06). The rest of the job was still live, and this
PR-run step is not a full workflow or new-HEAD installer qualification. The
exact new Source/Core pair still requires its own full hosted gate.
