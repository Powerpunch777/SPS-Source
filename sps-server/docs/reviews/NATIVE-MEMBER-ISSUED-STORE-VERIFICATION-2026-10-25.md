# Native Member Issued-Store Verification

Date: 2026-10-25 KST. Status: **implemented/source-tested private storage foundation**.
This records the issued-certificate companion to the [pending-key store checkpoint](NATIVE-MEMBER-PENDING-STORE-VERIFICATION-2026-10-25.md).

## Revision Scope

- Parent Source/Desktop checkpoint: `7311041b`; this record describes its follow-up.
- Core: `ed45c51c`.
- Public SDK: `d4d6920`.
- Core and SDK worktrees were clean when inspected. The containing Source commit
  identifies the issued capsule, store integration, smoke updates and new tests.
- This is not a release, product-enrollment or Windows CI acceptance record.

## Issued Companion

`native-member-pending-store.mjs` retains its original pending-key file and adds
`createIssued(issuance, { beforeCommit })` and `readIssued()`. The issued record is
a separate `${slot}.issued.json` companion in the existing protected
`userData/native-connectivity/member-pending` directory; the existing `${slot}.json`
key slot is not rewritten. Both methods use the store's serialized operation queue.

The logical slot remains bound to Identity issuer, account subject, Host ID and
device key ID. Server and issuer pins remain authenticated context, not filename
inputs: a changed pin cannot create a replacement logical identity or silently
adopt the old capsule. A missing issued companion returns `null`; creation without
the matching pending key fails. An existing issued file without its pending key is
corrupt. A different account/Host/device logical slot is simply absent, while a
pin mismatch against an existing slot is rejected.

`native-member-issued-capsule.mjs` accepts the exact Core projection
`{ enrollmentId, certificate, issuerCertificate, expiresAt }`, where both
certificates are bounded canonical base64url DER and the date is canonical ISO.
The encrypted inner record contains only version, kind, trusted six-field context
and this issuance projection. It does not copy the pending private key or CSR and
does not store pairing secrets. On creation and re-read, the capsule reconstructs
the certificate DTO and calls the existing credential validator using the pending
key and the trusted context issuer pin. Validation binds the leaf to that key,
Host/device, issuer chain/pin, client-auth profile and current leaf/issuer dates.
The result is a frozen `{ issuance, credential }`; private key material is returned
only as part of the credential to its trusted Main-side caller.

An invitation's `expiresAt` is retained as issuance metadata, not treated as the
Member certificate's validity interval. Tests show an expired invitation timestamp
can be read while the leaf and issuer remain current. Expired or malformed leaf
credentials remain rejected. No trust pin is learned from the certificate reply.

## File And Lifecycle Checks

The issued writer reuses the create-only path: exclusive temporary file, bounded
encrypted envelope, file and directory identity checks, no-replace hard-link
publication and pending-key snapshot rechecks. Tests preserve the pending key
bytes/inode and store-directory identity across issue, restart/read, duplicate,
denied-guard and two-independent-store race cases. One concurrent writer wins;
the other receives the existing-slot error. Root-owned test cleanup verifies its
canonical temporary root, inode identity and in-root link targets before removal.

Malformed/tampered envelopes, wrong Host/key material, account/Host/device and pin
scope changes, missing-key orphan capsules, symlink/hardlink/directory occupants,
store-directory replacement and asynchronous guards are covered. AES-256-GCM
fixture encryption exercises the injected safeStorage contract only; it is **not
Windows DPAPI evidence**.

One behavior remains operationally important: `createOnly` invokes the synchronous
`beforeCommit` guard again after the issued file has been published. The test makes
the third guard call fail and confirms the operation reports `FAILED` while the
create-only issued file remains readable. There is deliberately no rollback,
overwrite or deletion. Therefore a `FAILED` result at this point is ambiguous about
publication; a caller must inspect `readIssued()` before deciding what happened,
and must not blindly retry creation because the existing companion will not be
replaced. This is the reviewed result/error contract, not filesystem transaction
rollback or remote enrollment success.

If the store directory is renamed/replaced during a write, cleanup deliberately
refuses to follow the replaced path. Its encrypted `.pending-*.tmp` can remain in
the renamed original directory. No automatic search, deletion through a new
directory, or recovery is attempted. This is a bounded encrypted local residue,
not a promise of complete cleanup under concurrent local path mutation.

## Transport Boundary

The two transport tests use Node's TLS server/client bound to `127.0.0.1` and an
ephemeral test port. They demonstrate a fresh, authorized TLS 1.3 handshake using
the reloaded certificate and its original pending private key, and rejection of
that readable local credential by a newly generated Host identity. The second case
models the new-Host trust boundary; it does not execute the Owner Vault restore
workflow. The tests do not perform pairing completion, database registration,
approval, grants, renewal or a product listener request.

No external LAN, firewall, customer key/profile, UI, product listener or grant was
used. No automatic enrollment or recovery path is established by this storage
adapter.

## Verification

From `sps-server/desktop`, the parent reran:

```sh
node --test test/native-member-issued-capsule.test.mjs test/native-member-issued-store.test.mjs test/native-member-issued-transport.test.mjs test/native-member-pending-store.test.mjs
```

- Focused result: **37/37 passed**: issued capsule 9, issued store 11, loopback
  transport 2, existing pending store 15.
- Full Desktop `npm test`: **761 total, 760 passed, 0 failed, 1 skipped**. The skip
  is the pre-existing local 8.3 alias fixture, not a failed test reported as a pass.
- The Windows secure-storage smoke is blocked before crypto: installed Electron
  `43.7.7` does not match the locked/required `43.8.3`; the smoke exits at its
  runtime-version preflight. No new Windows CI run has qualified this companion.
- Consequently, AES fixture success and loopback TLS tests do not establish actual
  Windows safeStorage/DPAPI operation, product mTLS enrollment or LAN readiness.

The parent reviewed the patch and a separate Luna read-only store audit found no
pending-key overwrite or duplicated private-key/CSR defect. Both explicitly
retained the publication/cleanup limitations above. Generated candidate/security
documentation checks pass. Fresh `audit:release` remains blocked on held Zod High
`1243066`, without an approved exception; Low `1119438` and `1241206` remain reported.

Prior Source `7311041b` push `40190150149` and PR `40190154379` CI each completed
16/18 jobs successfully. Nine Linux Core shards and the full Linux typecheck/build
passed. Windows real Native safeStorage (pending key only), seven Settings modes,
No-AI source and packaged Workspace surface passed; packaged Preview failed during
real Assistant form registration, before Preview lifecycle acceptance. The PR run
also failed its later PostgreSQL cleanup confirmation timeout. The held Zod audit
is the other failing job. Core `ed45c51c` PR run `40190064373` passed 15/15 jobs.
Those exact prior revisions do not qualify this new companion; no release claim
is made.

The parent additionally ran `npm run test:e2e:plugin-preview` in an isolated
source Desktop profile: the real Assistant form registered two independent
folders, Builder handoff/feedback and isolated Preview lifecycle passed, and
owned PostgreSQL/process/temp cleanup completed. This used local Electron
43.7.7 and the checked-out Core, not the locked 43.8.3 packaged candidate. An old
materialized package also existed, but development Host selection explicitly
passes no packaged runtime roots; mere archive presence is not loaded-Host
provenance. This source success neither repairs nor supersedes the separate
packaged-CI Assistant registration failure.

## Packaged Preview Failure Follow-Up

The failure is not yet assigned a root cause. The harness now stops promptly if
the real registration form reports `Internal server error`, retaining the same
dashboard/Agent-name success assertion rather than waiting out the roster timer.
A failure-only helper reads at most 64 KiB from an at-most-8 MiB `server.log`
under the harness's exact temp profile. It rejects symlink/junction/hardlink and
directory/file identity changes, performs strict UTF-8 decoding, and returns at
most five structured errors. It never returns raw messages, stack, URL, request
headers/body or arbitrary error type/code: only fixed type/code/category and a
message SHA-256. Only known POSIX/module and explicitly listed SQLSTATE codes
are returned. Missing/unstructured/unreadable logs give a static diagnostic
state, not a fabricated explanation or a successful E2E result. A tail can miss
an earlier error, so capture is not guaranteed.

The existing catch no longer redistributes child stdout/stderr or screen
URL/title/body text; it drains the pipes, emits only document-ready/server-error
booleans, and fingerprints rather than reprints the original exception. This
change is limited to that failure path, not a claim that all test tooling or OS
process output is a complete privacy sandbox. Path rechecks are best-effort
JavaScript filesystem checks, not an atomic OS directory-handle boundary.

Focused diagnostics/contract command:

```sh
node --test test/preview-e2e-host-diagnostics.test.mjs test/plugin-preview-desktop-e2e.test.mjs
```

Result: **7/7**. Final `npm test` with the diagnostic changes passes **767 total /
766 pass / 0 fail / 1 pre-existing skip**. These checks do not qualify the packaged
Preview route. The next exact-HEAD Windows CI must test the issued companion and
packaged app together.

The isolated source Preview E2E was rerun successfully after the initial helper
integration and before the final failure-output tightening above. Happy-path
UI/Preview and owned cleanup passed again. The final failure-only tightening is
covered by the focused helper/contract tests and final full suite, not a claimed
new packaged or deliberate server-failure E2E success.
