# Native TLS ingress ownership: design review

Date: 2026-10-26. Status: implemented opt-in registration path under verification;
this document is not LAN or release qualification.

## Implementation checkpoint

The requested Core/Desktop Native integration adopts Main-owned TLS termination
and a trusted, direct-owned-child IPC assertion. Main holds the server and issuer
private keys. Core keeps real Identity sessions, invitation and issuance records,
pending devices, transaction authorization and audit. The two versioned logical
protocols (ingress and signing) share the existing inherited Node IPC descriptor;
neither is a generic request proxy or public SDK surface.

Core startup mounts the private dispatcher only when prepared Host management
and `SPS_NATIVE_PARENT_INGRESS=1` are present, checks the Host/server/issuer binding,
and fences shutdown and disconnect. The ordinary HTTP enrollment factories still
require a real TLS socket. Main's five fixed TLS POST routes produce internal
peer evidence; a private WeakMap retains the copied certificate DER in Core.
This trusts Main in the existing same-user threat boundary, and does not protect
against a compromised Main process.

Core Settings adds explicit per-launch registration start/stop and invitation
copy. Start requires a current signed-in local Owner, a prepared identity, one
literal private local NIC address covered by the server certificate, a port
1024–65535, and native confirmation. It defaults off after launch. Main does not
change Windows Firewall, OS trust or existing Core/Tailscale binds. Owner/account
change, Core child exit/restart and Desktop shutdown stop the listener. Unexpected
listener errors close owned sockets and prevent stale listening/clipboard state.

The local `/api/sps/native-pairings` management routes require both trusted
loopback Desktop Owner proof and the real current Board/Owner session. The Main
clipboard action creates a one-use, one-hour invitation under the existing
five-incorrect-attempt/ten-active policy. It compares the protected server and
issuer certificates with the running listener before issuance. Only a public
copy acknowledgement reaches the renderer; registration remains pending until
separate Owner approval and grants no Workspace, Plugin, Agent or Node access.

Focused source evidence includes real production clients through loopback TLS,
TLS-to-parent-client regression, timeout/backpressure/socket disposal, strict
response projection, account/confirmation and listener-health checks. The real
Core child + Main signing + persisted Member recovery smoke completed exit 0:
the registration committed before its success response was withheld, a rebuilt
Member controller recovered the same pending device twice without new rows or
events, a different current account was denied before network, and the child
exited naturally. The fixture uses real temporary PostgreSQL and Core Identity
with isolated public JWKS, and AES-GCM in place of DPAPI. It is also a separate
required CI step. DPAPI composition, product startup,
physical LAN, certificate renewal, full Native HTTP/WS/Workspace/Node transport,
Windows natural Job cleanup, security and release gates remain outstanding.

The remaining sections retain the design baseline used for implementation.
Their future-tense work list and original open decisions are historical context;
the checkpoint above describes current code and outstanding qualification.

## Original design recommendation

The eventual dedicated Native TLS listener should be owned by Electron Main,
which already owns the protected Host identity and the private server key. Main
should terminate TLS 1.3 on a separate, opt-in socket and send only a small,
fixed Native operation over a new direct-parent-to-owned-Core-child IPC channel.
Core should continue to own identity sessions, invitations, issuance records,
device state, audit and transaction-level authorization.

Do not move the Host private key over IPC to start a Core-owned TLS listener.
The existing signer IPC deliberately returns public identity/certificate
material only. A Node TLS server needs the private signing operation during the
handshake; adding a general or raw-key operation would reverse the existing
ownership boundary. No supported TLS private-key callback is present in the
current integration. A Core listener therefore requires a separate platform
key-provider design, outside this increment.

Main-terminated TLS means Core can no longer receive an actual `TLSSocket`.
The current Core HTTP factories must not be fed a fabricated socket. Instead,
add an internal transport-evidence contract accepted only by the new, private
owned-child IPC composition. Main derives that evidence directly from the live
socket and exact request; Core accepts it only on the authenticated inherited
IPC channel and still performs all account/session, invitation, certificate,
device and Workspace authorization. This is a trusted Main-to-Core assertion,
not cryptographic proof against a compromised Main or a same-user process.
Those limitations match the existing same-user threat boundary and must be
documented.

## Evidence at the original design review

- RFC section 3 already requires a dedicated Native ingress, transport context
  that cannot be forged with forwarded headers, and strict separation from the
  loopback `local_trusted` listener. It requires opt-in and explicitly excludes
  firewall changes without separate consent.
- Main owns `safeStorage`, the Host identity store and `createSpsNativeMemberMainSigner`
  (`sps-server/desktop/src/main.mjs`). The signer channel accepts only `inspect`,
  `sign` and `cancel`; it rejects paths, account tokens, private keys and
  general-purpose signing requests (`native-member-signer-channel.mjs`).
- `owner-host.mjs` spawns the directly owned Core child with a private Node IPC
  descriptor. That is the available local trust channel; it is created for one
  child lifetime and fenced on disconnect, identity/account changes and stop.
- Core's current enrollment/session handlers are factory-only. Enrollment
  handlers require actual fresh TLS 1.3 request/socket data, and complete/reconcile
  also require the exact live authorized client certificate. `server/src/index.ts`
  does not mount these handlers or start a Native listener. Existing local,
  Agent and Tailscale ingress must remain separate.
- The latest Main controller/Core integration passes using real temporary Core
  DB and loopback TLS, with an AES-GCM storage substitute. It does not exercise
  Electron DPAPI, product TLS ownership, Windows LAN or a physical second PC.

## Narrow protocol ownership

### Desktop Main

1. Mount the ingress controller only for the directly owned Host after explicit
   Host opt-in, prepared current identity and successful TLS/profile checks.
   Keep the setting off by default. Bind only the user-selected private
   interface and dedicated port; never reuse or widen the existing Core HTTP
   bind. Do not edit Windows Firewall, OS trust or Tailscale settings.
2. Load the exact server leaf/key and issuer certificate from the current
   protected Host identity. Keep the key in Main memory only. Require TLS 1.3,
   disable session resumption for enrollment operations, and invalidate the
   listener on identity rotation, restore, Owner change, sign-out, Host stop,
   disposal or channel loss.
3. Accept only the fixed private paths and exact verbs below. Apply framing,
   body-size, strict UTF-8/JSON, read-timeout, operation-timeout and concurrency
   limits before IPC. Reject duplicate/ambiguous headers, transfer/content
   encoding, browser-origin metadata, unknown paths and extra fields. Never
   proxy arbitrary HTTP, file, WebSocket or Plugin traffic.
4. Derive a one-request transport record from the actual socket: TLS protocol,
   resumed state, authorized-client-certificate state, and (where authorized)
   exact certificate DER/fingerprint. Do not accept any of these values from
   headers or request JSON. Do not send credentials until the client has
   verified the invited server certificate and pin.
5. Send a fixed operation, bounded canonical body, required Cookie/Authorization
   field and Main-derived transport record through a separate versioned IPC
   protocol. Bound outstanding IDs and requests, suppress late results and close
   the channel on malformed/replayed messages. This must not reuse or broaden
   the signer protocol.

### Core

1. Add a private Main-ingress adapter that validates the IPC envelope and
   transport record, then calls existing identity/session/enrollment services.
   It is not an HTTP route, Plugin SDK method or general request forwarder.
2. Preserve existing strict request parsing and response/error contracts by
   sharing validators/operation services where possible. Refactor transport
   admission into a narrow trusted internal context rather than emulating
   `IncomingMessage` or `TLSSocket` objects. The ordinary HTTP handler must
   continue to require a real socket.
3. Keep Core authoritative for SPS Identity session validity and logout ordering,
   verified account and invitation binding, CSR and issuance matching, one-use
   consumption, device state, audit, Workspace membership and revocation.
   Never treat a Main transport assertion as approval, session authentication,
   Workspace membership, Node/CLI permission or Source access.
4. Revalidate current identity/channel lifecycle around asynchronous signer work
   and before final transactional writes. A disconnect fences pending results;
   it does not roll back completed work or imply distributed cancellation.

## Fixed endpoint transport policy

The endpoint policy must be encoded explicitly in both Main and Core rather
than inferred from one generic `authorized` boolean:

| Operation | Client certificate | Other credential |
| --- | --- | --- |
| `/sps-native/v1/identity` | None; fresh TLS only | None |
| `/sps-native/v1/session/exchange` | None; fresh TLS only | One bounded SPS Identity Bearer token |
| `/sps-native/v1/enrollment/issue` | None; fresh TLS only; CSR signature/profile proves requested key possession | Current SPS Identity session cookie and invitation-bound body |
| `/sps-native/v1/enrollment/complete` | Authorized current TLS clientAuth leaf matching this issuance | Current SPS Identity session cookie and strict completion body |
| `/sps-native/v1/enrollment/reconcile` | Authorized current TLS clientAuth leaf matching this issuance | Current SPS Identity session cookie and enrollment UUID only |

This distinction is required because the first-issued Member certificate cannot
authenticate its own issuance request. Main should require a live clientAuth
proof for complete/reconcile and reject missing, unauthorized, resumed or
mismatched peers there. Core must still check current device/certificate/session
authority on every such call. For identity/exchange/issue, Main should reject a
present client certificate unless the operation contract explicitly defines
how it is used; it must never silently downgrade an invalid presented
certificate.

## API and testing work required before a product opt-in

- Add a separate `sps-native-main-ingress-v1` IPC request/response type with a
  closed operation enum, bounded ID, body bytes, exact credential slot and
  Main-derived transport context. No generic URL, arbitrary headers, raw key,
  signer method, filesystem path or caller-selected Host ID is allowed.
- Add Main ingress lifecycle/controller APIs (`start`, `inspect`, `stop`,
  `dispose`) gated by prepared Host identity, direct owned child and explicit
  user preference/confirmation. Listener status must distinguish configured,
  listening, failed and disabled. Failure keeps normal Host access unchanged.
- Add Core's private IPC composition and service adapter. Keep existing strict
  HTTP factories for trusted non-Product test composition and require real
  sockets in those factories. Review Core's identity/session, enrollment and
  pairing contracts before choosing where shared parsing/transport types live.
- Test exact path matrix, no-client-cert issue, wrong server pin sends no token,
  mismatched/expired/revoked client cert, session logout during operation,
  account/Host change, replay, request/body limits, IPC replay/backpressure,
  child exit, timeout/disposal, concurrent listener startup, certificate
  rotation and cleanup. Include a real Core temporary DB plus a loopback TLS
  Main ingress integration. Later run a separate Windows DPAPI test and physical
  two-PC acceptance on the exact signed candidate.
- Prove the listener is absent before opt-in, bound only to the selected private
  interface after explicit opt-in, stopped on every lifecycle fence, and never
  changes firewall rules. Current work should only exercise an isolated
  loopback fixture; it must not start a product LAN listener on this machine.

## Original open decisions

The RFC approves D3 defaults and explicit opt-in, but does not yet settle the
product bind-interface UX, address/SAN policy, port selection, TLS client-auth
policy for non-enrollment Native requests, or whether users consent to making
the Main process the TLS termination boundary. The latter changes the meaning
of Core's current “actual socket” guarantee: the recommended narrow IPC evidence
must be explicitly adopted as the trusted-ingress contract before code is
written. A public listener and firewall modification are not authorized by this
review. Existing certificate SAN/pin rotation must also be reconciled with the
selected LAN address; address string equality alone is not Host identity.

No connection API is added to the public SDK. Marketplace, Builder, Plugin
workflow and existing Tailscale behavior remain outside this change.
