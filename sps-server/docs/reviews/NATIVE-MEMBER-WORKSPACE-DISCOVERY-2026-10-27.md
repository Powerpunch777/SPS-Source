# Native Member Workspace discovery

The saved Native Host registration now has a separate Workspace discovery
operation. Main reuses the current account's protected Host target, original
Member key and issued certificate, exchanges the current Identity credential
for a Host session, and sends one exact fresh-mTLS GET to
`/sps-native/v1/workspaces`. It does not repeat enrollment or create a new key.
A missing original key or issuance requires recovery.

The existing private Main/Core channel binds a null Workspace selector only to
that exact GET. No query string, caller-selected Workspace, browser authority or
Owner proof is accepted. Core authenticates and reauthorizes the session before
device or membership reads. An approved, unexpired device must match the current
Host, user and actual TLS certificate fingerprint. Device and active
Workspace/membership rows are held under shared transaction locks; authority is
rechecked before delivery. Only unique `{id,name}` choices are exposed, capped at
200 with no silently truncated list. No active memberships returns an empty
list; a revoked device is denied.

Core Settings exposes the operation through a fixed, current-frame IPC action.
Each saved Host has an explicit **Show Workspaces** action. Names and IDs render
as text, results clear on status refresh, and late responses cannot repopulate
an obsolete registration view. The query needs no local Host ownership. Main
keeps the target, Identity token, session cookie, certificate and key private.

Existing nonempty Workspace names are preserved verbatim, including whitespace,
long names and valid Unicode within JSON strings. Display uses text content;
discovery does not impose a new naming policy. The 200-row and 256 KiB response
bounds remain in force, and malformed UTF-8 or a leading JSON BOM is rejected.

## Selected Workspace bootstrap

The same private channel also admits exact GET
`/api/companies/<uuid>/workspace-bootstrap`. Inside the existing authorized
transaction, Core reads only that Workspace's ID, name and issue prefix, and
returns its versioned descriptor, the current Member user ID and the three
currently supported read capabilities. Prefixes are data, not permission to
choose a route. The closed version-1 capability list grants no Host, Plugin,
execution or WebSocket authority.

The Main-private client reuses saved credentials and checks that the returned
Workspace ID equals the requested ID. A shared DTO validator rejects extra
nested fields or capabilities and clones/freezes accepted data. Account and
requesting-frame changes suppress delivery. This prepares a trusted Native
bootstrap for the existing Workspace SPA; it does not yet mount that SPA or
add an unrestricted Core proxy.

## Verification

- Main proof, private parent channel and Host TLS ingress: 34 focused tests passed.
- Protected Member controller, response parser and actual TLS client: 62 focused
  tests passed, including missing-key recovery and account-change fencing.
- Core Settings controller, preload and renderer: 47 focused tests passed,
  including explicit clicks, text rendering, empty/error states, obsolete
  responses and clearing previously displayed names on refresh. Syntax checks
  passed. Final Core proof suite passed 12/12 at `a9921031`.
- Core proof plus real DB surface suite: 17 tests passed; the subsequent surface
  rerun passed 5 tests with meaningful authorization-order checks. An invalid
  cookie opens no transaction, and a rejecting in-transaction session authorizer
  prevents device and Workspace selects.
- Extended cross-repository integration exited 0 using fresh Main TLS, a real
  forked Core/private HTTP channel, temporary DB/Identity session, approved
  device and membership. Discovery returns the authorized choice, rejects wrong
  sessions and absent certificates, returns no choices after membership removal,
  and denies the revoked device. Existing four Workspace surface families still
  work. No Agent, Plugin or Node is created; child and DB cleanup finish naturally.

Source `b833290` subsequently passed full Desktop regression: 1,128 passed, zero
failed and 12 skipped. The naming compatibility change passed 85 focused tests.
Bootstrap Host TLS/parent-channel checks passed 28/28; Member TLS/parser/controller
checks passed 67/67, followed by 43/43 response/controller checks after stronger
DTO cloning and Unicode coverage. Core's real DB/HTTP surface suite passed 6/6.
The extended actual Main TLS/Core child/private HTTP/DB integration also exited
0 after adding bootstrap, using the same strict Member response parser against
Core's real reply, followed by membership-removal denial and natural cleanup.
These are source and focused results, not complete Windows LAN qualification;
later increments use targeted verification as requested by the user.

## Remaining integration

Discovery does not yet open the remote Workspace SPA. A confined per-window
bridge, actual assets and remaining APIs, Plugin UI, live events and revocation,
certificate renewal, and Source/Node transport are still required. Protected
storage on the installed product, two physical Windows PCs, signed installation,
update and restore need separate evidence. Native stays off at launch; the
supported release transport and public SDK compatibility remain unchanged.
The Zod High gate remains blocked without an audit exception.

Rollback removes this discovery action and its exact GET route while preserving
existing Host registrations, protected credentials and all Workspace data.
