# Native Enrollment Recovery

Date: 2026-10-26 KST. Status: source contracts and isolated recovery tests passed;
not an enabled app registration/recovery flow, listener, LAN or two-PC claim.
Desktop remains unreleased 0.4.137; Core `8c76edabd` and public SDK unchanged.

## Approved Behavior

The user approved retaining account-scoped verified Host address/pin metadata
so an app restart or lost completion response can query the existing registration
without entering the invitation again. Member private keys remain protected by
Windows encryption. This is not automatic re-enrollment, invitation replay,
device approval, key rotation or acceptance of changed pins.

The existing completion transaction consumes one invitation and creates only a
pending device. A successful commit followed by a lost network response cannot
be repaired by replaying that invitation. The issuance row remains `issued`;
that row alone does not prove a registered device exists.

## Source Contracts

Core adds a read-only `reconcileFromTlsPeer` operation and composes it through
the existing session adapter and dedicated inactive HTTP handler at the exact
`/sps-native/v1/enrollment/reconcile` POST path. Only an enrollment ID is supplied
on the wire. A real current SPS session derives the user and authorizes inside
the transaction; the service requires that authorizer explicitly. No membership,
Agent or Plugin is required and no such grant is produced.

Fresh, authorized, non-resumed TLS 1.3 possession of the exact issued certificate
is mandatory. Read locks bind the issuance, Host/server/issuer pins, current
user, consumed pairing and matching live device/snapshot ID. Public certificate
DER/hash/SPKI and validity are checked. A consumed invitation's deadline may
have passed, but the Member and issuer certificates must still be current.
Missing, deleted, mismatched or restored-away device linkage fails closed.
Session/lifecycle/peer/certificate guards fence final results.

The response contains only the existing device ID and `pending`, `approved` or
`revoked` status. A revoked key may observe only its own revoked state through
this constrained recovery operation; it gains no ordinary Member access. Reads
do not sign, insert, consume, approve, renew or append audit events. Status is
not an authorization lease and does not undo later revocation. Old explicit
two-operation adapters still work; without the new method this path is 404.
No product listener or general Core API/SDK route is mounted.

Desktop adds a Main-private non-secret Member-key index, separate from Node
credentials and account routing. Each `(Identity issuer, account subject, Host)`
retains one canonical UUID. Existing IDs are reused, never silently replaced;
corrupt indexes, duplicate scopes/IDs, collisions and configured capacity limits
fail closed. Validation uses strict own-data records and dense arrays, copies
and freezes output, and never stores keys, pins, tokens or local paths.

Desktop state v12 persists this public index. v1-v11 states without the field
receive an explicitly empty index while preserving account/Host/Node/routing
state. A present malformed index is rejected even by non-strict loads, without
rewriting its bytes. Older v11 applications do not understand state v12; no
installation or rollback compatibility claim is made here. No current customer
state was loaded or migrated by these isolated tests.

The same guarded create-only pending-key store now retains a separate Windows
safeStorage-encrypted `.target.json` record containing only the verified Host
origin, exact public server certificate and full account/key/pin context. It
requires the matching existing pending key and rechecks its bytes and directory
identities; it never creates a key to repair missing storage. Duplicate writes,
changed pins, corruption, expired certificates and linked slots fail closed.
A cold-start read-only reader takes the four public index fields and validates
the scope inside the encrypted record. Pins are recovered from that protected
record, not a new peer. This metadata reader returns no key and grants no access;
the full key store still requires the matching key and exact full pin context.

The separate inactive recovery client reuses the enrollment transport's fresh,
exact-certificate-pinned TLS 1.3, bounded strict responses, cancellation and
current-account guards. Its only actions are explicit session exchange and
read-only reconciliation using the existing issued key/certificate. The request
contains only the enrollment ID. It exposes no issue/complete operation and
accepts no invitation, so it cannot extend an expired invitation or replay it.
An earlier pairing deadline is permitted only for this lookup; current server,
issuer and Member certificates are still required. Pending/approved/revoked are
observations, not new authorization leases. No automatic retry is added.

## Verification And Remaining Work

Core service/session/HTTP/parent tests: **50/50** in four files, including actual
temporary PostgreSQL and fresh loopback TLS. They cover a discarded completion
response, repeated lookups after service reconstruction without new rows/events,
consumed versus issued-only state, wrong account/pins/key/transport, exact body
shape, current-session logout, tampered snapshot links, approved/revoked state
observation, and invitation expiry while the certificate remains valid. Actual
successful restore sanitization is followed by denial for the old certificate
under both an old session and a freshly authenticated account; trust is not
recreated and non-authorizing audit history is retained.
Desktop index/state tests: **19/19**, including a v11-to-v12 round trip with the
same stable UUID and preservation/rejection checks. Desktop full suite:
**958 total / 956 pass / 0 fail / 2 existing skips** (including the unavailable
distinct Windows 8.3 fixture alias). Core full workspace typecheck/build passed,
as did the final server typecheck after the new restore tests. Independent Luna
read-only review of the Core recovery path found no actionable defect; its identified restore cross-path
test gap was then filled. This is not independent GitHub approval or final CI.
Source Electron Settings tested the seven existing scenarios plus a new malformed
Member-index scenario: all passed with preserved invalid bytes, no Core/Agent/
Plugin dependency and normal Quit. This does not exercise enrollment UI.

The target-capsule/store/client/response focused suites passed **56/56** after
the integration tests caught and corrected a full-DTO input mismatch and an
escaped-PEM fixture assertion. Cold-reader tests reopen protected metadata using
only the index scope and reject cross-account copies. Store tests cover absent
keys, create-only preservation, guards, corruption, expiry and linked slots.
The encryption tests use an AES-GCM safeStorage substitute, not real Electron
DPAPI or Windows hardware attestation. The existing isolated Core interop now
drops the actual completion HTTP response after the real database commit, then
uses a new recovery client without an invitation to read the same pending
device twice. Device/pairing events and device rows remain unchanged. This
command passed against Core `8c76edabd`; its exact-head Core hosted workflow
`40262348249` also passed **15/15** jobs. Neither result qualifies the new Source
HEAD's Windows whole-Job cleanup or a signed/two-PC release.

Follow-up read-only Luna integration review found a remaining interrupted-write
availability limitation: a crash between the create-only hard-link publication
and temporary-alias unlink leaves two links. Fresh readers deliberately reject
that state, including a correctly named same-inode temporary alias, rather than
silently deleting a file or rotating/replacing credentials. A regression fixture
now reproduces that filesystem state and verifies that both readers and a new
create preserve the original bytes and aliases. This is not an actual power-loss
test or a fix for interrupted publication. An explicitly verified interrupted-
commit recovery design/test remains required before claiming comprehensive app
restart recovery. Normal completed-store reopening and lost HTTP response
reconciliation are separate, successful cases.

```text
# external/sps-core
npx --offline pnpm@11.9.0 exec vitest run server/src/__tests__/sps-native-enrollments.test.ts server/src/__tests__/sps-native-session-enrollment.test.ts server/src/__tests__/sps-native-enrollment-http.test.ts server/src/__tests__/sps-native-parent-enrollment.test.ts --reporter=dot

# sps-server/desktop
node --test test/state.test.mjs test/native-member-key-index.test.mjs
node --test test/native-member-target-capsule.test.mjs test/native-member-target-store.test.mjs test/native-enrollment-client.test.mjs test/native-enrollment-response.test.mjs

# external/sps-core, real isolated Core/DB/loopback interop
npx --offline pnpm@11.9.0 --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-enrollment-client-core.mjs --isolated-native-enrollment-client
```

The index is not yet allocated by an app enrollment action. Protected target
storage and post-invitation recovery transport are now source-tested, but actual
Main/account lifecycle composition, real DPAPI enrollment/recovery orchestration
and user confirmation/UI remain unfinished. These isolated modules and a
service-level lookup are not product restart recovery.
CI's remaining owned-process/data cleanup failure and held Zod High are separate
unresolved gates. No real key, external listener, firewall, installed runtime,
production Identity, Tailscale, Workspace/Plugin/Node/Source grant was changed.
