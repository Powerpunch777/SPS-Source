# Native Inbox personal state

The private Native channel admits one additional mutation:
`PATCH /api/companies/<workspace UUID>/workspace-inbox/<item UUID>`. Its exact
`application/json` body is canonical UTF-8 JSON of at most 128 bytes, with at least
one boolean `read` or `archived` field and no other fields. No Plugin action,
arbitrary API, item content edit or Host administration operation is added.

Main TLS derives peer DER from the actual fresh authorized TLS 1.3 connection.
The current SPS session cookie, method, path, exact body digest and content type
are bound into the private per-child proof. The Core HTTP adapter retains strict
framing/body bounds; the reader reauthorizes the real session, matching approved
device and current Workspace membership in its transaction. Viewer writes are
denied consistently with the existing ordinary route. Core uses the existing
Inbox service for the current user's state, then rechecks authority before
commit. Only ISO/null `readAt` and `archivedAt` are returned from its DB row.

Bootstrap retains version 1 and its three required read capabilities; an exact
optional fourth `workspace.inbox.state.write` describes the authorized personal
state operation. This is a coordinated development candidate contract, not a
public SDK version change. Main refreshes that capability before forwarding a
mutation and Core independently enforces current membership. The window supplies
the Host/Workspace from its retained launch; renderer input selects only an item
and booleans. Writes are serialized and never coalesced or automatically retried.

The existing Core Native UI shows read/unread and archive/restore controls only
when that capability is present. It waits for the real mutation response and
refetches actual Inbox data; it does not claim an optimistic persistence result.
Archived listing is explicit. Errors clear retained Workspace data, and late
requests are fenced on navigation or close. Plugin actions and navigation
targets remain inactive until their separate authority contracts are integrated.

Focused evidence so far: real Core DB empty-Inbox and state-write checks passed
2/2 after correcting fixture placement; private HTTP adapter checks passed 8/8.
Main TLS/parent checks passed 31/31, with a subsequent parent-only 13/13 run
adding exact proof-HMAC verification. Source response parser passed 23/23; the
Member client PATCH test passed after correcting its fixture factory name.
The initial four-file client/controller/window/parser run passed 86 of 87 with
only that fixture-name failure; it is not relabeled as a passing single run.
The malformed-PATCH follow-up (including null, array and primitive JSON) passed
1/1. Native UI checks passed 11/11 with one thread worker, and the scoped UI
build exited 0. The first two UI attempts
timed out before collecting tests; those attempts provide no passing evidence.
After the Electron trust adjustment, seven selected actual-TLS checks passed,
including exact peer success, wrong-peer credential withholding and TLS 1.2
rejection. No full Desktop or Core suite was repeated.

Joined window verification uses a new explicit Windows-only option on the
existing isolated Core channel smoke. It creates a temporary profile/Vault,
persists the original generated Member credentials using Electron Windows DPAPI,
then opens the actual bundled SPA through the production Main window/client/TLS
and Core child/private HTTP/DB services. It reads, archives and restores a real
Inbox row and checks persisted user-state values. Only the Identity-provider token
exchange is substituted with a precreated real Core DB session. This joined
check's first attempt failed before opening its window, after protected-store
creation. A diagnostic follow-up reached the saved-key client's session exchange
and reproduced `UNABLE_TO_VERIFY_LEAF_SIGNATURE` in Electron 43.8.3's TLS runtime;
the same explicit self-signed server leaf was accepted by the standalone Node
runtime. An isolated Electron HTTPS probe with `allowPartialTrustChain: true`
reported an authorized, fresh TLS 1.3 connection. This flag is applied only to
the already validated single pinned server certificate; hostname, date, exact
DER/SPKI checks and `rejectUnauthorized: true` remain required. It does not add
OS trust or a CA role to the Host certificate. See the official
[Node secure-context options](https://nodejs.org/download/release/v24.20.0/docs/api/tls.html#tlscreatesecurecontextoptions)
for trust-list replacement and the partial-chain option.

After that correction the joined Windows check exited 0 at Core
`de6d3eb0e8b968e8277a78118bb8a3055ef159c4`. The actual bundled UI rendered the
neutral Workspace, Dashboard and real Inbox; its controls marked the item read,
archived it, listed archived content and restored it. The outer real DB query
confirmed one matching company/user/item state row with non-null `readAt` and
null `archivedAt`. An unrelated pinned peer was rejected by the Electron client.
Ordinary Host/Settings bridges and ServiceWorkers were absent, and browser API
fetch was blocked. Main, owned Core child and temporary DB closed naturally and
their owned fixture cleanup completed. The preceding two failed joined attempts
remain failures. This is actual temporary Windows DPAPI source execution, not
production Identity-provider or installed-product qualification.

Run only this explicitly requested scoped integration from `external/sps-core`:
`pnpm --filter @paperclipai/db exec tsx ../../../../sps-server/desktop/scripts/smoke-native-workspace-channel.mjs --isolated-native-workspace-channel --with-native-window`.

These changes do not establish physical LAN, production Identity,
installed upgrade/restore, or complete Plugin/Agent/live-event qualification.
Rollback removes the one PATCH contract and write capability while retaining
existing per-user Inbox state and the previous read paths.
