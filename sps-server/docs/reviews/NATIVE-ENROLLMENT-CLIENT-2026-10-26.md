# Native Main-Private Enrollment Client

Date: 2026-10-26 KST. Status: implemented and source-tested, inactive;
not Desktop enrollment UI, external LAN, two-PC or signed-release qualified.
Desktop remains unreleased 0.4.137. Core `b0611dbd5` and public SDK `d4d692084`
are unchanged by this increment.

## Implementation

The new internal client composes the existing invitation/certificate checks,
Member CSR/key validation and recipient credential verification. It calls the
existing Core session-exchange, issue and complete handlers; no replacement
Identity verifier, user registry, device database or public SDK is added.

- One immutable client captures one invitation origin, Host/server certificate,
  account/device context and independently trusted issuer pin. The trusted
  caller must supply a synchronous current-account/Host-generation guard.
  Returning a Promise from that guard is rejected. These inputs are not
  authenticated merely by constructing a client.
- Each credential-bearing request opens fresh TLS 1.3 with only the invited
  public certificate as its CA. Standard SAN validation and exact certificate
  equality are checked before HTTP headers/body flush; reused TLS and changed
  peers are rejected. There is no global certificate exception, TLS downgrade,
  proxy, redirect, general URL/path option or cookie jar.
- Exchange alone sends the existing SPS Identity Bearer. Its exact secure Core
  cookie remains in the client closure and is used only by that instance's
  fixed enrollment paths; it never reaches a renderer, return DTO, SDK or disk.
  Expiration is conservatively measured from request start. Disposal or a
  failed active operation discards the cookie. No retry or re-login is automatic.
- Issue sends only pairing ID/secret and the validated public CSR/device ID,
  not the Member private key or a body-selected user. The returned issuer,
  leaf, key/CSR binding and expiry must match the captured trusted context.
  Complete uses that validated key/certificate on another fresh mTLS connection
  and exposes only the Core's device ID and `pending` status. It never claims
  approval, Workspace access or Node/CLI/Agent/Source grants.
- Request operations serialize; timeout/abort/dispose close the owned request
  and socket before the transport settles. Guards recheck after async work and
  on the actual TLS connection before credentials. Bodies are bounded to 8 KiB
  outgoing / 16 KiB incoming, headers to 16 KiB and 64 response pairs. Response
  framing, status, fatal UTF-8, compact canonical JSON, exact DTO keys and the
  single secure cookie are checked. Unknown fields, duplicate keys/security
  headers, malformed encoding, redirects and oversized responses fail closed.
- Errors carry fixed safe messages without remote body/headers, token, key,
  local path, account data or underlying causes. Cancellation is not a server
  transaction rollback: a response lost after commit can leave issued or
  consumed state. Explicit recovery/reconciliation is still required.

## Exact Trust Limit And Next Work

The existing invitation contains the server certificate/pin, not a Member CA
pin. This internal factory therefore requires independently trusted issuer
context supplied by its caller; the test provides it from the same generated
Host fixture. No code silently adopts an issuer from the leaf response. A
product pinned Host-identity metadata exchange must be implemented before a
real user can initialize this context from an invitation alone.

This factory is deliberately not imported by Main, preload, renderer startup or
the public SDK yet. The existing DPAPI pending/issued stores remain separate;
the new wire client does not create, replace, persist or delete real keys.
Production Main account/token binding, issuer bootstrap, guarded store/client
composition, enrollment/approval/recovery UI and Native HTTP/WS ingress remain
incomplete. No external listener, firewall, OS trust, installed runtime,
production Identity service or supported-transport default changes.

## Verification

From `sps-server/desktop`:

```text
node --test test/native-enrollment-client.test.mjs test/native-enrollment-response.test.mjs test/native-enrollment-client-integration.test.mjs
node --test test/*.test.mjs
```

From `external/sps-core` (requires its pinned development dependencies):

```text
npx --offline pnpm@11.9.0 exec tsx ../../sps-server/desktop/scripts/smoke-native-enrollment-client-core.mjs --isolated-native-enrollment-client
```

The real-service integration uses an owned temporary PostgreSQL database and
the unchanged Core migrations, actual Identity RSA/JWKS/session writer,
pairing/enrollment services and HTTPS handlers. Keys/tokens/JWKS are generated
fixtures, not real Google OAuth. Its server listens only on loopback and is
closed before DB cleanup. Unsupported DB support is a failure, not a skip.

It verifies wrong-peer rejection before HTTP Authorization or any session row,
then exchange, explicit repeated issue with one signing, fresh mTLS completion
into one pending device, invitation consumption, durable audit events and
replay rejection. Agents, Plugins, Workspace memberships and Nodes remain empty.
The issuance row intentionally remains `issued`; single-use consumption belongs
to the pairing row. The first attempt correctly failed a test's wrong assumption
that the issuance row becomes `consumed`; the corrected real-state assertion
passed without modifying Core behavior.

Parent local results: focused client/response/integration-contract tests
**28/28**; full Desktop **911 total / 910 pass / 0 fail / 1 existing skip**.
The actual Core/DB smoke completed **exit 0** on Node **26.4.0** after the
corrected test assertion. These are source results, not the locked Electron
runtime or Windows installer. Candidate/security-document consistency,
JavaScript syntax and diff whitespace checks pass; dependency audit is not
claimed to pass. Core/SDK worktrees remain clean and unchanged.

The full Linux Core build job now installs Desktop transport dependencies with
scripts disabled (no Electron startup) and runs this same real-service smoke
under an explicit five-minute cap. It is an interoperability regression gate,
not evidence of a Windows product or physical connection. Exact-head hosted
results must be recorded separately after push.

Independent Luna read-only review found no concrete security defect in the four
initial client/response source/tests; tests were read, not executed by that
review. A quota failure was retried before review returned. Parent validated the
actual Core wire contracts and ran the source/DB tests. This is not independent
GitHub approval.

## Prior CI Correction

Exact Source `0bfdbdb8` push workflow `40255144480` and PR `40255150634` both
finished **16/18 jobs successful**, including full Linux tests/typecheck/build;
Windows unit failure stopped E2E and the held production audit also failed.
The raw CRLF checkout made a
structural test's LF-only final-cleanup delimiter return -1; it falsely reported
`Missing final cleanup gate shutdownPreviewE2eDesktop`. Normalize structural
source line endings, assert the boundary exists and test the actual script in
both LF/CRLF forms. Existing cleanup assertions and production behavior remain
unchanged. This fixes the demonstrated test defect, not an unexecuted E2E pass.

Production security policy remains blocked by held Zod High, and exact-head
packaged Preview, Identity operations, Core main/independent approval, final
code signing and physical two-PC gates remain open. Native LAN remains OFF.

## Approved Invitation Limits

On 2026-10-26 the human approved **five wrong-secret attempts per invitation**
and **ten active invitations per Host**, retaining one hour and one successful
use. `SPS_NATIVE_PAIRING_DEFAULT_POLICY` is a frozen Desktop product value passed
explicitly to the existing Core store, not a new Core-global hardcoded role or
rate limiter. Existing issued records, keys and customer data are untouched.

The isolated Core smoke now uses that approved policy. Ten pending invitations
are accepted; the eleventh fails `limit_reached`. Five authenticated, correctly
framed but wrong-secret attempts make one invitation `exhausted` with exactly
five failures. Even its correct secret cannot revive it. One replacement then
fits the released quota and has a one-hour TTL; ten invitations remain pending.
Malformed unauthenticated/local-code failures do not become charged attempts.
This uses the existing transaction/advisory-lock and audit semantics, not an IP
throttle or auto-reissue feature. The product invitation UI/listener remains
inactive; approving limits does not authorize a network/OS change.

With approved limits applied, the real Core smoke again completed **exit 0**.
Policy plus focused transport contracts pass **35/35**; final full Desktop
regression is **912 total / 911 pass / 0 fail / 1 existing skip**. The preceding
911-test result remains historical, not the final policy revision's count.
