# Native Member credential acceptance and pending-key protection

Date: 2026-10-25 KST. Status: **source-tested private primitives; product enrollment and durable Member store unfinished**.
This follows the [Member issuance review](NATIVE-MEMBER-CERTIFICATE-VERIFICATION-2026-10-25.md).

## Revision Scope

- Parent Source: `3725d99741b2dc079a68c87307b14994e2495134`.
- Core: `c30687dcf734cb61805978e1f6f60529fa9259d2`, unchanged.
- Public SDK: `d4d69208480fc618b2055378b85d183aea422d50`, unchanged.
- The enclosing Source commit and PR #14 identify this implementation.
- Desktop is still unreleased source `0.4.137`. Supported remote transport is
  Tailscale; Native LAN remains off. No installed app or runtime was replaced.

## Recipient-Side Certificate Acceptance

`native-member-credential.mjs` requires the original local key/CSR, exact issued
certificate DTO, expected issuer certificate, expected issuer SPKI pin and an
explicit current clock. The expected issuer and pin must come from a trusted
pinned-Host exchange, not be learned from the response being checked. This module
does not authenticate that exchange or a user by itself.

It verifies the fixed Host/device-key RDNs, local private-key correspondence,
P-256 and ECDSA/SHA-256, issuer name/signature/chain, current leaf and issuer dates,
90-day maximum validity inside the issuer interval, exact non-CA clientAuth/
digitalSignature extension profile, matching SKI and AKI, and no extra/duplicate
extensions. Server-purpose or CA credentials cannot be adopted as Member leaves.
Bounded complete DER parsing is now shared with Host certificates and PKCS#10,
without changing their public input contracts or purpose separation.

Validation returns private material only to its private trusted caller. A separate
inspection method returns a frozen public state/fingerprint/date DTO, with no
PEM, private key, paths, login identity, approval or execution grant. The state
`credential_prepared` does not mean approved, online or authorized.

Adversarial cases use real signed fixture certificates, not just malformed JSON:
different Host/issuer/pin/key/device, extra RDNs, unexpected and duplicate extensions,
wrong EKU/CA power, wrong SKI/AKI, expired/future or overlong leaf dates, malformed
PEM, invalid clocks and accessor/extra fields are refused with static errors.

## Pending-Key Capsule

`native-member-pending-capsule.mjs` serializes a local Member key/CSR using Windows
safeStorage encryption only, with no plaintext fallback. The encrypted context
binds the exact trusted Identity issuer origin, account subject, Host UUID,
device-key UUID and both server/issuer SPKI pins. A different expected context
cannot adopt the encrypted context merely because decryption succeeds.

The public serialized envelope contains only version, kind and ciphertext. Both
layers require exact canonical JSON and data-only schemas; duplicate/escaped/
unknown fields, invalid base64, failed decryption, malformed key/CSR correspondence
and unbounded values fail closed. Limits are 32 KiB plaintext, 64 KiB ciphertext,
96 KiB serialized envelope. Opening a capsule validates its key/CSR again.

This is **not a durable production file store**. It has no filesystem, renderer,
Main IPC, Node/CLI or network callsite. A later create-only slot adapter must retain
path/link/file-identity/authority checks, protect account/Host scope, keep pending
and issued records separate, avoid overwrites and support explicit recovery.
Pins and account context supplied by an untrusted caller would not become trusted
because they were encrypted. An opened capsule never approves a device or
resurrects revoked server-side authorization. JavaScript software keys are not
TPM/non-exportable or same-user-process isolation.

Unit AES-GCM adapters exercise the injected safeStorage contract, not Windows
DPAPI. The tracked Windows Electron smoke now also writes an encrypted Member
capsule into its owned temporary fixture, reloads it in a separate Electron process,
checks the same Member public key and wrong-account denial, and verifies no
plaintext key/CSR/account marker on disk. This test file is not the production
slot implementation. No successful patched-runtime run is claimed yet.

## Windows CI Evidence And Root Diagnosis

At exact parent Source `3725d997`, [run 40179004485](https://github.com/Powerpunch777/SPS-Source/actions/runs/40179004485)
completed all nine Linux Core shards and full typecheck/build successfully.
Windows job `121125806924` passed **668/668 unit tests and bootstrap E2E**, verifying
the preceding canonical fixture fix. Sibling job `121125815764` in run40179007508
reported the same Windows result.

Both Native storage steps then failed **before runtime-validation/DPAPI execution**:

```text
phase=create stage=root_validation errorCode=unsafe_smoke_root
Electron=43.8.3 Node=24.22.0 expectedElectron=43.8.3
```

Later Windows Core Settings and No-AI steps were skipped, not passed. The primary
run finished overall failure due to this Windows step and the Zod policy gate.

The synchronous child root helper now uses `realpathSync.native`, consistent with
the parent's native asynchronous realpath. Every ancestor still rejects symlinks,
junctions and non-directories; temp-parent containment and owned cleanup identity
checks remain. Static diagnostic codes now distinguish invalid root, invalid temp,
parent mismatch and prefix mismatch without exposing paths. **The old failure's
exact cause is not established by its coarse diagnostic.** This is a guarded
canonicalization correction and better diagnostics, not a claimed CI root-cause
reproduction or a waiver of folder checks.

Local helper cases pass for ordinary directories and actual symlink/junction
refusal. The optional test for a distinct Windows 8.3 alias is explicitly skipped
because this local filesystem did not provide one. No 8.3 coverage is invented.

## Commands And Results

From `sps-server/desktop`:

```sh
npm test
node --test test/native-member-credential.test.mjs test/native-member-pending-capsule.test.mjs test/native-member-certificates.test.mjs test/native-member-tls.test.mjs test/native-identity-store.test.mjs test/native-identity-smoke-paths.test.mjs test/native-identity-smoke-diagnostics.test.mjs test/native-identity-integration-contract.test.mjs
npm run test:e2e:core-settings
npm run test:e2e:native-identity-storage
npm run docs:candidate:check
npm run docs:security:check
npm run audit:release
```

- Full Desktop: **692 tests, 691 passed, zero failures, one explicit 8.3 skip**.
- Exact focused command: **70 tests, 69 passed, zero failures, the same one skip**.
- Host/Member certificate-profile/recipient/TLS command: **37/37**; pending capsule
  unit file: **8/8**. No actual cryptographic failure was skipped.
- Core Settings source Electron: all seven modes passed again using existing
  **43.7.7**, not locked **43.8.3**, with no accepted security confirmation.
- Local Native storage smoke fails closed at `electron_version_mismatch`, actual
  43.7.7/Node24.21.0 versus required43.8.3. It does not reach the new Member capsule
  or qualify Host v2/Member DPAPI. Customer profiles and the running dev app are untouched.
- Generated candidate/security checks and whitespace check passed. Production
  dependency policy is still blocked by unapproved **Zod High1243066**, with two
  existing Low advisories visible. No exception or held major migration was added.

Fresh CI for this enclosing Source is still required. Product Member key slots,
authenticated pinned first enrollment, atomic one-use pairing into pending state,
Host approval UI, Native ingress and full HTTP/WS/resource authority, explicit
recovery/renewal, Tailscale-free Source, unprivileged Windows No-AI, Identity rollout,
Core main/independent protection, signing and same final signed bytes on two PCs
remain unfinished gates. No LAN listener, firewall, OS certificate-store,
production deployment, customer key/data or installer/release mutation occurred.
