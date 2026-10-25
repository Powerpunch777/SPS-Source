# Native enrollment orchestration verification - 2026-10-25

Status: **implemented/source-tested internal foundation**, not enabled Native
LAN, actual Google/session enrollment, two-PC acceptance or signed release.

- Parent Source: `1cddbcf78cb6a78363230783dc72e29b6ff98478`.
- Core: `0955e8f6355915df15228e77ee74276daf65130c`.
- Public SDK: `d4d69208480fc618b2055378b85d183aea422d50`, unchanged.
- Desktop remains unreleased 0.4.137. Supported transport remains Tailscale.

## Implemented

Core migration `0167_absurd_loki` adds a public issuance record, one per pairing,
bound to Host/server/issuer pins, verified user, device-key ID, canonical CSR
digest and invitation expiry. It stores no full CSR, private key or raw secret.
Generated snapshot tests confirm existing tables are unchanged. Restore deletes
issuance records before pairings and Member devices and preserves non-authorizing
audit. Existing older Core restore deletes pairings, whose FK cascades this row;
this is not a blanket downgrade/support qualification.

The private enrollment service reuses the pairing transaction and wrong-secret
budget. Issuance reserves a single record, calls a trusted injected signer outside
the transaction and publishes only after revalidating the invitation and the full
reserved binding tuple. No invitation consumption or device grant occurs here.
An identical committed retry returns the same certificate without re-signing.
A different request conflicts. A changed reserved row is not overwritten.

The signer port accepts only Host/device/public CSR, explicit dates and a local
abort signal; no CA key is passed to Core. Its trusted implementation must verify
PKCS#10 signature/profile/key binding and report the exact canonical request
digest. Core additionally checks the returned leaf's Host/device identity, trusted
issuer chain, clientAuth-only EKU, P-256 key, requested validity and 90-day ceiling.
This service does **not** independently parse the CSR cryptographic signature.
Desktop's existing signing primitive performs that validation, but a production
Main-owned signer IPC/adapter has not yet been connected.

Signing limits are explicit, per service instance. The timeout bounds the signer,
not the full database operation. Ignored-abort work retains its slot until it
settles. Failed/stranded signing records never automatically re-sign after a
restart; a fresh invitation is required. Automatic retention cleanup is pending.

Completion accepts only a real authorized, non-resumed TLS 1.3 socket and the
same verified user/invitation plus the exact committed certificate fingerprint.
The socket's certificate is not accepted from headers/body. The stored leaf,
not a caller replacement, is registered. Pending-device creation, invitation
consume and both audit writes commit together. Peer/leaf expiry is revalidated
after awaited writes so expiry during a blocked insert rolls back all effects.
Only pending state is created: no Host approval, Workspace membership, Plugin,
Node, CLI, Agent or Source permission is granted.

These are internal trusted operations, **not authenticated endpoints**. A future
ingress must supply the current user from a revalidated real SPS session. The DB
verified-user flag alone is not session authentication. No listener, route, RPC,
SDK method, Main signing channel, issued-credential file transition or new UI is
enabled. The normal Core listener remains HTTP and cannot supply this TLS proof.

## Verification

From `external/sps-core`:

```text
pnpm exec vitest run server/src/__tests__/sps-native-enrollments.test.ts server/src/__tests__/sps-native-pairings.test.ts packages/db/src/sps-native-enrollments-schema.test.ts packages/db/src/post-restore-sanitizer.test.ts
pnpm typecheck
pnpm build
pnpm --filter @paperclipai/db typecheck
```

- Four focused files: **40/40 pass**, no skips. Includes **12** new orchestration
  cases, **12** retained pairing cases, **7** schema/migration/disposable-Postgres
  cases and **9** restore-sanitizer cases.
- Real temporary PostgreSQL, OpenSSL-generated test keys/certificates, loopback
  TLS sockets only. Generated keys are fixture-owned; no customer material.
- Issuance retry/restart, no consume before TLS, concurrent single consume,
  fake socket/body replacement/wrong user/pin/request, invalid account,
  wrong-secret budget, signing failure, concurrent reservation, revoke during
  signing, exact-issued-leaf binding, ignored-abort slot retention, revoked-key
  resurrection, changed persisted tuple and final-write expiry rollback covered.
- Whole Core typecheck/build and DB typecheck/migration safety pass. Build retains
  existing CSS/annotation/large-chunk warnings; this is not a UI cleanup claim.
- DB agent separately ran schema/restore/migration-safety tests **41/41**; this is
  a different set, not 41 extra orchestration cases.
- Fresh production audit still blocks on held Zod High `1243066` (no exception)
  and reports two Low findings. No dependency change or major-migration approval.
- Full new-revision Linux CI and packaged E2Es remain pending after push. Previous
  Core `c30687dc` green Linux results do not qualify this new Core revision.

## Windows CI follow-up

Source `1cddbcf7` runs `40183986226` and `40183990969` finished failure. Windows
job `121140772485` failed five new wrapper unit probes with `0xC0000142`
(DLL initialization failed); one descendant probe returned static phase error.
This is **not** a successful elevated-runner repair. The Native/Settings/No-AI
steps were skipped in that job. Earlier real DPAPI evidence remains scoped to
Source `425000cb`, not substituted for this revision.

The new CI-only helper supplies a random private window station + desktop with
explicit current-user/SYSTEM ACLs when permitted. On a non-admin caller unable
to create a named station, only an owned private desktop is created within its
existing station. Existing OS-object ACLs are never modified. Original station/
desktop are restored; owned close results are checked after Job cleanup. Static
phase and decimal/hex exit diagnostics distinguish native initialization failure
from test failure; the failure code still propagates.

Local wrapper **8/8** and Desktop **715 total / 714 pass / 0 fail / 1 explicit
8.3-alias skip** pass. The local non-admin private-desktop path is exercised;
the elevated private-station path and the suspected `0xC0000142` cause remain
unproven until new exact-HEAD CI completes. No rerun was requested solely for an
observation timeout. This is not product privilege isolation or an installed-app
change. [Prior CI observation](../current/NATIVE-CI-OBSERVATION-2026-10-25.md).

## Remaining

Next: narrow Main signer channel and lifecycle/authority fencing, authenticated
pinned bootstrap transport, Member issued-credential persistence and fresh mTLS
completion, then Host-only zero-Plugin approval/revoke/recovery UI and full ingress
HTTP/WS/subresource checks. Actual LAN listeners/firewall and real two-PC trials
still require separate user confirmation.

Core main/independent review, all new-revision CI/security gates, Identity
production rollout, code signing and the same final signed installer bytes on
two actual Windows PCs remain release requirements. Native LAN stays unsupported.

Parent implemented/integrated/tested the Core service. Luna xhigh handled disjoint
schema/migration/restore and TLS fixture slices, independent race/expiry review
and Windows CI helper work, with quota/network retries. No tool-enforced Fast
claim is made.
