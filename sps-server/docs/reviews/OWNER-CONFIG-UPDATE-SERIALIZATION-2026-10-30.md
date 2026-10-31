# Owner Host Config Read-Modify-Write Serialization

Date: 2026-10-30. Source correction; no installed configuration was changed.

## Observation

One full Desktop run failed the pre-existing concurrent config-save test. The
filtered reporter did not preserve that error's underlying cause. Its isolated
file and a subsequent full run passed. No NTFS timestamp, antivirus or permission
cause is assigned to that intermittent result.

A separate bounded diagnostic used the actual `updateSpsOwnerHostConfig` in an
owned temporary fixture for 100 simultaneous pairs of two distinct changes.
There were no exceptions, but **100/100 pairs lost one change**. The old test only
required either changed value, not both, so it could pass despite lost updates.
The helper read before writing with independent temp files; atomic JSON
publication alone did not serialize read-modify-write.

The delegated diagnostic's claim that product callers were absent was incorrect:
the parent verified Main uses the helper for staged restore rebasing and private
team enable/disable/rollback. A failed mock-barrier attempt omitted a filesystem
method; that TypeError is not a product defect or passing proof.

## Correction

Updates now queue by the existing Vault's canonical root (case-normalized on
Windows), using the same process-local Promise-queue pattern as Core recovery
settings. The config is read **inside** the queue, so each callback receives the
previous committed update. A failed operation still rejects its own caller but
does not poison the next queued operation. Different Vault roots remain
independent, and an older completion cannot delete a newer queue entry.

Existing exclusive temp creation, file/directory identity checks, fsync,
replacement rename and identity-bound temp cleanup are unchanged. Errors are
not retried or ignored as a successful save. The default filesystem dependency
includes canonical path resolution; existing filesystem test doubles can use
the real resolver for their owned test directories.

This is serialization of this module's explicit update calls in one Desktop
process, not a new cross-process filesystem lock, transaction across multiple
files, or automatic reversal of another operation. Initial config creation and
the existing Main/restore/Host authority gates remain separate. No permissions,
account ownership, SDK/Core API, Tailscale route or user data policy is changed.

## Verification

The focused config and serialization tests passed: **21/21**.

The post-correction actual-filesystem diagnostic retained both distinct config
field updates in **100/100** concurrent pairs. This is evidence for the tested
filesystem and one process; the queue remains process-local and is not a
cross-process lock.

The previous full Desktop run completed with **1,614 total, 1,612 passed, 2
environment skips, 0 failed**. It predates the current historical-exit-test
addition, so it is not a full-suite result for the current test set.

The isolated source Main smoke command, run from `sps-server/desktop`, was
`node scripts/smoke-owner-vault-transfer-desktop.mjs`; it exited **0**. It
exercised a real export, restore into a fresh Host, typed row and storage-file
checks, restart, and standalone cleanup. This is source-level smoke evidence,
not an installed-build or signing check.

These results do not establish installed-build behavior, signing, operation
between two physical PCs, or a whole external job. Exact committed-HEAD CI
remains required.
