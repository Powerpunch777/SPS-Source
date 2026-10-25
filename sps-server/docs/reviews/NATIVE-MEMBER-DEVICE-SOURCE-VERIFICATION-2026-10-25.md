# Native Member device source verification

Date: 2026-10-25 KST. Status: **source-tested foundation; Native LAN unsupported**.
This is not installation, physical two-PC, code-signing or Stable evidence.
The approved product policy is PC-specific Member mTLS plus Host approval,
with LAN off by default and explicit opt-in. No external listener, firewall,
OS certificate store, installed app or production Identity change was made.

## Revision boundary

- Source before this increment: `dd04424e7137d0cef561442e01d133e362cd32ae`.
- Core before this increment: `0ba417ad9b0e26ae1cf598edca524b82059d04de`.
- Native Core implementation: `f653375c113c46c6c09e2e3a20fd45c73598cfca`.
- Final Core pin includes the private-MCP CI fix:
  `f2260640cf5a33e1e7ab97193efa70b6c6d3753a`, also recorded in
  [CURRENT-CANDIDATE](../current/CURRENT-CANDIDATE.md) and the Source submodule.
  The enclosing Source commit identifies this record.
- Public SDK remains `d4d69208480fc618b2055378b85d183aea422d50`; no new Connection API.
- Unreleased Desktop source remains `0.4.137`; remote support still requires
  Tailscale stable >=1.52.0. No new installer or manifest was generated.

## Implemented source contract

1. Additive Core migration 0165 creates Host-scoped device and security-event
   tables. It was applied only to disposable test databases. It does not reuse
   Node keys or introduce Room/Task/Lead/Worker/organization roles.
2. Pending self-registration uses the real session user, current active
   Workspace and membership, bounded canonical public clientAuth DER and safe
   metadata projection. Requests cannot select Host/user/status or submit a
   private key. Pending registration is not approval or proof of possession.
3. Only a real local Host session with both Desktop launch proofs can list all
   devices, inspect history, approve or revoke. Host UUID is trusted configuration.
   Current API-key/implicit/admin shortcuts cannot manage these resources.
4. Approval and revocation serialize on the device row and write the event in
   the same transaction. Exact duplicate requests and actions are idempotent;
   a revoked key is not revived. New certificate with the same registered SPKI
   conflicts. These rules do not implement certificate issuance or rotation UI.
5. Current authorization joins Host, user, active Workspace/membership, approved
   device and certificate validity. A device grants no membership, Plugin,
   Agent/Runner/Node or Source privilege. User A cannot use user B's certificate
   record or a Workspace they have not joined.
6. A separate transport helper uses an actual authorized TLS 1.3 socket and
   clientAuth certificate, not a body ID, hostname or forwarded/identity headers.
   Each call re-queries authority, projects a bounded safe grant, and rechecks
   the peer after awaits. Revocation/dispose fences pending admissions and can
   close tracked sockets. This is not a TLS listener or complete HTTP middleware.
7. An opt-in event-WebSocket guard checks membership plus device authority on
   admission, then re-resolves the same login session and current device authority
   before each event. Invalid session/authority stops delivery and terminates the
   socket; the event queue is bounded. Existing unguarded lanes remain unchanged.
8. Restore sanitization deletes device trust. The event FK becomes null while
   its immutable snapshot ID/history remains; history cannot authorize access.

## Activation and known limitations

The checked-in server startup does **not** supply `nativeConnectivityHostId`,
so new management routes return 404 in the normal product process. OpenAPI marks
them as an optional, inactive contract. The TLS helper has no production call
site. The WS guard is not passed to the current server and must not be installed
onto the existing local/Agent/Tailscale listener: Native ingress intentionally
rejects implicit sessions and Agent API keys, which those separate lanes support.

The fixture mTLS server explicitly trusts synthetic test certificates. There is
no SPS CA/issuance, persistent Host identity, private-key storage, first-invitation
enrollment, pairing consumption, device-session database, native settings/recovery
UI, full HTTP/artifact/file/other-WS coverage or actual LAN activation yet. Service
DB tests, socket tests and WS tests prove their separate layers, not a complete
Native Host/Member product flow or a hardware device identity.

The admission fence currently changes globally during revocation. This is
fail-closed but may reject an unrelated in-flight authority lookup. It is not
a distributed lease, a global cancellation mechanism or an undo of accepted work.
The DB commit and socket close are not atomic; the management route offers a
post-commit close hook, but future Native composition must actually wire it.
Session revalidation follows the configured resolver's revocation/expiry behavior;
no stronger instantaneous central-Identity revocation guarantee is claimed.

Before activating Native ingress, add explicit lifecycle/time/concurrency limits,
pending/enrollment rate limits, a dedicated authenticated HTTP/WS composition,
all subresource denial checks and a close/recovery path for membership removal,
logout, certificate expiry and Host restart. External activation still needs the
separate user confirmation required by D3. Source D4 remains undecided; no TCP445
expansion or replacement of the existing SMB path is authorized.

## Verification

Working directory: `external/sps-core`, Windows, Node v26.4.0.
OpenSSL is a test fixture utility only, not a new product dependency. Real
loopback TLS/HTTP sockets use temporary synthetic certificates and bounded
cleanup. DB tests use disposable embedded PostgreSQL, not the Owner Vault.

```powershell
pnpm exec vitest run server/src/__tests__/sps-member-devices.test.ts server/src/__tests__/sps-member-device-routes.test.ts server/src/__tests__/sps-member-transport.test.ts server/src/__tests__/live-events-ws.test.ts server/src/__tests__/openapi-routes.test.ts packages/db/src/post-restore-sanitizer.test.ts packages/shared/src/validators/sps-member-devices.test.ts server/src/__tests__/private-hostname-guard.test.ts server/src/__tests__/app-private-hostname-gate.test.ts server/src/__tests__/sps-core-baseline-instance-admin.test.ts server/src/__tests__/sps-identity.test.ts
pnpm -r typecheck
pnpm build
pnpm check:sps-compat-boundary
git diff --check
```

Results: **11 files, 96/96 tests passed, no skips**. Breakdown: shared validators
30, restore sanitizer 8, actual-DB device service 11, actual-DB routes 5, real TLS
transport 8, WebSocket 11, OpenAPI 7, existing hostname/Host/Identity regressions
16. Typecheck across 30 workspace packages, full Core build and compatibility
boundary passed. The build still reports CSS pseudo-element/deprecation warnings;
this does not resolve the separately recorded UI token gate or security holds.

At the updated Source submodule/support-matrix pin, `npm test` in
`sps-server/desktop` passed **572/572**, no failures/skips, and
`npm run docs:candidate:check` passed. An earlier pre-pin run correctly refused
the old staged Core revision; it was not counted as a successful candidate test.
No Desktop executable code changed in this increment.

The coordinator added real DB registration/decision races, approval-event failure
rollback, separate membership/expiry/Workspace denial and retained-history FK
tests. It also added per-event session revalidation after finding that device-only
checks could miss logout or changed users. Luna xhigh assignments supplied
schema/migration, shared contracts, service, socket and WS tests, plus read-only
boundary review. This is internal review, not independent release approval.

No whole-Core test-suite/Linux-shard result, dependency-audit pass, Electron E2E,
physical two-PC result or signed-package proof is claimed by this record. Existing
Zod/installer holds, full latest CI, Identity rollout, Core main/independent review,
Windows signing and identical-byte two-PC release requirements remain unchanged.

## Fresh remote CI observations

CI now reaches real runners; the earlier billing/no-step explanation is not the
current result. Previous Source run `40169666581` at `dd04424e` completed all nine
Linux shards, but failed Windows source No-AI E2E because embedded PostgreSQL
rejected the runner's administrative token. Its production audit also correctly
rejected Zod 3 High 1243066. Neither result covers the new Core device code.

Source run `40171387003` at `f391c3c2` completed all nine Linux shards and the full
Linux typecheck/build against Core `f653375c1`; the whole workflow was still running
when observed, and its production audit had failed. Its sibling `40171389690`
was queued. Preserve these handles rather than restarting duplicates. This is
the Native implementation checkpoint, not final Core `f2260640c` qualification.
Core run `40171286729` reported an unpublished internal MCP package in
release enrollment; review run `40171284756` reported unavailable Dependency Review.
These are actual failures with steps, not a new claim of all-green CI. Subsequent
candidate changes require fresh exact-HEAD verification; the latest PR checkpoint
records the current tuple and handles.

The internal `@sps/mcp-server` package is now private and absent from public npm
release enrollment. Its server/CLI dependents are also off that publication train
so no public package points at a private workspace dependency. Build/bin/dist
mappings remain intact. The release gate itself was not relaxed and no package
was published. Release-map/bootstrap contracts passed **23/23**, MCP typecheck/build
passed, and the bootstrap selector excludes this private package. This is consistent
with the approved private-Core/public-SDK boundary, not a Dependency Review or
security-audit waiver.

After the private-MCP follow-up at Core `f2260640c`, the same 96 focused tests,
30-package typecheck, full Core build and Desktop 572 tests were rerun successfully.
The full base-ref bootstrap network command was attempted on Windows but its
upstream `spawnSync npm` launcher failed with `ENOENT`; do not confuse the 23
unit contracts/private-package selector with a successful Windows network check.
The exact-Core Ubuntu policy run `40171821294` is the remote follow-up handle.
