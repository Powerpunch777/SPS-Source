# Legacy Program Residue: Native Foundation

Scope is the user's confirmed, data-preserving, explicitly acknowledged
withdrawn0.4.86 recovery. This is not a completed installer feature or an
automatic fallback. No real local installation or registry was modified.

## Trusted Package Inventory

Sourcebe40e0c guarded hosted job124428171626 generated the exact pinned-package
inventory after old install0/340517ms. Capture5909697bytes has SHA-256
`dc41392de7ff7390a396a898f352cbc6883072d5a8b5203c780294720a872322`;
the owner observed natural Job closure. Only relative original-package names,
sizes/hashes and the pinned installer digest were uploaded privately. Download
artifact13029076121 (workflow41164222114/attempt1) was independently bounded,
decoded and re-encoded canonically against the complete content-tree digest.

The checked-in gzip is1313545bytes/SHA-256
`35834b4d078b72938ea9b2149933cd05356c6398c2ae8b873b927a781a52dfd7`.
It records29314files/3051directories, with29237files under the original expanded
runtime. The loader accepts only those compressed and raw bytes and canonical
structure. The importer refuses a different source or overwrite. This is
package metadata, not original executable code, a user backup or newly trusted
execution of the dirty/unsigned/withdrawn binary. Provenance and limits are
also recorded beside the asset. The two-day temporary Actions artifact is not
the sole retained copy.

## Windows Library

`VerifiedResidue.cs` is a library, not a public executable or authorization
entry point. Before calling it, installer integration still must bind the real
per-user old registration/target/process state and backed-up target consent to
this immutable catalog. It must not trust arbitrary caller inventories.

The library opens each target ancestor without delete sharing, verifies the
expected root file identity and rejects protected top-level user/system roots.
It traverses only known runtime residue, rejects reparse entries/hardlinks/
named streams/read-only files, and retains original object handles without
write/delete sharing. Known size and SHA-256 must match before confirmation.
It bounds depth, entry count (4096 residue objects) and total bytes (4GiB).
Unknown or changed content fails before deletion; a declined or throwing
confirmation performs no deletion and disposal releases locks.

After confirmation it rechecks handle identity, canonical paths, streams and
directory membership. Deletion uses `SetFileInformationByHandle` on the exact
open objects, files first and directories deepest-first. It never recursively
deletes a caller pathname, follows a junction, kills a process or elevates.
A newly inserted unknown entry after the last census can make later directory
removal fail, but is never itself deleted. Failure after known-file removal is
not an atomic rollback; product UI must report uncertainty/remaining residue,
not success. The same-user threat-model and original-package allowlist remain
distinct from a hostile-code OS sandbox or general filesystem security claim.

Win32 references: [CreateFile sharing and reparse flags](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew),
[handle disposition](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle),
[stream enumeration](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-findfirststreamw).

## Actual Local Test Evidence

The C# test-only executable is compiled into a newly owned direct TEMP child.
The Node owner checks canonical containment, plain ancestors and root device/
file/birth identity before recursive fixture cleanup. It never executes NSIS,
reads SPS user data or edits an installed profile. Every rejection scenario
first proves the corresponding untouched baseline opens successfully, avoiding
a generic early-failure false positive. A parent review found and removed an
initial unrelated directory in that fixture before accepting negative results.

The19 actual Windows scenarios pass: approved deletion and outside sentinel;
decline; throwing confirmation; unexpected/changed file; wrong digest; replaced
root; root/file rename locks and release; greater-than260-character paths;
hardlink; file ADS; junction; insertion during confirmation; an existing writer;
write denial during confirmation; directory ADS; read-only file; root junction;
protected root read-only rejection. Native20/20 plus catalog2/2 passed locally.
The initial positive fixture exposed an over-escaped final-path prefix check;
the implementation now verifies the explicit local extended-drive prefix.
No production refusal was weakened to make a negative test pass.

## Still Required

Compile/package a standalone recovery helper with the pinned catalog, bind its
old target to actual per-user registration before ordinary Windows uninstall,
retain that identity while the user uninstalls, require backup and exact-target
confirmation, verify no remaining registration/process, then run this library.
Cancellation, unknown content and any unconfirmed cleanup must stay nonzero or
cancelled. Silent updater errors still never display or start recovery. Verify
the real helper UI and same-byte current reinstallation in the guarded clean
hosted VM, including unchanged AppData/Host Vault/project sentinels. Original
ordinary-uninstaller residue remains a recorded failure, not a waived gate.

Full local final `npm run test:ci` with the native library/catalog and Workspace
readiness follow-up exited0: serial observer2/2; remaining245files1783total/
1780pass/three unavailable-8.3-alias skips/zero failures. Aggregate1785total/
1782pass/three skips. This is not a hosted native UI or full recovery pass.
