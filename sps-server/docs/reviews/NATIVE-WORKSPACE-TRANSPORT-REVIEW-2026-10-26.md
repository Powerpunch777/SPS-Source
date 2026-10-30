# Native Workspace transport integration review

Status: implementation direction; no Workspace Native transport qualification.

## Current product boundary

Desktop `openWorkspace()` establishes its existing Core Identity session and
loads the Host `hubOrigin`. Core's application serves the Workspace assets.
The Main Native TLS listener implements five registration/session operations;
an approved Member certificate currently does not authenticate Workspace
navigation. The supported release transport remains Tailscale.

Core's `sps-member-devices.ts` authorizer already joins approved device, exact
certificate, owning user, Host, expiry and active Workspace membership. The
real-socket `sps-member-transport.ts` guard can recheck authority and dispose
sockets after device/user revocation. No production Workspace composition calls
it. Live-events has an optional device-authorizer hook, but the normal server
composition currently supplies only the session resolver.

## Client transport constraint

Electron's documented [app client-certificate callback](https://www.electronjs.org/docs/latest/api/app#event-select-client-certificate)
and [WebContents callback](https://www.electronjs.org/docs/latest/api/web-contents#event-select-client-certificate)
select a certificate from Electron's supplied list; they expose no custom PEM
private-key parameter. The existing protected Member key cannot simply be handed
to this callback. Importing key material into the OS certificate store would
change the current product boundary and is not part of this proposal.

The existing Owner `ownerHostApi()` and Workspace header injection target the
directly owned local Core. They are patterns, not a reusable remote Member
HTTP/WebSocket bridge. Owner bootstrap proofs must never be forwarded as Member
authority.

## Coherent next implementation

1. Compose a dedicated Native Workspace ingress with current Identity session,
   approved certificate/device and active Workspace membership on every request.
   Enumerate actual Workspace asset, REST and live-events upgrade routes before
   exposing them. Session expiry, device revocation and membership removal must
   close affected live sockets and reject later requests. Keep environment
   terminal upgrades denied until their operation-specific authority exists.
2. Prototype a Main-owned, per-window loopback Workspace bridge. Main uses the
   retained protected key through Node TLS and verifies the saved Host pin on
   each new connection. The private Workspace window loads its bridge origin so
   relative assets, REST and live-events remain coherent. A narrow local launch
   capability confines the bridge; Core still decides user/device permissions.
   Validate Origin/Host and navigation, strip Owner proofs, separate account/Host
   cookies, keep credentials Main-private, and bound bodies, streaming, upgrade
   admission and cancellation. Do not build an arbitrary Core or internet proxy.
3. Verify one complete Workspace navigation using actual assets, REST and
   live-events, including pending/revoked/wrong-user/expired certificates,
   expired sessions and membership removal. Test per-request rechecks and live
   socket disposal. Then qualify the same product path with real protected
   storage and two physical Windows computers, independently of Agents/plugins.

Route inventory, cookie/CSRF/CSP handling, window isolation and lifecycle cleanup
must be reviewed against the existing UI before this direction becomes a product
composition. Enrollment-only success, an unused guard or one read-only endpoint
does not establish complete Native Workspace access. Renewal, Source/Node access
and signed installation/update/restore remain separate required deliverables.
