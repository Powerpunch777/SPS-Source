# Native Host invitation management

Core Settings now connects the existing local Owner pairing list/revoke routes
to an explicit Host invitation panel. This is Core/Desktop device trust
management, independent of Workspace Plugins and AI Agents.

Main authenticates the current local Host session, compares the protected Host
identity with Core's binding, and sends loopback Owner proof plus the current
Identity session. Reads return at most 200 rows. The renderer receives only
invitation ID/status, creation/expiry, failed/max attempts and target kind;
secret codes, account identifiers and consumed device IDs are excluded by
closed DTO validation. It uses textContent to render these fields.

Refresh is explicit; opening/focusing Settings does not fetch invitations.
Status refresh or returning to Settings invalidates cached rows. A late list
or revoke result cannot repaint a retired list. Revocation accepts one exact
UUID, requires an unexpired pending invitation, and uses a native confirmation
with current metadata. Account/connection/requester authority and the unchanged
pending row are rechecked after confirmation before mutation. A successful
revoke is followed by an authenticated list read. Lost delivery is reported as
unavailable and is never automatically retried.

Invitation issuance and clipboard copy remain a separate confirmed action.
Revoking an invitation does not revoke an already registered device; that has
its own device action. Approval, Workspace membership and execution grants are
unchanged. Existing Core policy stays one hour/five incorrect secrets/ten active
invitations. No migration or public SDK change is involved.

Focused controller, Settings IPC/preload, malformed DTO, Owner/requester race,
confirmation, pending-only action and renderer tests cover these boundaries.
The exact new UI still requires hosted E2E verification; earlier Native Host
management E2E success is not evidence of this new panel or physical LAN.
Rollback removes the panel/caller; existing Core invitation/device data remain
intact. Full LAN transport, DPAPI registration composition, renewal and release
qualification remain outstanding.
