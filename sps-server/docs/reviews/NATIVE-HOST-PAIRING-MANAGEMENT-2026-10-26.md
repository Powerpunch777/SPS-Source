# Native Host Pairing Management

Date: 2026-10-26 KST. Status: **inactive source-tested Core composition**.
Core `7d4698267317064ca48e1a04461c8ef115f79228`; public SDK remains
`d4d69208480fc618b2055378b85d183aea422d50`. Desktop remains unreleased 0.4.137.
Native LAN is still OFF / unsupported; the support matrix still requires Tailscale.

## Implementation

`createSpsNativeHostPairings` composes the existing pairing store with prepared
Host management. It does not create another store, credential or user mapping.
Host ID/server pin come from the configured management instance. The issuer is
derived only from its current SPS Identity Owner session and both per-launch
Desktop proofs, not a caller-selected actor, Workspace or legacy admin role.

The approved initial invitation is one hour and any verified recipient. Attempt
and active-invitation caps are required constructor inputs with strict data-field
validation; tests use explicit 2/4 values, not product defaults. Proposed 5/10
defaults are still unapproved. No URI, port or public code is invented while the
Native listener is off.

Storage `issue`/`revoke` accept an additive optional transaction authorizer, and
`listHost` has an additive guarded form. The Host facade always supplies the
captured real session guard before/after the transaction's work. Already-terminal
revoke responses cannot bypass that check. In-transaction denial rolls back
mutation and audit together. Existing trusted no-guard internal callers remain
compatible; the storage primitive alone is still not an authentication boundary.

Final delivery separately checks Main availability. A disconnect after commit
withholds the secret/result with the distinct 503
`native_pairing_result_unavailable`; it does **not** claim rollback or reset the
database. No automatic retry, second issue or secret replay occurs. An
undelivered secret is unrecoverable, and its pending row occupies quota until
expiry or a later authorized revoke. This is deliberate fail-closed delivery,
not exactly-once network delivery or atomic authority through COMMIT.

The new factory has no product startup caller, HTTP route, UI/preload/IPC entry,
public SDK method, schema/migration, Source grant or Node/Agent permission.
Pending enrollment, approval and Workspace membership remain separate.

## Verification

From `external/sps-core`:

```text
npx --offline pnpm@11.9.0 exec vitest run server/src/__tests__/sps-native-host-management-session.test.ts server/src/__tests__/sps-native-pairings.test.ts server/src/__tests__/sps-native-host-management.test.ts server/src/__tests__/sps-native-session-enrollment.test.ts server/src/__tests__/sps-native-enrollment-http.test.ts server/src/__tests__/sps-native-enrollments.test.ts server/src/__tests__/sps-native-parent-enrollment.test.ts server/src/__tests__/sps-native-parent-signer.test.ts server/src/__tests__/sps-identity.test.ts server/src/__tests__/sps-owned-shutdown.test.ts server/src/__tests__/openapi-routes.test.ts
npx --offline pnpm@11.9.0 -r typecheck
npx --offline pnpm@11.9.0 build
npx --offline pnpm@11.9.0 --filter @paperclipai/server typecheck
npx --offline pnpm@11.9.0 --filter @paperclipai/server build
npx --offline pnpm@11.9.0 exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --esModuleInterop server/src/types/express.d.ts server/src/__tests__/sps-native-host-management-session.test.ts
```

- Final focused suite: **11 files / 114 tests pass**. Pairing storage **19/19**;
  actual session management **12/12**, including previous cases.
- Actual temporary PostgreSQL and RSA-signed fixture SPS Identity sessions cover
  one-hour issue/redacted list/revoke, another real account, missing proof,
  Authorization substitution, actual logout after capture, and no Agent/Plugin/
  Workspace/membership/device creation.
- Post-write Main loss is simulated by disposing management during its final
  real-session check; rows/events roll back. Separate tests dispose Main only
  after an actual DB commit, then verify withheld 503, persisted rows/events and
  no transaction on the next denied call. No false rollback or retry is claimed.
- Whole-workspace typecheck/build and final server rechecks pass; strict test
  typing includes the required Express augmentation. Existing build warnings
  remain. The first isolated typing attempt omitted that augmentation and was
  not a pass; the final explicit command above is reproducible.
- Independent Luna review identified the post-commit ambiguity; the final code,
  tests and contract distinguish it. This is not independent GitHub approval.

The parent IPC inspector uses a test channel and public fixture metadata. These
tests do not qualify actual Desktop Main signing, Google OAuth, a network
disconnect, a Native TLS listener or two PCs. No real key/customer data, firewall,
OS trust, installed app/runtime or production service was changed.

## Related Desktop Acceptance

Exact Source `41462df` PR workflow `40220892467` failed Windows runtime-discovery
after restart: Core Settings was still loading when the harness clicked its
disabled Refresh devices button. The follow-up now waits for actual loaded Host
and identity-required device state plus an enabled control within the existing
45-second bound. No timeout extension, retry, skip or product permission bypass
was added. A source runtime-discovery app rerun exits 0 after the full No-AI
state/event/Job, A/B scope, simulated runtime/Agent observation, fake loopback
model, restart and independent Native recovery checks. This does not establish
hosted Windows qualification.

Desktop unit regression passes **837 total / 836 pass / 0 fail / 1 existing skip**.
Generated candidate documentation matches the new Core pin. Installed Desktop,
Tailscale transport and SDK pins remain unchanged.

The other Source `41462df` workflow `40220887751` also failed its packaged Preview
step after Assistant registration; the original error remains hashed and its
root cause is not established. Separate packaged-failure diagnosis remains
required. Follow-up Core workflow `40245581524` has now completed **15/15** on
exact `7d4698267`; this does not qualify Source packaged Windows or main/review.
The [bounded diagnostic follow-up](PREVIEW-FAILURE-DIAGNOSTICS-2026-10-26.md)
records the opaque CDP failure and a separately proven readiness hazard without
claiming a hosted root-cause fix. Exact Source CI, Zod High1243066 (held major migration), UI-token findings, Core main/review,
Identity production, signing and identical final signed-installer two-PC evidence
remain separate gates. No new installer was generated or published.
