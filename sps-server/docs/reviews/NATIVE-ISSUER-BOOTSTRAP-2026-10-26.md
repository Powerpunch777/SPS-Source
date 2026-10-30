# Native Issuer Bootstrap

Date: 2026-10-26 KST. Status: source implementation and loopback interop verified;
inactive, not an app invitation flow or external LAN qualification.
Desktop remains unreleased 0.4.137; public SDK is unchanged.

## Why This Is Needed

The full invitation already authenticates one server certificate over a trusted
separate channel. It does not carry a Member issuer certificate. The earlier
internal enrollment client required that issuer pin from a trusted caller,
which left a real product bootstrap gap. Adopting the issuer from an arbitrary
leaf response, hostname, LAN reachability or an unauthenticated probe would not
close that gap.

## Inactive Wire Contract

Core now supplies an explicitly constructed handler for one empty POST path,
`/sps-native/v1/identity`, over fresh non-resumed TLS 1.3. No route or listener is
mounted automatically. It accepts no account cookie/Bearer, browser mutation
metadata, proxy identity/credentials, encoded body or ambiguous length. The
trusted inspector supplies exactly Host UUID, server SPKI, Member issuer SPKI
and public issuer certificate. It can later compose the existing directly owned
parent inspector; neither user-selected Host nor filesystem path is accepted.

The server checks canonical bounds, issuer self-signature/CA/Host subject/pin/
validity, exact DER consumption and separate issuer/server keys. The actual
local TLS server certificate must agree with the inspected server pin before
delivery. A synchronous current-identity guard can fence rotation/disposal;
async or value-returning guards fail closed. Read/deadline/concurrency bounds
are explicit. Timeout or disposal cannot release an unresolved inspector slot
or deliver its later result. Errors expose only a fixed code; successful replies
are no-store, close the connection and contain no cookie, user or grants.

Desktop adds a narrow `inspect`/`dispose` bootstrap facade, reusing the existing
pinned enrollment transport rather than a second HTTP client. It sends no
Authorization, Cookie, pairing secret, private key or account/device fields.
Every request independently verifies the exact invited certificate on the
connection, and the response's Host/server pin must match that invitation.
The existing full issuer validator checks the certificate's bounded DER,
signature/profile, Host subject, dates and SPKI before returning public issuer
context. That context can initialize the existing guarded pending-key store and
enrollment client; no network response chooses a user or grants authority.

## Verification Scope

The Source/Core real-service smoke now learns the issuer via this pinned public
handler before constructing its account/device context. It confirms no Core
session or device exists after inspection, then runs the existing actual
temporary-DB Identity exchange, CSR issuance, fresh mTLS pending registration,
replay refusal and approved one-hour/five-attempt/ten-active tests. Keys, account
tokens and JWKS are generated fixtures; the endpoint is loopback only.

Source tests also cover a changed actual peer, Host/server/issuer response
inconsistency, leaf-as-issuer substitution, restricted facade methods and
disposal, alongside existing timeout/cancellation/framing/cookie regressions.
Core tests independently exercise real TLS, malformed requests/results,
deadline/disposal/concurrency, current-identity guard and TLS resumption.
Focused Desktop client/response/integration contracts: **34/34**. Core Native
HTTP/session/management plus local startup/shutdown: **59/59** (seven files).
The public handler's strict standalone TypeScript check passed. The real-service
smoke below completed with exit 0 using generated fixture keys and an isolated
temporary PostgreSQL database. This is not actual Google, Member UI or LAN proof.

```text
# From sps-server/desktop
node --test test/native-enrollment-client.test.mjs test/native-enrollment-response.test.mjs test/native-enrollment-client-integration.test.mjs

# From external/sps-core
npx --offline pnpm@11.9.0 exec vitest run server/src/__tests__/plugin-recovery-startup-contract.test.ts server/src/__tests__/sps-native-session-exchange-http.test.ts server/src/__tests__/sps-native-enrollment-http.test.ts server/src/__tests__/sps-native-session-enrollment.test.ts server/src/__tests__/sps-native-host-management-session.test.ts server/src/__tests__/sps-native-identity-http.test.ts server/src/__tests__/sps-owned-shutdown.test.ts --reporter=dot
```

## CI Launcher Correction

Intermediate Source `6e02e2c` Linux job `121359024378` in workflow `40256380671`
failed before the smoke started: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command
"tsx" not found`. The root package does not declare that executable even though
the existing local checkout happened to resolve it. CI and the reproducible
command now use the Core DB package's declared `tsx` dependency through
`pnpm --filter @paperclipai/db exec tsx`, without installing an unpinned global
tool, ignoring errors or bypassing the real integration.

From `external/sps-core`:

```text
npx --offline pnpm@11.9.0 --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-enrollment-client-core.mjs --isolated-native-enrollment-client
```

The corrected launcher completed locally before and after bootstrap integration.
This does not establish that a fresh hosted runner has passed. Windows E2E,
production Zod policy, main/independent approval, Identity operations, code
signing and exact final signed-byte two-PC gates remain separate and required.

## Still Unimplemented

Product Main account/Host lifecycle and trusted confirmation wiring, guarded
DPAPI-store/client composition, invitation/approval/recovery screens, listener
lifecycle, complete HTTP/WS/subresource admission, Source-without-Tailscale,
renewal and actual two-PC connection are not completed here. Existing Tailscale,
Owner recovery, Node/CLI/Agent/Source grants and Workspace/Plugin permissions
are unchanged. No real key, customer data, OS trust, firewall, installed runtime
or production Identity service was changed. Native LAN remains OFF.
