# Native one-use pairing persistence verification

Date: 2026-10-25 KST. Status: **source-tested internal persistence only**.
This is not an enabled Native LAN endpoint, installed-app or physical-PC result.

## Policy And Revision Boundary

D6 is approved: anyone receiving the full code can request device enrollment
after Google/SPS sign-in. The default lifetime is **one hour**, consumed by the
first successful registration request. Final Host device approval and Workspace,
Plugin, Node/CLI and Source authority remain separate. Wrong-secret attempts are
not successful registrations. D1-D3, LAN off by default and D4's Source decision
remain intact.

The Desktop default request helper expresses this policy without authenticating,
issuing a code or activating LAN. Its actor ID must come from trusted signed-in
Host state, never a renderer field. Core requires explicit limits, target mode
and a trusted server SPKI; there are no implicit Core product-policy defaults.
The email-restricted primitive is tested but is not the selected product default.

Baseline Source: `44272e0533b5d5e26589be66864cd288c93ec737`.
Baseline Core: `f2260640cf5a33e1e7ab97193efa70b6c6d3753a`.
Implementation Core: `4ef9ea5904998d04eae92a45d8553a1d75aa39da`.
The CI fixes are a separate review commit, `31ff723cadd3955f2bf37c59ccd770f4b6f9eb6b`.
Final revisions are pinned by the enclosing Source commit/submodule and
[CURRENT-CANDIDATE](../current/CURRENT-CANDIDATE.md). SDK remains
`d4d69208480fc618b2055378b85d183aea422d50`. Desktop remains unreleased source
`0.4.137`, with Tailscale still the only supported remote product transport.

## Implemented Store

- Additive migration 0166 holds Host-scoped pairings and redacted history. The
  raw 32-byte secret and target email are never stored: the secret verifier binds
  Host ID/pairing ID/domain, and optional email digests use bounded ASCII,
  case-folding without dot/plus alias rewriting. Email hashing is not identity
  verification or anonymization. Secrets/UUIDs/digests reject alternate bytes,
  padding, trailing newlines and unsupported encodings.
- The service captures a trusted server SPKI and binds each row to it. An
  instance with another pin rejects the old invitation and does not adopt it.
  Issuance quotas are serialized by a Host-scoped transaction advisory lock.
  All policy limits are explicit; test values are not product defaults.
- A current verified auth-user row and the optional current email target are
  checked under a row share lock. This is a secondary consistency check, not
  authentication: the eventual caller must first validate the actual session.
  Wrong targets cannot spend someone else's secret-attempt budget.
- A wrong secret commits its bounded attempt count and rejection/exhaustion
  event before returning a generic failure. Missing, expired, revoked, exhausted,
  consumed, foreign-Host/pin and nonmatching accounts get safe failures.
- Consumption locks the invitation row, reuses a transaction-only pending-device
  registration primitive, and commits consumption/device/events together. Concurrent
  accepts produce exactly one successful effect. Replays do not create another
  device or revive a revoked certificate. Existing approved devices cannot consume
  a new registration invitation. A late deadline or event-write failure rolls
  back the device and invitation effects.
- A first-time verified account needs no existing Workspace membership to create
  this pending record. It receives no membership, Plugin/Agent/Node/Source grant
  or approved transport session. Existing membership-required HTTP device-request
  routes retain their checks and behavior.
- Host metadata is projected without secret/hash/email/certificate fields. Restore
  removes pairing state before device trust; event references become null while
  non-authorizing snapshot IDs remain. No user database was migrated.

## Explicit Limits Before Activation

No HTTP, RPC, public SDK, main/preload, Native UI or TLS ingress calls the pairing
store. There is no new external listener, firewall rule, OS certificate-store
change, persistent actual key or installed-app replacement. DB tests seed synthetic
verified users and public client certificates; they do not prove a Google login,
private-key possession or a complete Host/Member connection.

The server pin is constructor state, not a persistent global active-identity
registry. A still-reachable old-pin instance can still accept its old invitation;
rotation must retire old service instances/listeners before activating the new
identity. The test deliberately distinguishes these scopes. Global key rotation,
Host identity persistence, issuance/private-key storage and session revocation
still need implementation and lifecycle tests.

The exported transaction primitive is internal and trusts its Core caller. It
must not be exposed as a generic enrollment API. A future Native adapter must
authenticate the session, validate the actual TLS peer/device proof, bind the
current Host identity, constrain the bootstrap surface, bound time/concurrency
and rate limits, and offer recovery without Agents/Plugins. Only a confirmed
actual LAN test may activate external networking. D4 Source/SMB migration is not
implied by pairing; existing access remains unchanged.

## CI Findings Corrected In Separate Scope

Source run `40171976090` at the baseline exposed real execution, not billing-only
failures. Workspaces B observed empty proxy output after a child `exit`; the test
helper now waits for `close`, which includes stdio closure. Server 1/3 exposed a
model broker race: a settled cleanup tick was dropped while another sweep was
active. One pending bit now coalesces that demand without overlapping sweeps,
provider retries, input replay or claims of upstream cancellation. Its deterministic
DB-lock regression was red with the original guard and green after the fix.

Core run `40171821294` passed policy but failed Canary Dry Run because the private
off-train CLI was still compared with the public release version. The assertion
now derives applicability from the same trusted release plan. CLI build/payload
checks remain, and an enrolled CLI mismatch still fails. No release was executed.
These local fixes need new exact-HEAD Linux/canary evidence; old checks are not
relabelled as final success.

## Verification

Working directory: `external/sps-core` on Windows, Node v26.4.0.

```powershell
pnpm exec vitest run server/src/__tests__/sps-native-pairings.test.ts server/src/__tests__/sps-native-pairing-crypto.test.ts server/src/__tests__/sps-member-devices.test.ts server/src/__tests__/sps-member-device-routes.test.ts server/src/__tests__/sps-member-transport.test.ts server/src/__tests__/live-events-ws.test.ts server/src/__tests__/openapi-routes.test.ts packages/db/src/post-restore-sanitizer.test.ts packages/shared/src/validators/sps-member-devices.test.ts server/src/__tests__/private-hostname-guard.test.ts server/src/__tests__/app-private-hostname-gate.test.ts server/src/__tests__/sps-core-baseline-instance-admin.test.ts server/src/__tests__/sps-identity.test.ts server/src/__tests__/sps-model-broker.test.ts
pnpm -r typecheck
pnpm build
pnpm check:sps-compat-boundary
# Release contract tests require Git Bash on this Windows host:
$oldPath = $env:PATH
try {
  $env:PATH = 'C:\Program Files\Git\bin;' + $oldPath
  node --test scripts/release-lib.test.mjs scripts/release-package-map.test.mjs scripts/check-release-package-bootstrap.test.mjs
} finally { $env:PATH = $oldPath }
```

Results: **14 files, 127/127**, no skips; **32/32** release contracts; all 30
workspace typechecks, full Core build and compatibility boundary passed.
At the updated support-matrix/submodule pin, full Desktop `npm test` passed
**574/574** (including two D6 default-policy tests), no skips. Generated-candidate
validation passed. This does not mean the new policy helper is wired to main/IPC.
Git Bash syntax validation of `release.sh` passed. Build warnings remain.
An intermediate disposable-DB run during migration regeneration lacked the new
table and failed; only the fresh final-schema runs (42 and then 127) count.

The separate POSIX sandbox suite on default Windows PATH failed **11/27** because
`sh` was absent (16 passed). It was not skipped, relabelled or claimed as passing.
The stdio-close change requires fresh Linux CI proof. The default Windows WSL
`bash` shim was not a valid runner for release tests; only explicit Git Bash
results count. Test fixtures validate their owned canonical temp targets before
recursive cleanup. No permanent PATH, account or OS settings were changed.

Luna xhigh assignments supplied schema/crypto/DB tests, broker regression and
canary assertions; the coordinator implemented/reviewed consumption, transaction
reuse, strict byte validation, lifecycle limits and integration tests. This is
internal review, not independent release approval. No new dependencies or copied
third-party implementation were introduced.

Zod High remains unapproved/on hold. Native enrollment UI/TLS, current full CI,
Identity rollout, main/independent review, signing and identical-byte two-PC
installation/upgrade/restore evidence remain release blockers.
