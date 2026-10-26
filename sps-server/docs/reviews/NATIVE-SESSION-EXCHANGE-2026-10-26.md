# Native Identity Session Exchange

Date: 2026-10-26 KST. Status: source implementation and local verification;
inactive, not mounted, not Native LAN or signed-release qualification.

## Scope

This closes the source-level gap where the enrollment integration test first
created its login session through an unrelated Express fixture instead of the
Native TLS connection. It does not activate the product join flow.

- The existing SPS Identity verifier and user/session writer are reused through
  one internal `exchangeSession` method. Existing hub sign-in uses that method
  too. User upsert and random session insertion commit together; only the digest
  is persisted. User mapping, RS256/issuer/audience/scope/time checks, seven-day
  TTL, existing logout and hub cookie configuration remain unchanged.
- A separate inactive handler accepts only POST
  `/sps-native/v1/session/exchange` over fresh, non-resumed TLS 1.3. It requires
  one bounded Bearer JWT and Content-Length zero, rejects Cookie and browser or
  proxy credential metadata, and exposes no general API proxy.
- Native cookies are always Secure/HttpOnly/SameSite=Lax/Path=/ without Domain.
  JSON contains only the fixed expiration interval, never the token or account.
  Enrollment remains a different Cookie-only path that rejects Authorization.
- Explicit read/operation/concurrency limits do not become product defaults.
  Timeout/disposal/socket loss suppress writes at transaction guards and late
  delivery. Unsettled operations retain capacity. A guard after successful
  COMMIT cannot roll back committed state; no automatic retry is promised.
- Session exchange grants no pairing, device approval, Workspace membership,
  Plugin capability, Agent/Node/CLI execution or Source access.

## Trust And Limits

All keys and tokens in this verification are generated fixtures. The client
test uses standard CA/hostname validation plus the exact fixture server SPKI
on the credential-bearing connection. A wrong pin must fail before the server
receives HTTP Authorization. This demonstrates fixture TLS ordering, not an
implemented Desktop Main client or a physical Host/Member connection.

The server does not claim that a TLS client is Desktop Main. The existing
Identity issuer remains the source of account verification; this does not add
a separate Google email-verification policy or central revocation protocol.
The existing seven-day Core session semantics are intentionally retained.
Secure cookies are hostname-scoped, not port-scoped; a future Main cookie jar
must bind the selected Native connection and must not blindly copy hub cookies.

No app/startup route, listener, firewall/OS-trust change, schema, migration,
public SDK export, real credential, paid call, installed runtime or updater is
changed. Windows Native invitation UI, private credential persistence/caller,
connection lifecycle, renewal, HTTP/WS coverage and actual two-PC acceptance
remain incomplete. The supported transport remains Tailscale.

## Verification

From `external/sps-core`:

```text
npx --offline pnpm@11.9.0 exec vitest run server/src/__tests__/sps-identity.test.ts server/src/__tests__/sps-identity-session-exchange.test.ts server/src/__tests__/sps-native-pairing-crypto.test.ts server/src/__tests__/sps-native-pairings.test.ts server/src/__tests__/sps-native-host-management.test.ts server/src/__tests__/sps-native-host-management-session.test.ts server/src/__tests__/sps-native-enrollments.test.ts server/src/__tests__/sps-native-parent-enrollment.test.ts server/src/__tests__/sps-native-parent-signer.test.ts server/src/__tests__/sps-native-session-enrollment.test.ts server/src/__tests__/sps-native-enrollment-http.test.ts server/src/__tests__/sps-native-session-exchange-http.test.ts --reporter=dot
npx --offline pnpm@11.9.0 -r typecheck
npx --offline pnpm@11.9.0 -r build
npx --offline pnpm@11.9.0 exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --esModuleInterop server/src/types/express.d.ts server/src/__tests__/sps-native-session-exchange-http.test.ts server/src/__tests__/sps-identity-session-exchange.test.ts server/src/__tests__/sps-native-session-enrollment.test.ts
```

- Parent focused regression: **12 files / 119 tests passed**, with real owned
  temporary PostgreSQL, fixture RSA tokens and loopback TLS/mTLS. The final
  strengthened TLS resumption test was rerun separately: **10/10** handler
  tests pass, including client confirmation that the rejected handshake was
  actually resumed. All test fixtures are separate from user data.
- Whole-workspace typecheck and build pass; build retains existing CSS,
  annotation and chunk-size warnings. Strict checking of all three new/changed
  exchange/integration test files also passes. An initial test-only strict check
  exposed nullable-user and Node socket/options typing, subsequently corrected.
- Real integration checks wrong server SPKI before HTTP Authorization, then
  Native session creation, issuance and fresh mTLS completion into pending state.
  Another session, browser metadata, missing certificate and logout during
  signing remain rejected. No Agent, Plugin or membership is added.
- Parent reviewed bounded Luna implementation/test contributions. Independent
  Luna read-only security audit found no actionable defect in this increment;
  this is not independent GitHub approval or full product/release qualification.
- Exact Core `b0611dbd5` PR workflow `40248935934`: **15/15 jobs successful**,
  including all Linux test shards, typecheck and build. The separate automated
  review failed; neither this CI nor local review establishes main inclusion or
  independent human approval.
- Source Desktop regression: **848 total / 847 pass / 0 fail / 1 existing skip**;
  focused No-AI fixture tests **13/13**. The first full run correctly rejected
  the newly updated support matrix before its matching Core gitlink was staged;
  the rerun with aligned gitlink passed. Candidate/security-document checks pass.
- Latest local `SPS_DESKTOP_E2E_SOURCE=1 npm run test:e2e:runtime-discovery`
  reached every functional assertion, including the explicit restarted reference
  UI and independent recovery, but **did not exit naturally**. After Main had
  exited, the owned harness retained two referenced output pipes whose data
  listeners were its `captureOutput` function. A diagnostic debugger attached
  only to that exact owned test PID, projected handle types/ref state (not
  contents), set exit code 1 and closed those two harness pipes. The command
  terminated **exit 1**. No foreign process was killed. This is partial functional
  evidence with diagnostic intervention, not an accepted E2E or proof that all
  Host/PostgreSQL descendants stopped. The harness must next bound and verify
  output/owned-process cleanup across each restart without accepting forced
  cleanup as natural; the earlier source-only pass is not reused here.

Source Preview/Host CI and the held Zod production-audit blocker remain separate
gates. Source `7d2a5a5` push workflow `40248029166` failed its No-AI source app
step waiting for a mock Identity callback; counterpart PR workflow `40248034235`
reached a restored model-fixture Workspace and failed an incorrect text-based
restart predicate. Both completed with 16/18 successful jobs; the held Zod policy
also failed. Neither reached packaged Preview, so its root cause remains open.
The restart harness now navigates to the exact reference Plugin and requires its
persisted Job UI before the unchanged API/data/zero-Agent/recovery assertions.
The mock callback timeout is a separate investigation, not a proven product bug
or a claimed fix. This is not evidence that the new unmounted Core
handler ran in that older pinned candidate. No Marketplace-policy implementation
is part of this increment.
