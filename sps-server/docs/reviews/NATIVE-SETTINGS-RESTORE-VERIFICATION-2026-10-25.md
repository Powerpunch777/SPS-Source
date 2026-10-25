# Native Core Settings and restore lifecycle verification

Date: 2026-10-25 KST. Status: **source implemented and tested, Native LAN off**.
This supersedes the integration status, not the historical results, of the
[Host identity foundation review](NATIVE-HOST-IDENTITY-VERIFICATION-2026-10-25.md).

## Revision Scope

- Parent Source: `9c3c145abc536fa9add5d6e6f5f87fc7d2b6d404`.
- Core: `c30687dcf734cb61805978e1f6f60529fa9259d2`, unchanged.
- Public SDK: `d4d69208480fc618b2055378b85d183aea422d50`, unchanged.
- The enclosing Source commit and PR #14 identify these implementation changes.
- Desktop remains unreleased source `0.4.137`; supported remote transport remains
  Tailscale. No new installer was produced or installed.

## Implemented Boundaries

Core Settings has a narrow Native identity preparation operation. Only its trusted
top-level local renderer can request it, and Main verifies current local Host
ownership, a current SPS Identity session, and an affirmative native confirmation.
The confirmation defaults to Cancel. Authority and requester lifetime are checked
again after asynchronous work and immediately before the create-only store commit.
The Workspace, remote Member and Plugin preload bridges do not expose preparation.

Preparation accepts one private IPv4 or IPv6 ULA certificate address. It does not
prove that an interface owns that address. Interface selection and verification
belong to later listener activation. No automatic key generation occurs on load,
status refresh, sign-in, or simply opening Settings.

The approved D7 defaults are applied to preparation: server certificate 90 days,
separate issuer CA 365 days. Member certificates will default to 90 days when
issuance exists. No Member issuance or automatic renewal is implemented here.
Current, expired and corrupt existing identities are never silently replaced.
The public Settings DTO contains only state, fingerprint and expiry, with LAN off.
An absent slot with a valid new Vault is `not_prepared`; unavailable storage is not
misreported as a new slot. The form is hidden without current Host authority.

The unreleased store envelope is now v2. Its encrypted context also binds positive
BigInt `dev`, `ino` and `birthtimeNs` for the Vault directory. Deleting and recreating
the same path does not adopt the previous identity. Old v1, corrupt or linked slots
remain present and cannot be decrypted, migrated or overwritten automatically.
Presence inspection can reject restore even if the original Vault is missing.
This is local lifecycle metadata, not hardware attestation or a same-user security
boundary. Actual Windows/filesystem qualification remains necessary.

Restore requires a fresh local Host, current login, no pending account switch and
proven absence of its Native credential slot. Unknown presence fails closed.
An unchanged existing remote Member connection is still compatible with restoring
a fresh local Host; this change does not silently prohibit that existing flow.
Captured account and routing context are rechecked before data promotion. A
process-local gate excludes Host starts and connection/account changes during
restore, including its asynchronous Host activation. Only the restore's private
permit may perform that activation, and it cannot activate a different account.
This is not an OS-wide lock or transactional filesystem rollback.

If activation fails after transfer promotion, the restored data is retained and
the error explicitly says so. It is not deleted as staging or described as rolled
back. Existing data and credentials are not auto-reset to make another import fit.
Member and pairing trust still require the existing Core restore sanitization.

## Verification

Commands from `sps-server/desktop`:

```sh
npm test
node --test test/native-restore-main-flow.test.mjs test/owner-vault-operation-gate.test.mjs test/native-identity-store.test.mjs test/native-identity-controller.test.mjs test/native-identity-smoke-diagnostics.test.mjs test/owner-host-activation-contract.test.mjs test/preload-contract.test.mjs
npm run test:e2e:core-settings
npm run test:e2e:native-identity-storage
npm run docs:candidate:check
```

- Complete Desktop unit/contract suite: **654/654**, no skips.
- Focused controller/store/restore/gate/diagnostic/compatibility suite: **75/75**.
- Real source Electron Core Settings: all seven fresh/corrupt/recovery/deferred
  modes passed, including layout, local font, disabled unauthorized preparation,
  LAN-off status and no Native credential-directory creation. The existing local
  runtime was **Electron 43.7.7**, not the locked **43.8.3**. No security confirmation
  was accepted by automation. These tests do not establish a real logged-in
  preparation or two-PC result.
- The secure-storage smoke now emits only allowlisted phase/stage/error codes
  and actual Node/Electron versions, never raw exception text, keys or paths.
  Review caught a top-level ESM `whenReady()` deadlock in the diagnostic edit;
  the non-awaited Electron entry was restored and regression-checked.
  The subsequent local run correctly failed with `electron_version_mismatch`:
  actual Electron 43.7.7, Node 24.21.0, required Electron 43.8.3. It did not qualify
  v2 DPAPI storage on the patched runtime. Only owned temporary fixtures were used.
- The authoritative storage smoke rejects an environment-selected executable;
  only the installed locked dependency may run it. A fake process cannot supply
  success reports through that former override. Deferred filesystem coverage also
  revokes requester authority between binding checks and verifies no slot commit.
- Generated candidate-document check passed. Core and SDK worktrees remained clean.
- Production dependency policy was rerun: blocked by unapproved Zod High
  `1243066`, with the two existing Low advisories visible. No exception was added;
  the generated dependency-security document check passed.

The exact parent Source CI run
[40175609939](https://github.com/Powerpunch777/SPS-Source/actions/runs/40175609939)
has completed all nine Linux Core shards and full typecheck/build successfully,
but failed Windows Native secure-storage smoke and the Zod security policy gate.
Its subsequent Windows No-AI steps were skipped, not passed. The old Windows
No-AI administrative PostgreSQL-runner failure remains a separate open concern.
Core PR run 40175522247 passed 15 jobs at the unchanged Core revision; the separate
Dependency Review remains unsupported. None qualifies this enclosing Source HEAD.

## Remaining Gates

No Native listener, firewall rule, OS certificate-store modification, customer-key
operation, Tailscale change, installed-app replacement or production Identity
deployment was performed. LAN approval is not inferred from certificate policy.

Member key generation/issuance, session-bound proof of possession and one-use
pairing transport, default-off authenticated ingress, complete HTTP/WS/resource
authorization, explicit credential recovery, renewal/pin/issuer rollover, and
Tailscale-free Source access remain unfinished. The existing Node/CLI and Source
grants must remain separate from Member-device approval.

Fresh patched-runtime CI, the unapproved Zod High migration, unprivileged Windows
No-AI qualification, independent review/Core main/protection, Identity rollout,
code signing and the same final signed bytes on two Windows PCs remain required.
These source tests and development UI observations do not waive those gates.
