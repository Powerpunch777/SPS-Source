# Legacy Runtime Replacement Preservation

Date: 2026-10-30. Scope: existing development/pre-archive materialization and
stable Node executable replacement. Not an installer downgrade feature.

## Reproduced Before Correction

Main still uses `materializeSpsOwnerHostRuntime` for the private development copy
and old pre-archive package compatibility. Its `moveDirectoryAside` caught a
failed old-target rename and recursively removed that target, then tried to
promote the candidate. If promotion also failed, the previous runtime was lost.
Even successful movement of the old target did not restore it on promotion
failure. The newer archive materializer already had separate rollback handling.

The parent reproduced the old behavior with actual files inside an owned
temporary fixture and injected `EACCES` rename failures. The observed output was
`legacyTargetRemovedOnFailedRename: true`, `oldRuntimeStillPresent: false`.
No installed or user profile directory was used.

The same module's stable Node updater deleted the old executable before renaming
its staged replacement. A separate actual-file fixture reproduced
`stableNodePreservedAfterFailedPromotion: false` when the rename failed.

## Correction

- A failed rename no longer authorizes deleting the previous runtime. Only
  `ENOENT` establishes an absent previous target. Windows sharing errors retain
  bounded retries; other errors preserve the target and propagate.
- If candidate promotion fails after moving the previous runtime, restore it
  only when the destination is absent. An unexpected destination is preserved.
- If rollback itself fails or is unsafe, an aggregate error retains both old
  and staged paths. Neither version is removed or reported as recovered.
- Staging-copy failure removes only the new stage. Previous runtime cleanup
  begins only after successful promotion.
- Stable Node and its metadata use replacement rename without deleting the
  destination first. Failed executable promotion preserves the old bytes and
  metadata; the existing hash check still decides cache reuse.

The stable Node and metadata renames are separate operations, not one atomic
transaction. If metadata publication fails after a successful executable rename,
the next attempt detects the mismatch and repairs it from the verified source.
No claim of power-loss durability or automatic schema/app downgrade is made.

The archive materializer, runtime identity checks, user Vault/database,
credentials, Core/SDK contracts, package approval and owned-process gates are
unchanged. Reference: [Node filesystem rename](https://nodejs.org/api/fs.html#fspromisesrenameoldpath-newpath).

## Verification

The delegated tests were reviewed by the parent and run against the actual
materializers with real fixture directories and narrowly injected filesystem
errors. They verify persistent rename refusal, successful rollback, rollback
failure retaining both copies, an unexpected replacement destination, bounded
transient retry, stable Node refusal preserving bytes/metadata, and normal
replacement/cache reuse. After successful rollback, an actual Node child executes
the restored fixture JavaScript and returns its expected output. This is not a
launch of an installed old SPS or a fake Node binary.

```powershell
node --test test/owner-host-legacy-runtime-recovery.test.mjs test/owner-host.test.mjs test/owner-host-runtime-package.test.mjs test/owner-host-activation-contract.test.mjs
```

These checks preserve the archive rollback/locking, Host start/stop and old
in-place/source runtime behavior. Final-HEAD hosted packaged and installer tests
remain required. Historical schema backup recovery is separately recorded in
[the database acceptance](HISTORICAL-CORE-SCHEMA-ACCEPTANCE-2026-10-30.md).

The focused command passed 59/59. A complete final Desktop run passed
1607/1609, with two environment skips and zero failures. One preceding full
run failed the existing concurrent config-save test; its isolated 16-test file
and the final complete rerun passed. The first command's filtered reporter did
not retain the underlying error, so no cause is assigned or fix claimed for that
intermittent result. It is a follow-up diagnostic, not silently erased evidence.
`git diff --check` passed. Installed apps, real Vaults and credentials were not
used or replaced.
