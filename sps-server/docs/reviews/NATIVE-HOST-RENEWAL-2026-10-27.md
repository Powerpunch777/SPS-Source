# Native Host certificate renewal — 2026-10-27

Host renewal preserves the server private key, Host ID, SAN sequence and Member
issuer certificate/key. Core Settings offers explicit renewal and interrupted
save repair while Native listening is stopped. Start listening remains a separate
confirmed action. Account/connection generation and listener activity fence
maintenance, including pending listener start/stop.

## Continuity and persistence

The initial Host identity v2 file stays unchanged. DPAPI-protected, create-only
companions store verified server certificate succession under the same Vault
incarnation. Reads reconstruct a bounded chain and never fall back through corrupt
history. Only a verified two-link publication with one owned temporary alias is
eligible for explicit repair. Orphan history prevents fresh identity/restore.

Default eligibility is the final 30 days of a 90-day leaf, bounded by one third
of a shorter leaf. A successor must extend expiry and fit the unchanged issuer.
Expired identities cannot renew. This implements D7's same-key pre-expiry path;
issuer rotation, key changes and expired-trust recovery remain separate.

A same-key self-signed replacement does not automatically satisfy strict TLS
trust anchored in the original non-CA leaf. A Node probe confirmed
`DEPTH_ZERO_SELF_SIGNED_CERT`. The listener therefore retains exact known current
historical leaves for selection by their DER SHA-256 encoded as a fixed SNI alias.
The default certificate is latest. Unknown/expired reserved selections fail.
Node and Electron probes confirmed strict authorization using the selected old
leaf. URL hostname validation still checks the real address; SNI is a selector,
never a hostname/trust bypass. Exact DER, SPKI, profile, date and fresh TLS 1.3
checks remain required.

One fixed empty public POST returns the latest server certificate, actual selected
predecessor fingerprint, Host ID and issuer fingerprint. It handles public material
locally, without a Core mutation, session, cookie, Member certificate or key. A
saved Member first authenticates its exact current old target, validates the
successor's existing X.509 signature, same key/Host/SAN/pins and increasing expiry,
then appends a protected target companion. Subsequent regular session/mTLS work
uses the newly selected exact leaf. Original target/key/issued bytes remain intact.
Cold readers reconstruct the same target. No detached signing protocol or
automatic reenrollment was introduced.

An older Host may lack the optional public metadata route. Only its exact standard
404 body and headers, received after exact trusted TLS authentication, mean
unsupported and retain the existing current target. Malformed responses, other
statuses and TLS errors fail before account/Member credentials are sent.

Offline Members whose retained old leaf has already expired still require explicit
trust recovery. Serving an expired leaf or accepting a new peer by SPKI alone is
not allowed. Old still-valid invitations select their exact retained certificate.

## Focused verification

No full Core/Desktop suite or workspace build was run. All evidence below covers
the named affected paths only; logs and probe scripts are outside the repository
in `g/work`.

- Storage/crypto three-file run: 52/53 passed. The new Host-store fixture was
  outside its own renewal window; the corrected named case passed separately,
  1/1 exit 0. Original failures remain failures.
- Settings/controllers six-file run: 106/107 passed. The existing metadata key
  assertion needed the additive renewal-window timestamp; corrected named case
  passed separately, 1/1 exit 0. New Host confirmation/generation/listener guards,
  Member target publication-before-credentials and late-account denial passed.
- Network six-file run: 99/101 passed. Two new fixtures used subsecond certificate
  dates and observed SNI after the probe had closed; corrected selected cases
  passed separately, 2/2 exit 0. New actual old-leaf/new-default public TLS request,
  no-credential framing, wrong-key history and unknown-alias denials passed.
- Expired captured Host identity status: named case 1/1 exit 0; the listener is
  reported off and stopped instead of continuing to advertise unusable access.
- Older-Host compatibility: public client, response parser and Member controller
  named cases each passed 1/1, exit 0. They verify the exact unsupported response
  and deny malformed/protocol/TLS failures before authentication. These focused
  changes followed the joined run; the whole joined scenario was not repeated.
- Changed JavaScript modules, renderer and fixtures passed syntax checks, and
  `git diff --check` passed. Core/SDK revisions and schema did not change.

The actual joined Host/Member run (owned session 58179) exited 0. It created
temporary DPAPI Host/Member records, published the Host leaf using the real
identity controller, preserved original Host file bytes/keys/issuer, restarted
the listener with latest default plus retained old leaf, and authenticated the
old target from actual Electron. The public successor was appended to the Member
store before subsequent credentials; original target/key/issued bytes remained
intact, and a new cold reader returned the successor. Actual Main/Core Member
renewal/replay/reconciliation, Workspace/Inbox persistence, independent membership
and device revocation denial, browser isolation, and natural Main/Core/DB cleanup
passed. Only Identity-provider exchange was substituted. Log:
`g/work/native-host-renewal-joined-window.log`.

Explicit joined command from `external/sps-core`:

```powershell
pnpm --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-workspace-channel.mjs --isolated-native-workspace-channel --with-native-host-renewal
```

This mode uses actual temporary Windows DPAPI Host and Member stores, production
Host renewal control, explicit TLS listener replacement retaining the old leaf,
saved Member target publication and cold read, actual Electron/bundled SPA,
Main signing/private Core child/real PostgreSQL session/device/membership and
existing Member renewal, reconciliation and Inbox operations. Identity-provider
exchange alone is substituted. No customer credential or installed build is used.

## Remaining work and rollback

Issuer rotation, expired/key-lost explicit trust recovery, Native Source/Node,
isolated Plugin UI/actions/live events, real optional AI/provider execution,
production Identity, signed installed update/restore and physical two-PC LAN
remain. The active dependency security gate remains unresolved. Native starts
disabled; Tailscale remains supported release transport. Marketplace policy and
Plugin Builder structure are unchanged.

Rollback disables optional Native and retains all original and successor records.
Older Desktop versions only know original credential files, so rollback does not
promise continued connectivity after those certificates expire. No OS trust,
firewall, Core schema/SDK or customer data was changed by this increment.
