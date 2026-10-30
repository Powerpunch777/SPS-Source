# SPS Product Architecture

Last updated: 2026-10-28

## Purpose

The confirmed [Core completion policy](CORE-COMPLETION-POLICY-ko.md) supersedes
older Marketplace and Builder requirements below. SPS runs solutions developed,
reviewed and approved through its own delivery business. It does not operate a
public Plugin marketplace. Internal package management and SDK/Runner extensibility
remain Core responsibilities; new Builder work waits for its separate handoff.
Full untrusted-code OS containment is deferred, with research preserved.

SPS is a customizable workstation platform for individuals, teams and
customer-specific programs. Core supplies reusable technical infrastructure;
plugins define each program. AI is optional. The initial supported client remains
Windows Desktop; this direction does not qualify enterprise hosting or other
operating systems. A neutral Workspace does not imply a company chart, Task
board, Room model, Agent requirement or memory policy.

The business direction prioritizes one useful game-development workstation and
reusable customer-specific plugin delivery. Public self-service Marketplace and
payments are not prerequisites. SPS Core stays private and the Plugin SDK public;
no repository visibility or license is changed by this plan.

The [Windows native connectivity plan](WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md)
retains the target of built-in Windows Host/Member/Node LAN without an external
Tailscale installation, account or Serve dependency. Per the user's 2026-10-28
direction, additional Native development is deferred while Core and local Desktop
stability take priority; follow the [deferral record](NATIVE-DEVELOPMENT-DEFERRED-ko.md).
Native remains unqualified and does not replace currently supported transports. Linux
Headless Host, macOS and WAN/relay implementation are deferred; Linux CI remains
a regression gate, not product support.

The [multi-backend plan](MULTI-BACKEND-WORKSTATION-PLAN-ko.md) preserves the
execution boundaries and existing bounded implementations. Its
[reuse audit](../reviews/MULTI-BACKEND-REUSE-AUDIT-2026-10-25.md) distinguishes
existing source contracts from new targets and actual verification.

The first product path is a Host computer that runs the SPS Server locally.
Members may join through Tailscale and use approved Agent runtimes on their
own computers. Browser access is not a supported product path; the Desktop
application is the client.

The currently supported remote transport requires Tailscale `1.52.0` or later.
SPS checks the installed version before creating or repairing a Serve route.
Tagged devices do not receive Tailscale user identity headers, so they are not
supported as human Member clients in this first release.

## Target Architecture (2026-10-25)

This is the authoritative product direction, not a statement that the current
checkout implements it. The current-state gaps and migration sequence are
tracked in the [Core/Plugin gap audit](../reviews/CORE_PLUGIN_ARCH_GAP_AUDIT.md)
and [migration plan](../reviews/CORE_PLUGIN_ARCH_MIGRATION_PLAN.md).
The [implementation progress](../reviews/CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)
separately records Native recovery v1, the zero-Agent redirect removal, manual
update application, and the narrowly scoped Windows canary. None completes the
entire target or changes the installed application by itself.

- A valid Workspace may have zero Primary plugins, zero Agents, and zero
  Extensions. None is a prerequisite for creating or using a Workspace.
- `Primary` is an optional designation for the default entry Shell, with at
  most one selected per Workspace. It is not a privilege tier. Extensions may
  independently provide full UI, dedicated windows, full-screen views,
  headless behavior, and the ordinary SDK capabilities they declare.
- Core does not require a common Workspace Shell, Dashboard, or Inbox UI.
  Existing Shell, Dashboard, and Inbox APIs and stored data remain available
  for compatibility and optional use; this direction does not authorize their
  deletion or forced migration.
- Core management and recovery must be reachable through Native system UI
  outside Plugin UI and without loading Plugin code. This independent path is
  a prerequisite to removing any existing common Core UI; it is not yet a
  claim of implementation.
- Package installation remains Host-scoped; activation, settings, data, and
  execution policy are Workspace-scoped. Workspace-scoped Job code already
  exists, but it does not by itself provide complete Workspace process
  isolation, stop semantics, or execution control.

### Local and Tailscale trust boundary

The Host local API is reached through the SPS Desktop application. A direct
`.ts.net` value in the `Host` header is only a hostname claim; it is not proof
that the request passed through Tailscale Serve. Tokenless loopback access is
allowed only when structured Tailscale Serve provenance is present, including
the trusted Serve identity and loopback connection context. SPS validates the
request shape emitted by Tailscale Serve: a loopback socket peer, matching
`.ts.net` `Host` and `X-Forwarded-Host`, `X-Forwarded-Proto: https`, one valid
`X-Forwarded-For` address, `Tailscale-User-Login`, and the official
`Tailscale-Headers-Info` marker. A partial or mismatched header set never
creates Serve provenance.

This boundary treats native processes running as the same local user as part
of the trusted local threat boundary. A malicious local process can still
forge local headers, so stronger separation would require OS-level or
cryptographic process attestation. Tailscale transport and Serve identity
protect the remote path; they do not provide that stronger local-process
isolation.

### Native Windows LAN target (not supported yet)

Trusted Core/Host/Member services, not ordinary plugins, will own TLS, server
identity, authenticated users, approved devices, sessions, revocation and current
Workspace authorization. Native system UI must support initial pairing/device
approval and recovery with zero Agents and zero Plugins. The public SDK starts
with a small approved-Connection read/status/observe facade; no raw credentials,
TLS private keys, arbitrary sockets or final authorization move into plugins.

Member pairing must not grant Node execution or Host Source access. Existing
SPS Identity/Workspace/Node checks are reuse candidates, but TS headers, Host
strings and LAN reachability are not authentication for the new path. Current
SMB Source sharing and a private-team Owner recovery flow also depend on TS;
they require independent migration before claiming a Tailscale-free product.
The [RFC](WINDOWS-NATIVE-CONNECTIVITY-RFC-ko.md) leaves trust enrollment, device
credentials, listener/firewall policy and Source transport decisions explicit.
Existing connections, data, keys, support matrix and release holds remain intact.

A Core foundation provides Host-scoped Member device records, approval/revocation,
current Workspace/user authority and non-authorizing audit history, plus a
real-socket mTLS helper and optional event-WebSocket checks. Local Core Settings
now connects bounded device listing and explicit approve/revoke after protected
Host identity preparation and a Host restart. It requires the exact current
Owner session, local Desktop proofs and Main-owned Host binding; it grants no
Workspace, Plugin, Agent, Node or Source access. Confirmation is bound to the
captured account/Host/generation and exact device metadata, and stale UI results
are cleared. The Native network listener and Member enrollment remain inactive.
The [local management record](../reviews/NATIVE-HOST-MANAGEMENT-VERIFICATION-2026-10-25.md)
and [prepared-Host source acceptance](../reviews/NATIVE-PREPARED-HOST-ACCEPTANCE-2026-10-26.md)
separate the actual Main/Core empty-list read/restart with zero Agents and plugin
startup disabled from missing security-confirmation, enrolled-device approval,
two-PC and signed-release acceptance. Existing [device foundation evidence](../reviews/NATIVE-MEMBER-DEVICE-SOURCE-VERIFICATION-2026-10-25.md)
does not qualify initial pairing, complete ingress coverage or renewal.
An internal [one-use pairing store](../reviews/NATIVE-PAIRING-STORE-VERIFICATION-2026-10-25.md)
now atomically consumes an invitation and registers a pending first-time device,
without granting membership or execution. It is not wired to a real enrollment
endpoint. Approved Desktop defaults are any Google/SPS-verified recipient,
one-hour lifetime and consumption on the first successful registration request.
An inactive [enrollment HTTP boundary](../reviews/NATIVE-ENROLLMENT-HTTP-BOUNDARY-2026-10-26.md)
now composes existing session/pairing services with strict request limits and a
deadline/disposal transaction guard. Real loopback TLS/mTLS and temporary DB
tests do not mount it in product startup or qualify app enrollment, LAN, general
Core proxying, complete HTTP/WS authorization or physical Member access.

## Product Boundary

### Optional execution and external management

Plugins may use no AI, direct model requests, approved CLI execution or an
external Agent runtime. Model inference, process lifecycle and Agent sessions
are not interchangeable operations. OCE is a separate optional Agent deployment
and management control plane; it is not the common model API or the owner of
SPS local plugins. No adapter is selected or installed automatically.

The existing Node run/grant/usage contracts and public SDK `platform` Agent
sessions are reuse candidates. The current OpenClaw Gateway adapter must be
qualified against pinned client/Gateway versions; its presence and mock tests
do not qualify OCE or a real deployment. A bounded model-request broker now has
a mock-first source implementation, with Host connection/grant management,
durable idempotent runs, revocable result delivery and a separate technical
history lane. Its configuration UI and real-provider qualification remain open;
the OCE connector remains planned. Exact backend identity, run ownership, capability
support and cancellation evidence must remain visible.

Host Sources do not automatically become paths in a remote Gateway or Harness.
Approved data transfer, immutable revision and explicit result-application rules
are required before remote file work. Workspace policy, external resource
authority and actual OS/renderer isolation are independent checks. No existing
credentials, files, access grants or installations are migrated by this design.

### SPS Core owns the reusable technical foundation

- Desktop sign-in, local Host lifecycle, Owner Vault, backup, export, update,
  diagnostics, and Windows packaging.
- Technical Host/Member/Node connection, current Tailscale private access, Node
  discovery and runtime availability; planned native LAN security remains in
  trusted Core/Host/Member services, not ordinary plugins.
- Host-selected Workspace Sources and encrypted, Node-specific source routes.
- Neutral Run, Artifact, Event, Job, Log, storage, secret-handle, and
  connector primitives.
- Plugin package inspection, compatibility checks, staging, lifecycle,
  Workspace-scoped activation, update, rollback, and isolated plugin data.
- Generic plugin capabilities: optional UI contributions, settings, tools,
  jobs, and future detached Preview windows. UI is not required for an Extension.
- Existing Workspace Shell, Dashboard, and Inbox contracts and data for
  compatibility and optional use. They are not mandatory product surfaces;
  when used, Core owns their technical contracts and plugins own workflow
  meaning.
- Native Core management and recovery, independent of Plugin UI, once the
  recovery prerequisite has been implemented and verified.
- Internal Registry, approved package metadata, integrity/compatibility checks,
  explicit Host installation, activation, update, removal and rollback. Public
  discovery and Marketplace Assistant execution are retired.

`Host` and `Member` are technical connection roles only. Core does not define
business hierarchy, approvals, or who should lead a project.

### Plugins own how work is performed

- Room, Task, board, reporting, review, role, Lead/Worker, and approval
  models.
- Long-term memory policy, compaction policy, and domain-specific documents.
- Game, web, app, research, personal automation, or any other workflow.
- Which enabled Agent/runtime should be used for a particular workflow.

This boundary lets one company use a game-production Workplane while another
company uses an app-development or OpenHands-like workflow without changing
SPS Core.

The retained compatibility contracts for Shell, Dashboard, and Inbox are
described in
[WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md).
The target permits no Primary or one Primary per Workspace and multiple
Extensions; it does not require the retained surfaces or restrict Extension
UI. Native recovery independent of Plugin UI is a prerequisite, not a current
implementation claim.

## Navigation Rule

Plugin management has one home: **Settings > Plugins**. SPS must not expose a
duplicate top-level `Plugins` management screen.

Settings > Plugins contains:

- Official Registry search and plugin details.
- Installed plugins, Workspace activation, disable, update, and rollback.
- Local Development Registry management.
- Personal plugin staging, technical checks, and activation.
- Plugin-specific settings and internal package management.

`Plugin Builder`는 plugin-management 화면이 아니라 번들 플러그인이 제공하는
실제 제작 화면이다. 따라서 활성 상태에서는 Workspace navigation에 `Plugin
Builder`를 표시할 수 있다. 공개 Marketplace는 제공하지 않으며, 내부 패키지 조회와
설치, 업데이트, 활성화, 비활성화, 삭제와 Registry 관리는 계속
**Settings > Plugins**에서만 수행한다. Builder의 제작 화면이 보인다고 해서
플러그인이 설치되거나 활성화되는 것은 아니다.

An enabled plugin may still contribute its *actual work surface* to the
Workspace. For example, a Team Workplane may show Rooms or Tasks. That is not
a second plugin-management screen; it is the function supplied by that
plugin.

## New Workspace Experience

1. The user signs in and creates or joins a Host using supported private networking.
2. A Workspace can start with zero Plugins and zero Agents; Core management stays reachable.
3. The Host reviews approved internal packages and their compatibility/permissions.
4. Installation, activation, update, disable, removal and rollback use Core management.
5. Existing SDK/Runner contracts support delivered solutions without Plugin Builder.

Public search/recommendations and Builder authoring are not prerequisites.

## Plugin Builder

New Builder development is on hold until its final design/handoff is provided
following Core completion. Do not infer its future architecture from the existing
implementation. Existing Builder code and SDK integration remain compatibility
constraints. The following implementation notes are historical source behavior,
not new requirements or a Core release gate.

### Builder Agent Structure

Implemented in source (2026-10-24): each Builder conversation uses one selected
Lead and zero or more optional Workers (currently bounded to 12). The user
selects the Lead before sending; the Lead can work alone when no Workers are
configured.

The Lead is the user's conversation partner, divides and delegates work when
useful, reviews Worker results, and reports the integrated outcome. Workers
perform bounded assignments and return results to the Lead. The Lead decides
how to divide work; Core does not prescribe a task decomposition or profession.

These roles and delegation rules belong to Plugin Builder. Core supplies the
existing Agent/runtime execution, scoped resources, run records, and generic
plugin services. Other workflow plugins may choose a different Agent structure.
The Lead can delegate only to selected Workers and read their reports; stop
targets the selected Lead run, not its Workers. Adding a Worker does not create a
CLI account or grant access to an unapproved runtime or Source. Workspace-scoped
conversations, transcripts, attachments, event steps and reports are implemented.
After restart, interrupted turns are not automatically repeated; cancellation
and recovery remain bounded by the existing session/run contract.

The user works in the existing SPS window:

- They describe the desired workflow to an Assistant. File work is performed
  through the Agent's separately approved workspace tools; this flow has not
  been verified with a paid provider.
- Plugin source stays in a separate external project folder or Git repository,
  never in SPS application files. A Host can open Developer Mode from a Builder
  conversation and explicitly link a previously connected external project.
  This is a Host-local navigation reference, not Source access or CLI authority.
  The Host still chooses the external folder and explicitly runs the gates.
- The existing SPS screen remains the place for conversation, change review,
  file inspection, run status, and test results.

The result is shown in a separate **Plugin Preview** window:

- It runs the plugin in an isolated development Workspace.
- It lets the user inspect the plugin's actual UI and behavior while the main
  SPS window remains open for conversation and development.
- It must not modify the production Workspace, its source folders, or enabled
  plugins.
- Closing Preview never closes SPS or deletes the plugin project.

Core provides the generic detached-window and isolated-execution capability.
Plugin Builder chooses to use it; another authoring plugin may use the same
capability differently. The source implementation records append-only authoring
evidence, while Desktop Developer Mode independently runs build, validation and
test gates against a stable source/output fingerprint, packages the candidate,
and opens it in an isolated Preview. The Preview can be archived as a local
development build; this does not change production Workspace plugin state.
Builder authoring tools do not invoke production install or lifecycle actions.
That is the tool boundary, not a policy that rejects an explicit Host decision:
Host installation, activation, update, disable and removal through Settings >
Plugins remain unchanged. The read-only **Show verified package** action reveals
the last Preview-verified archive after checking its persisted identity, safe
Vault path and SHA-256; it does not install the package. Public upload, publisher review,
Official Registry signing and community discovery are not implemented.

The current source E2E harness checks registration of seven Builder tools and
executes the five authoring-ledger tools. It exercises SDK scaffolding, manual
Desktop project connection, mandatory Developer Mode gates, a generated page
with an interactive counter in isolated Preview, and verified archive reveal.
It uses mock Identity and a no-provider execution; it does not establish
paid-provider file execution or public publishing. Separate unit regressions
cover Lead/Worker delegation, stale builds, restart overlap, callback races and
unconfirmed cancellation. Exact verification results are recorded in the
[delivery plan](PLUGIN-BUILDER-DELIVERY-PLAN.md).

## Controlled SDK Development and Delivery

The SDK supports separate development projects. Production operation is limited
to packages built, reviewed and approved through SPS delivery; a local source or
successful technical validation alone is not that approval.

1. The author builds a separate plugin project with the SPS Plugin SDK.
2. The project is tested and packaged as an `.spsplugin` release.
3. The Host explicitly adds a Local Development Registry folder as a trusted
   local source.
4. SPS verifies package structure, manifest, hash, capability declaration,
   and Core/Desktop compatibility without running the plugin code.
5. The Host stages and activates the version for the selected Workspace.

Keep the existing controlled local-development interface and its explicit Host
review for compatibility. Do not turn it into external self-service distribution.
Technical checks and package integrity remain mandatory; new Builder workflow
requirements wait for the separate handoff.

## Internal Package Management

Core retains the internal Registry, package identity/version, signed release and
integrity/permission review, compatibility checks, explicit Host lifecycle and
rollback. Existing verified metadata contracts remain available for managed
integrations; they do not authorize installation or expose credentials.

Public Marketplace search, recommendations, Assistant sessions/tools and public
publishing/distribution/sales/reputation are outside the product. Retired Assistant
credentials must continue to fail closed. Existing trust records and package data
are not deleted as part of retiring the public surface.

## Export and Import

### Host Transfer

Only the signed-in Host can create a portable Owner Vault transfer bundle. It
contains a fresh database backup plus SPS-managed `storage`, `instances`,
`projects`, and, when present, Default Memory data and journals.
The user approved including SPS-managed Registry plugin packages as well.
The version-2 implementation preserves these files and static review stages;
legacy version-1 bundles remain readable. New-Host review is required before
execution, and external local plugin folders are not silently copied.

It deliberately excludes separate Desktop sign-in storage, Vault encryption
key/secret folders, memory sidecar credentials, live database files, logs,
Tailscale state, CLI login stores, and Host project folders outside the Owner
Vault. The DB snapshot and included managed files are copied unchanged and can
still contain sensitive settings or credentials. The user selected retaining
these contents with a warning; SPS does not encrypt this transfer. After SQL
restore, the sanitizer removes restored session, OAuth, API-key, secret-material,
Node-credential and transient execution records before the new Host starts.
That later cleanup does not sanitize the exported bundle.

Host restore is available only during fresh-Host setup. SPS validates and
restores into a temporary Vault, promotes it only after success, and refuses
to merge with or replace an activated Host.

The destination Host must sign in again, reconnect CLI/API credentials,
Tailscale and Member Nodes, reselect external Workspace Sources, and recheck
plugin compatibility. Prior version-1 transfers omit `registry-staging/packages`
even though installed plugin records/state remain in the DB. The approved
version-2 correction includes managed package files, resets prior-Host activation
and old paths, and requires review/reinstall at the new Host while retaining
plugin IDs and data. Integration qualification remains in progress. See the
[current preservation review](../reviews/PLUGIN-TRANSFER-PRESERVATION-GAP-2026-10-30.md).

### Workspace Packages

Each Workspace can export Core-managed Workspace metadata, Agents, Skills,
Projects, Tasks, comments, routines, portable Git metadata, and environment
input declarations. Import always creates a separate new Workspace. The UI
and API both reject merge, replace, and skip strategies against an existing
Workspace.

Local source contents and credentials are never packaged. Plugin-owned opaque
database, file, and Memory Provider data require a future standard plugin
portability contract. Host Transfer is the current server-level data-preservation
path. Version-1 package-file limits and version-2 integration evidence remain
distinct; copied package bytes never imply automatic executable-plugin trust.

## Implementation Status and Order

The 2026-10-25 target above is not implemented as a whole. Current Core has
reusable legacy Shell selection/activation primitives and Workspace-scoped
Jobs, but that is not equivalent to the optional Primary/Extension model,
independent Native recovery, or full Workspace execution isolation. The gap
audit is authoritative for exact current evidence. Historical, dated tests
below prove only the candidate and scope stated at their date; they do not
prove conformance to this target.

Implemented foundation:

- Windows Desktop Host, Owner Vault, technical Host/Member/Node path,
  Workspace Sources, generic runtime execution, plugin package lifecycle,
  compatibility checks, local development Registry support, Official Registry
  contract, legacy Workspace Shell, Dashboard, Inbox, isolated Plugin Preview,
  Diagnostics, Test Kit, Default Memory provider, and automatic Desktop-update
  mechanism.

Still required before Core completion:

1. Verify approved package install/start/stop/restart/update/rollback and Workspace
   ownership, including uncertain shutdown and abnormal-parent termination.
2. Verify Workspace data/settings/permission boundaries and cleanup after revocation
   or deletion, preserving existing capability/grant/Secret/file controls.
3. Verify multi-Runner assignment, state, interruption and recovery over the supported
   Tailscale/SSH direction with existing SDK compatibility.
4. Complete data-preserving backup/restore/install/update evidence and the required
   Windows/CI/security gates against the same candidate tuple.

Builder authoring, public distribution and full untrusted-code OS containment are
not Core completion gates. See CORE-COMPLETION-POLICY-ko.md for the accepted scope.

## Non-Goals for the First Release

- Browser-first SPS use.
- macOS or Linux support.
- Public community marketplace, payments, or plugin sales.
- A mandatory Task/Room/role/memory process.
- Silent AI-driven plugin installation or lifecycle changes.
