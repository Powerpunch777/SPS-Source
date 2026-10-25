# Native Member pending-key file storage verification

Date: 2026-10-25 KST. Status: **private file adapter source-tested; app enrollment still unwired**.
This extends the [credential/capsule checkpoint](NATIVE-MEMBER-CREDENTIAL-VERIFICATION-2026-10-25.md).

## Revision Scope

- Parent Source: `d3ddbaaa5270d4288a9a177a093e55d185d1c5d5`.
- Core: `c30687dcf734cb61805978e1f6f60529fa9259d2`, unchanged.
- Public SDK: `d4d69208480fc618b2055378b85d183aea422d50`, unchanged.
- The enclosing Source commit and PR #14 identify the new file adapter.
- Desktop source remains unreleased `0.4.137`; Native LAN stays off and supported
  product remote transport remains Tailscale. No installed runtime was changed.

## Implemented File Adapter

`native-member-pending-store.mjs` persists the existing encrypted capsule under
application userData, in `native-connectivity/member-pending`, outside the Owner
Vault. Both ancestor/descendant overlap with the known Vault location is refused,
including a missing Vault path. This is not a Node identity, Workspace artifact,
exported Host credential or general Plugin filesystem API.

The logical slot is an opaque SHA-256 of Identity issuer, account subject, intended
Host and device-key ID. Server/issuer pins are deliberately not used to choose a
different filename: changing a pin must fail the encrypted-context check rather
than silently create or adopt another key. Different account/Host/device contexts
cannot adopt a copied encrypted capsule. Context must come from the trusted caller;
the store does not turn caller-supplied account/pins into authentication evidence.

The API is limited to presence inspection, read and first-writer creation. It has
no overwrite, automatic migration, repair, rotation, approval or deletion method.
Presence does not decrypt or create directories. Existing corrupt files, directory
slots, symlinks and other occupied slots cannot be replaced by create.

Reads are bounded, strictly decoded and revalidate encrypted context plus actual
key/CSR correspondence. File handles, size, link count and file identity are checked
around reads. Creation validates the capsule round-trip before committing; writes
an exclusive temporary encrypted file; syncs it; and uses a no-replace hard link.
Concurrent instances cannot overwrite the winning identity. The temporary link is
removed only after exact linked-file checks. Directory sync is best-effort on
Windows, not a power-loss durability guarantee.

Root and storage-directory canonical paths and positive BigInt dev/ino/birthtimeNs
are rechecked during operations. Link/junction, non-directory ancestor, hard-link,
oversize and changed-directory cases fail closed. Temporary cleanup verifies its
owned path/file identity and never cleans through a replaced path. A crash during
the link/unlink window can leave an unusable two-link slot; there is no silent repair.
This does not provide an OS-wide lock, TPM attestation, same-user adversary isolation
or a persistent hardware/device identity merely from directory metadata.

A synchronous before-commit authority guard can cancel after asynchronous work and
before publication. It is not itself a login service: the future Main controller
must capture/revalidate current account, Host trust and requester lifetime. Unknown
callback errors, forged error codes and throwing code getters are normalized to new
static errors without private messages/causes. No callback code is treated as an
internally trusted error based only on its public `code` string.

## Isolated Windows Smoke Integration

The tracked real Electron smoke now uses the actual pending-key file adapter,
instead of manually writing its encrypted capsule. Its create/reload subprocesses
check one encrypted slot, identical Member key fingerprint, create-only refusal,
wrong-account non-adoption, changed-pin rejection and an untouched empty Vault.
The entire fixture is disposable and owned; no customer profile, key, OS trust,
firewall, Tailscale route or external listener is involved.

The current local Electron remains 43.7.7. The smoke correctly stops before crypto
because the lock requires 43.8.3. **The new file adapter therefore still requires
fresh 43.8.3 CI qualification.** Unit safeStorage adapters use AES-GCM and are not
DPAPI evidence.

At exact parent Source `d3ddbaa`, Windows job `121130316230` in
[run 40180490974](https://github.com/Powerpunch777/SPS-Source/actions/runs/40180490974)
has completed both the Native secure-storage subprocess step and Core Settings
step successfully. This qualifies the previous Host/capsule smoke at that revision,
not this new file adapter. Full workflow completion and raw safe result/version
readback must be checked separately; success of those steps is not a Stable claim.

## Verification

From `sps-server/desktop`:

```sh
node --test test/native-member-pending-store.test.mjs
node --test test/native-member-pending-store.test.mjs test/native-member-pending-capsule.test.mjs test/native-member-credential.test.mjs test/native-identity-integration-contract.test.mjs
npm test
npm run test:e2e:native-identity-storage
```

- Store tests: **15/15**.
- Focused store/capsule/credential/integration command: **36/36**.
- Full Desktop: **707 tests, 706 passed, zero failures, one explicit local 8.3
  alias skip**. The skip does not hide a cryptographic failure.
- Syntax and whitespace checks passed. Core and public SDK worktrees stayed clean.
- Local Native smoke fails closed at version mismatch, not accepted as DPAPI proof.

Tests cover real generated Member keys, encrypted bytes, empty Vault preservation,
first-writer concurrency, corruption, cross-context/pin/ciphertext non-adoption,
nonregular and linked paths, Vault overlap, canceled/async/forged callback errors,
directory replacement and static errors. Owned fixture cleanup checks canonical
containment and file identities; recursive cleanup is not applied to unchecked
computed paths or external symlink targets.

## Unfinished Integration

The private file adapter has no Main/renderer/HTTP/SDK callsite yet. It is pending
key storage, not an issued-certificate store, enrollment completion or a device
approval. Account logout, removal, revoked devices, installed-app reinstall,
explicit recovery and trusted-pin/issuer renewal still need their complete lifecycle.
The only current non-test caller is the isolated verification script.

Next, pinned Host verification and current SPS user authentication must be bound to
standard live mTLS key possession and atomic one-use pairing/pending registration.
CSR authorship alone is not fresh mTLS proof. Issuance/registration must not create
Workspace membership or Node/CLI/Source grants, or revive a revoked device.

Native ingress/full HTTP-WS-resource authority, Host approval/revocation/recovery UI,
Tailscale-free Source, current CI/Windows No-AI, unapproved Zod High remediation,
Identity rollout, Core main/independent review/protection, signing and identical
final signed bytes on two Windows PCs remain required. No release was published.
