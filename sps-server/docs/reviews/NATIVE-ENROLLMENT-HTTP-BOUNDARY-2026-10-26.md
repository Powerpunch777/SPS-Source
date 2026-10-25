# Native Enrollment HTTP Boundary

Date: 2026-10-26 KST.
Status: **inactive source-tested request handler; Native LAN unsupported**.
Core `0d306bd46a7d41622b056af9fa4f42e66720247f` is pinned by the containing
Source support matrix. SDK remains
`d4d69208480fc618b2055378b85d183aea422d50`; Desktop remains unreleased 0.4.137.

## Scope

The internal handler composes the existing session-enrollment adapter, pairing
store, certificate signer and transactional enrollment service. It does not
implement another invitation store, user mapping, signer or device registry.
It creates no HTTP/TLS server, mounts no existing Core route and is not called
by product startup. Only test servers bind ephemeral numeric loopback ports.
No customer data, live credentials, paid model, OS trust, firewall, installed app,
Tailscale/SMB route or production Identity service was changed.

The explicit internal v1 paths are:

- `POST /sps-native/v1/enrollment/issue`
- `POST /sps-native/v1/enrollment/complete`

All other paths, including queries, are rejected. This is not a general Core
proxy or public SDK API. The handler must receive the trusted, configured SPS
session adapter; arbitrary adapter injection is not a new authentication source.
There is no login/session-exchange endpoint in this increment.

## Request And Lifecycle Contract

The existing adapter requires an actual fresh TLS 1.3 IncomingMessage and the
single SPS Identity session cookie. Body/actor/Agent tokens do not select the
user. Browser-origin metadata and Authorization cannot substitute for a session.
These header checks alone do not prove that a caller is Desktop Main.

The handler requires one canonical positive Content-Length. Transfer/content
encoding, oversized header sets and all Sec-Fetch metadata are rejected. Body
buffers never exceed the configured cap. The private v1 body is strict compact
`JSON.stringify` UTF-8, with exactly the four operation-specific string fields;
duplicate/escaped duplicate keys, whitespace variants, UTF-16, malformed UTF-8,
BOMs, nested/extra fields and alternate selector fields are rejected. Future
Native clients must emit that encoding; this changes no existing Core/SDK wire
format. It is not a general-purpose canonical JSON standard.

Limits are mandatory constructor inputs, not product defaults:

| Limit | Accepted Range |
| --- | --- |
| Body bytes | 512..8192 |
| Body-read deadline | 100..10000 ms |
| Operation deadline after body read | 500..60000 ms |
| Concurrent admitted requests | 1..8 per handler |

Capacity includes body reads and actual adapter work. Timeout/disposal does not
start replacement signing or retry a request. Work ignoring cancellation keeps
its slot until settlement, even after its response has closed. This is not a
distributed budget, TLS handshake/connection cap, per-user fairness or abuse
rate limiter. Those remain responsibilities of the future dedicated listener.

The request lifecycle guard is checked before/after session resolution, around
the real session authorizer inside existing DB transactions and before final
delivery. Deadline, disposal, remote disconnect or a destroyed response fences
late work. A signing request reserved before a timeout may retain a failed
reservation; already committed effects are not undone. The deadline is not
atomic with the wall-clock instant of COMMIT, and HTTP cancellation is not a
cryptographic signer/process termination receipt.

Successful issuance returns only the four bounded existing public issuance
fields. Successful completion returns only `{deviceId, status:"pending"}`.
Enrollment still requires the exact newly issued mTLS leaf and consumes the
invitation transactionally; pending registration grants no Workspace membership,
Plugin capability, Agent/Node/CLI execution or Source access. Host approval
remains separate. Responses close the connection, are no-store, have no CORS
grant, and use a fixed error code instead of raw errors or account/device labels.

An independent review found early-rejection request errors were not handled
until body parsing. The handler now installs its request/response error sinks
before every early return. A regression covers incomplete unknown-route and
plain-HTTP requests plus late/repeated stream errors without adapter invocation.

## Verification

From `external/sps-core`:

```text
npx --offline pnpm@11.9.0 exec vitest run server/src/__tests__/sps-native-enrollment-http.test.ts server/src/__tests__/sps-native-session-enrollment.test.ts server/src/__tests__/sps-native-enrollments.test.ts server/src/__tests__/sps-native-pairings.test.ts server/src/__tests__/sps-native-parent-enrollment.test.ts server/src/__tests__/sps-native-parent-signer.test.ts server/src/__tests__/sps-native-host-management-session.test.ts server/src/__tests__/sps-native-host-management.test.ts server/src/__tests__/sps-identity.test.ts server/src/__tests__/sps-owned-shutdown.test.ts server/src/__tests__/openapi-routes.test.ts
npx --offline pnpm@11.9.0 -r typecheck
npx --offline pnpm@11.9.0 build
npx --offline pnpm@11.9.0 exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --esModuleInterop server/src/__tests__/sps-native-enrollment-http.test.ts
```

- Full focused regression: **11 files / 99 tests pass**.
- New handler suite: **11 tests**; fresh loopback TLS 1.3 with a mock internal
  adapter, strict projections/encoding/header/length checks, busy/read/operation
  deadlines, ignored work, disposal and stream-error containment. This suite
  does not pretend its mock adapter validates real sessions/certificates.
- Actual session/enrollment integration: **5 tests** with temporary PostgreSQL,
  signed fixture Identity login and real loopback TLS/mTLS. It now uses the new
  handler instead of the earlier hand-written test router. It covers no-membership
  pending enrollment, real logout during signing, different account/client-cert
  rejection, and timeout followed by late signing. The latter keeps capacity
  occupied, leaves a failed/no-certificate reservation and does not consume the
  invitation or create a device. Real Google OAuth is not exercised.
  The successful registration explicitly verifies empty Agent and Plugin tables
  before and after enrollment, as well as no Workspace membership grant.
- Full workspace typecheck/build pass, with final server typecheck/build and
  strict handler-test TypeScript rechecks. Existing build warnings remain.
- No new schema/migration, dependency, public SDK method, UI route or Node grant.

Exact Core `0d306bd46` PR workflow `40216576298` completed **15/15 successful
jobs**, including the full Linux partitions, typecheck/build and aggregate.
This does not prove Source Desktop acceptance, main inclusion or independent
review. The previous Core `7233ff885` pass remains historical evidence only.

Source `5211802` PR workflow `40216735206` is terminal **16/18 successful**:
the compatibility job fails Zod High1243066 (no exception), while Windows job
`121239389576` passed prepared Native Host source, packaged Workspace and Preview
before failing Host plugin lifecycle. Its deterministic ACP fixture was stopped
by the real Codex credential preflight, not a Native enrollment assertion.
This failed workflow must not be reported as full Windows acceptance.

Older Source `d062d1c` PR workflow `40215021041` failed its global WMI PostgreSQL
cleanup query after functional Preview and graceful Main exit passed. The
separate [owned-Job cleanup follow-up](WINDOWS-PREVIEW-JOB-CLEANUP-2026-10-26.md)
preserves that failure and requires fresh hosted acceptance; it is not an
enrollment bug. Source `8192f1e` implements that strict natural-exit gate, but
its fresh workflows were still running when this checkpoint was recorded.

## Remaining Acceptance

Host invitation management, the real Native client/session exchange, persisted
Member credentials through the app, explicit Host approval/revoke UI, listener
TLS/socket/rate-limit composition, complete authenticated HTTP/subresource/WS
coverage and remote revocation remain incomplete. The SDK Connection facade,
renewal/issuer rotation, restore trust reset, Tailscale-free Source and separate
Windows PCs remain required. No first connection or external LAN effect is
qualified by these loopback tests. Source mock, physical two-PC and identical
final signed-installer evidence stay distinct.

The next source-only management slice should reuse the existing pairing store
and captured Owner-session authority, with transaction-time reauthorization for
issue/revoke. Attempt and active-invite caps remain explicit policy inputs;
proposed 5/10 values are not approved product defaults. UI code publication also
needs a usable Native origin/port contract: no code should pretend that the
default-off, unmounted listener is already reachable. None is implemented here.

Zod migration hold, current CI, UI-token findings, Core main/independent review,
Identity rollout, code signing and same-byte two-PC release gates are unchanged.
The public Marketplace policy attachment remains reviewed only.
