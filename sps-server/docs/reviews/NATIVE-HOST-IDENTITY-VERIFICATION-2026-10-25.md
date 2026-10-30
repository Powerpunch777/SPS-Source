# Native Host identity foundation verification

Date: 2026-10-25 KST. Status: **inactive source foundation, isolated Windows secure-storage smoke**.
This is not a Native LAN launch, enabled settings feature, installed-app acceptance,
physical two-PC result, or signed-release qualification.

Historical foundation checkpoint: current Settings and restore integration is
recorded in the [subsequent lifecycle review](NATIVE-SETTINGS-RESTORE-VERIFICATION-2026-10-25.md).
The unconnected-callsite statements below describe this foundation revision only.

## Approved Policy And Scope

D6 remains one hour and one successful registration per invitation. D7 approves
90-day server and Member-device certificates, a separate 365-day issuer CA,
pre-expiry renewal for still-approved identities using the existing key, explicit
trust/approval for changed or lost keys, and no renewal for revoked devices.
Normal renewal should not require periodic login or invitation repasting.

The policy helper requires an explicit clock and returns whole X.509 seconds.
It rejects unknown kinds, invalid clocks and expiry outside the supported X.509
date range. Generation accepts explicit dates; the helper does not generate keys,
change approvals, renew certificates, or enable LAN. Renewal timing and the
issuer/pin rollover protocol are not implemented by these constants.

Baseline Source: `f56cf5f21abe2fb0303c98bd1bc5c22a1f816bcb`.
Baseline Core: `4ef9ea5904998d04eae92a45d8553a1d75aa39da`.
Retry-test fix: `47596897c`; Storybook patch / final Core: `c30687dcf734cb61805978e1f6f60529fa9259d2`.
SDK: `d4d69208480fc618b2055378b85d183aea422d50` (unchanged).
The enclosing Source commit and generated [candidate document](../current/CURRENT-CANDIDATE.md)
identify the final Core/SDK pins. Desktop remains unreleased source `0.4.137`;
Tailscale remains the only supported product remote transport.

## Implemented

- Node WebCrypto generates two independent ECDSA P-256 keys. A self-signed
  non-CA leaf is serverAuth-only with explicit SANs; a distinct self-signed
  issuer is constrained to path length zero and certificate/CRL signing. The
  server leaf is never reused to issue Member credentials or as a Node signer.
- Bounded canonical PEM, exact data-only schemas, curve/signature algorithm,
  Host subject, self-signature, private/public correspondence, allowed extension
  profiles and containing validity windows are checked before accepting a bundle.
  SAN arrays cannot execute accessors or a supplied iterator. The certificate
  size limit matches the existing invitation envelope.
- Structural recovery inspection permits an expired stored bundle, while a
  separate current-validity check refuses its operational use. Public status
  contains fingerprints and dates, not private keys, PEM or local paths. The
  status `identity_prepared` does not claim connection, device approval or readiness.
- A Windows-only store requires Electron safeStorage with no plaintext fallback.
  Its encrypted envelope binds canonical userData and Vault contexts. Storage is
  outside the Owner Vault export tree, and overlapping Vault/credential roots are
  refused. A copied ciphertext cannot be adopted by another slot or context.
- Creation is first-writer/create-only, including for an already corrupt slot.
  Ciphertext is synced before a no-replace hard-link commit. Linked directories,
  symlinks/junctions, hard-linked slot files, oversized/noncanonical files,
  decryption failures and invalid bundles are denied without secret diagnostics.
- The tracked Windows smoke launches two separate Electron processes: create,
  then reload. It uses real safeStorage, verifies identical public fingerprints,
  checks no plaintext private key on disk, and leaves the empty test Owner Vault
  unchanged. Only an owned temporary fixture is removed. No customer profile,
  OS certificate store, firewall or LAN listener is used.
- The Windows verification workflow runs this smoke explicitly. Existing SDK
  synchronization is retained for the new Electron acceptance command.

Certificate generation uses pinned `@peculiar/x509` 2.2.0 (MIT) and
`reflect-metadata` 0.2.2 (Apache-2.0). Production dependency declarations, original
package licenses and an application asset notice are present. Installed-ASAR
license retention must still be checked when a fresh package is authorized.
OpenSSL remains a test-fixture tool elsewhere, not a runtime prerequisite here.

## Verification Commands

From `sps-server/desktop`:

```sh
node --test test/native-connection-policy.test.mjs test/native-identity-certificates.test.mjs test/native-identity-profile.test.mjs test/native-identity-store.test.mjs test/native-identity-integration-contract.test.mjs
npm test
npm run test:e2e:native-identity-storage
npm run docs:security:check
npm run audit:release
npm run audit:development
```

The initial smoke runner incorrectly awaited Electron readiness while its ESM
entry was still loading. It timed out and was not counted as passing. Pre-ready
path configuration now runs synchronously and the Electron phase does not block
entry evaluation; create and separate-process reload subsequently passed.
The first full Desktop run caught missing public-SDK synchronization in the new
script; the command was corrected rather than weakening that existing contract.

Observed results on the final source changes before commit:

- Focused policy/certificate/profile/store/integration suite: **35/35**.
- Complete Desktop unit/contract suite: **607/607**, no skips.
- Real secure-storage smoke: create and separate-process reload passed using
  the existing local Electron **43.7.7**; its owned fixture was removed.
- Core focused retry/pairing/device/transport suite: **59/59**. The test-only
  retry cleanup fix also passed five isolated repeats and its entire file, 28/28.
- Core all-workspace typecheck/build, Storybook 10.6.2 static build and compatibility boundary: passed.
  Existing CSS, annotation/deprecation and large-chunk warnings remain; no UI
  visual acceptance or existing token-gate failure is waived by those builds.
- Production and full-graph release audit policies: **blocked by Zod High 1243066**;
  no exception was added. The remaining two Low advisories are visible, not waived.
- Desktop lockfile audit alone: no reported vulnerabilities. This is a lockfile
  result, not proof that an already-running development process was upgraded.

The lock now selects Electron **43.8.3**, Undici **7.30.1/6.29.1**, fast-uri
**3.1.9** and Core Storybook **10.6.2**. The corresponding new Critical/High and
Moderate warnings disappeared from the lockfile audits. The stale sprintf-js
1241202 review was removed rather than silently retained. The running user
development process and its existing node_modules were not replaced; a clean
installation/CI must exercise the patched graph. An attempted local isolated
runtime download/extract/smoke command was rejected before process creation by
the tool policy; it did not produce patched-runtime evidence or temporary files.
The tracked smoke now reports the actual Electron/Node versions and requires the
runtime to match the lock, so an old binary cannot qualify the new dependency.
The 43.7.7 result must not be cited as a 43.8.3 acceptance result.

The preceding exact Source `f56cf5f` CI run
[40173866566](https://github.com/Powerpunch777/SPS-Source/actions/runs/40173866566)
completed all nine Linux Core shards and full typecheck/build, but overall failed:
Zod security policy and Windows No-AI startup were red. The latter's completed log
confirms PostgreSQL refused the administrative runner token. A sibling run also
exposed a detached scratch-cleanup event racing test teardown; the test now waits
for that persisted completion event instead of sleeping or skipping assertions.
Core [40173746702](https://github.com/Powerpunch777/SPS-Core/actions/runs/40173746702)
passed at the old 4ef9ea5 revision; separate Dependency Review was unsupported.
None of these old runs qualifies the new enclosing commit.

## Limits Before Activation

No Main/preload/renderer/SDK callsite activates these primitives. There is no
Member credential issuance, proof-of-possession enrollment adapter, current-Host
identity registry, authenticated Native ingress, UI preparation/renewal flow,
or global rotation/revocation lifecycle in this change.

Keys are software-exportable before DPAPI protection. JavaScript strings are not
guaranteed zeroized; this is not TPM/non-exportable key attestation or isolation
from malicious code running as the same Windows user. Test AES-GCM adapters are
only unit fixtures; real Windows secure-storage evidence is the separate smoke.

A crash between hard-link commit and temporary unlink leaves a two-link slot.
Reads fail closed and creation does not replace it. Explicit authenticated recovery
and crash-injection coverage are still required; no silent repair is claimed.
Directory sync is best-effort where Windows does not support it, not a blanket
power-loss durability guarantee.

Backup omission alone is not restore safety. A restored Host must not reuse a
stale credential slot at the same Vault path or revive previous pairings/approvals.
The store must be connected to Host creation, restore, logout/ownership and
identity-generation lifecycle before product activation. The Core restore sanitizer
already clears device and pairing trust; it does not itself manage this Desktop slot.

The existing TLS probe pins the exact certificate as well as its public key.
Even a same-key renewed leaf needs a validated trust-record update protocol;
automatic acceptance of different certificate bytes is not implemented or inferred.

Current security and release failures remain real gates. The Zod 3 major migration
is still explicitly on hold, with no High exception. New Electron/build-tool
findings are patched and re-audited separately, not dismissed as dev-only.
No signing, installed-app replacement, Identity production rollout, external LAN
test, public release or support-matrix transport change was performed.

## Next Integration

Connect the protected Host identity to the zero-Agent/zero-Plugin Native settings
and restore lifecycle, then implement Member key generation/issuance and actual
session-bound pairing over authenticated TLS. Preserve separate Workspace,
Plugin, Node/CLI and Source authorization. Only after explicit network consent
should a dedicated default-off Native ingress be exercised on two Windows PCs.
