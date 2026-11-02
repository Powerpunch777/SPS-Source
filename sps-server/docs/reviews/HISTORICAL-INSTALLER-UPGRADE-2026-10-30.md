# Historical Installer And Desktop State Acceptance

Date: 2026-10-30. Development verification only, not Stable approval.

## Historical Input

The public `v0.4.86` release is titled **Withdrawn**. Its installer is a
historical compatibility input, not a trusted Stable predecessor:

- Repository: `Powerpunch777/SPS-Desktop-Releases`.
- Installer asset ID: `494984665`.
- Filename: `SPS-Desktop-Setup-0.4.86.exe`.
- Size: `225049104` bytes.
- SHA-256: `d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56`.
- Manifest Source: `68ff23eb024bcc84854c5b7d4663816dc7660b78`, dirty.
- Manifest Core: `95665eb49996cd0e9c13e2da817326dfffe0f2a3`, dirty.

The GitHub asset metadata and public manifest agree on installer bytes. Dirty
source provenance and the withdrawn signing status are not repaired by that
agreement. No existing installed SPS or real user profile is a test target.

## Installer Flow

`smoke-installer-data-preservation.mjs` now stages the fixed historical file only
after its hosted-Windows/owned-Job guard, empty-registry/process checks and
temporary-root validation. It rejects HTTP, stream size or SHA mismatch before
execution. A partial download is never an executable input. There is no
`latest` selection, arbitrary URL, local force flag or automatic downgrade.

On a disposable hosted runner it performs:

1. Fresh candidate install, exact package verification and isolated first frame;
   then ordinary uninstall with registry and data-preservation checks.
2. Historical per-user silent install into the owned temporary installation;
   verify historical registration and a different ASAR from candidate.
3. Candidate install into the same historical registered installation, without manually
   removing the old version first.
4. Verify exact candidate registration and five unpacked-package file hashes.
5. Launch the installed candidate using its isolated E2E profile.
6. Same-version repair, ordinary uninstall preserving data, and reinstall.

Nine opaque sentinels across the three known AppData aliases are checked after
each installer boundary. The withdrawn application's Main is not deliberately
launched; the no-SPS-process assertions remain mandatory. Only natural owned
Job emptiness can qualify the final pending-cleanup exit.

This new flow has not yet passed hosted CI. Its unit/launcher contracts pass
locally; local installer execution is deliberately refused. Even after a pass,
`previousStableUpgradeQualified`, `applicationDataMigrationQualified`,
`normalUserProfileStartupQualified` and `signedInstallerQualified` remain
false. Opaque byte preservation is not an old database/credential migration.

## Desktop State Migration

The separate `--legacy-desktop-state` source Main acceptance uses the exact
v11 field set from Source `68ff23e`'s `state.mjs`. It projects only a closed,
fixture-owned v13 profile. Unknown fields and nonempty new-only state cause a
failure rather than being silently discarded.

The account is created through the isolated fixture Identity and real Desktop
Main flow. Windows Electron `safeStorage` encrypts the fixture credentials. A
missing Node identity can be filled with a test-generated Ed25519 key encrypted
by the same real `safeStorage`; no Node ID, lease, grant or execution authority
is invented. No production account or key is used.

Current Main must recognize the existing account **without signing in again**,
persist v13 state, preserve account/device/connection identities, decrypt the
same secret/key digests, and retain the actual current-Core project row and
Vault file across two restarts. This is not proof that the old installed
Core's database schema migrated. The old-format state is a controlled fixture,
not data produced by running the withdrawn installer application.

Local commands on the updated worktree:

```powershell
node --test test/historical-installer-baseline.test.mjs test/historical-installer-flow.test.mjs test/initial-host-membership-recovery.test.mjs test/legacy-desktop-state-fixture.test.mjs
node scripts/smoke-owner-vault-transfer-desktop.mjs --legacy-desktop-state --owned-job-cleanup-pending
node scripts/smoke-owner-vault-transfer-desktop.mjs --crash-after-promotion --owned-job-cleanup-pending
```

The focused tests passed 11/11. Both actual Electron commands completed their
scenarios, removed their owned temporary data and returned exactly 76 (checked
by the caller). Legacy state migration preserved the same account/device route,
decrypted key/credential digests and typed Core project/file through two Main
restarts. These local delegated runs do not certify an external OS Job.

## Discovered Recovery Defect

Exact Source `bb70ad8` push CI `41036771824` passed all 17 non-Windows jobs and
the normal Main transfer, but the interrupted transfer failed after real Vault
promotion. `recoverInitialOwnerHostMemberships` requested a workflow `owner`
invitation with an agent message. Neutral Core permits only a technical human
Member invitation and correctly returned HTTP 400.

Both local and private-team membership recovery now request the existing
technical `operator` compatibility value and `agentMessage: null`. This does
not grant a workflow role or replace Host authority: local launch proofs still
authorize invitation creation, and actual signed-in Identity accepts it. Core
authorization was not relaxed. Behavioral tests cover the request, acceptance
without bootstrap proof, malformed tokens, pending acceptance and HTTP failure.

The corrected source crash acceptance has passed locally with the exact
intentional Main exit 71, retained original-account receipt, explicit reopening,
project/file retention and restart. It then returned delegated-cleanup exit 76;
this local command is not a whole-Job CI pass.

The same Source's PR CI `41036782486` separately failed at a 10-second CDP status
observation during Host creation. The matching push passed that stage. That
intermittent failure remains unqualified, not relabeled as a pass or fixed by
silently increasing its timeout. Both runs are terminal failures, not waits.

## Release Conditions

Historical installer replacement, legacy Desktop state migration, current-Core
DB retention, old-installed DB migration, ordinary default-profile launch,
signed final installer and physical Host/Member qualification are different
claims. Record each separately. Signing changes bytes and requires final
manifest/challenge/physical evidence to be regenerated for that exact file.
