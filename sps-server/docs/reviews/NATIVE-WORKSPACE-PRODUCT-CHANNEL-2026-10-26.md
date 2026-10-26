# Native Workspace Host channel composition

Prepared Host startup now opts the directly owned Core child into a separate
private Workspace channel. Core requests a one-time launch key over inherited
IPC; Main checks the current protected Host binding and returns the fresh key
with echoed Host/server/issuer pins. Core verifies the closed reply, starts the
authenticated loopback reader, and announces only the matching ephemeral
127.0.0.1 endpoint to Main. No key or endpoint enters renderer, argv, environment
or public logs. The environment contains opt-in flags only.

The optional Workspace channel is independent of the existing enrollment and
signing protocols. It closes on parent loss, correlated close, generation change,
timeout or invalid bootstrap. Shutdown joins startup and listener cleanup,
zeroes copied keys and marks Core nonzero if cleanup fails. Main removes its
exact event listeners and aborts outstanding reads without disconnecting the
ordinary Host when only this channel is invalidated.

The explicitly enabled Main TLS listener now admits four exact Workspace surface
GET families through this private channel. It requires fresh non-resumed TLS 1.3
and a currently authorized client certificate, derives DER from the actual TLS
socket, admits only the exact session cookie and rejects browser, Owner or
caller-supplied proof headers. Main repeats the route/Workspace allowlist, binds
the request into its private MAC, and fetches only Core's verified loopback
endpoint. Core then resolves the real session and approved device/current
membership inside the authorized transaction. Private HTTP is not an arbitrary
Core proxy; Owner APIs, terminal upgrades and unrelated routes remain denied.

## Evidence

Candidate Core is `c405322d8f87366e59809ec5ef9ea7aff7012765`. Final scoped Core
server typecheck completed successfully after all lifecycle refinements. The
Cursor SDK maintenance update in this pin passed its adapter typecheck, four
tests and real module import checks; it does not clear the Zod advisory.

Core channel unit/lifecycle suite passed 9/9. Source composed Host/channel/signer
checks passed 68/68 before the final listener cleanup change; that cleanup and
categorical E2E diagnostics passed 13/13 separately. Actual source integration
exited 0 with generated client certificates, fresh Main TLS, real forked Core
bootstrap/private HTTP, real temporary DB/Identity session/device/membership and
all four surface responses. Wrong sessions, other Workspaces and revoked devices
were denied. No Agent, Plugin or Node was created. Child, outer process and DB
cleanup completed naturally. Failure cleanup never qualifies a forced exit.

The MAC-tampering test now flips an actual MAC bit. Replacing the final character
with a fixed character could leave a randomly generated MAC unchanged and caused
the Linux CI failure at Source 7000802; the corrected proof suite passed 11/11.
That same CI's No-AI functional path and natural process/Job cleanup passed, but
temporary data removal did not complete within its budget. New diagnostics
distinguish a timeout from fixed fixture failure categories without exposing
paths or changing the 20-second acceptance budget. Its cause remains unproven;
the run stays failed and updated acceptance is required.

## Qualification boundary

This is not a complete Native Workspace UI. Member-side protected credential and
session selection, confined per-window loopback bridge, actual SPA assets and
remaining APIs, Plugin UI, live-events/revocation socket handling, certificate
renewal and Source/Node execution remain required. Source/loopback fixtures do
not qualify DPAPI, physical LAN, installed startup, signed install/update/restore
or real AI providers. Native remains off at launch and Tailscale remains the
supported release transport. Marketplace policy and Plugin Builder restructuring
are unchanged. Zod High is still blocked; no audit waiver is introduced.

Rollback disables `SPS_NATIVE_WORKSPACE_CHANNEL` and omits the Main Workspace
dispatcher while retaining existing enrollment, Host data and protected keys.
