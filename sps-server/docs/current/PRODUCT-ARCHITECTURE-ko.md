# SPS Product Architecture

Last updated: 2026-10-25

## Purpose

SPS is a Windows Desktop product for individuals and small teams that want to
assemble an AI-enabled work environment from plugins. It starts as a neutral
Workspace, not as a pre-decided company chart, Task board, Room model, or
memory policy.

The first product path is a Host computer that runs the SPS Server locally.
Members may join through Tailscale and use approved Agent runtimes on their
own computers. Browser access is not a supported product path; the Desktop
application is the client.

The initial remote transport contract requires Tailscale `1.52.0` or later.
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

## Product Boundary

### SPS Core owns the reusable technical foundation

- Desktop sign-in, local Host lifecycle, Owner Vault, backup, export, update,
  diagnostics, and Windows packaging.
- Technical Host/Member/Node connection, Tailscale private access, Node
  discovery, and runtime availability.
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
- Marketplace search, plugin details, and the Marketplace Assistant surface.
  Core dispatches Assistant turns through a user-authorized AI adapter and
  exposes only read-only catalog tools.

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
- Plugin-specific settings and the Marketplace Assistant.

`Plugin Builder`는 plugin-management 화면이 아니라 번들 플러그인이 제공하는
실제 제작 화면이다. 따라서 활성 상태에서는 Workspace navigation에 `Plugin
Builder`를 표시할 수 있다. 검색과 상세 조회는 Core Marketplace가 담당하고,
설치, 업데이트, 활성화, 비활성화, 삭제와 Registry 관리는 계속
**Settings > Plugins**에서만 수행한다. Builder의 제작 화면이 보인다고 해서
플러그인이 설치되거나 활성화되는 것은 아니다.

An enabled plugin may still contribute its *actual work surface* to the
Workspace. For example, a Team Workplane may show Rooms or Tasks. That is not
a second plugin-management screen; it is the function supplied by that
plugin.

## New Workspace Experience

1. The user signs in to SPS Desktop and creates or joins a Host.
2. A new Workspace begins neutral, with no hidden Paperclip company structure
   and no mandatory workflow plugin.
3. Core Marketplace is available without enabling a workflow plugin.
4. Keyword, category, compatibility, and verification filters work without an
   AI adapter.
5. For conversational recommendations, the user selects an AI adapter they are
   allowed to use. Core owns the Marketplace Assistant session and its two
   read-only search/detail tools.
6. Search, selection, recommendation, and detail inspection never imply a
   lifecycle action and the Assistant receives no lifecycle tool.
7. The Host opens the Core plugin detail page and performs installation,
   activation, update, disable, or removal manually.
8. If no suitable plugin exists, the Host may enable the bundled Plugin Builder
   and create a plugin in a separate project folder.

## Plugin Builder

Plugin Builder is a bundled product plugin, not a Core workflow rule. It is the
first reference implementation of the authoring platform and remains separate
from Core Marketplace search. The current candidate enables the bundled plugin
for a new Workspace as an initial discovery/authoring tool. Under the
2026-10-25 target it is optional: that candidate default does not make an
Extension, Agent, or Primary mandatory, and existing activation state remains
subject to compatibility rules.

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

## Personal Plugin Path

A user may use an unverified plugin that they created themselves.

1. The author builds a separate plugin project with the SPS Plugin SDK.
2. The project is tested and packaged as an `.spsplugin` release.
3. The Host explicitly adds a Local Development Registry folder as a trusted
   local source.
4. SPS verifies package structure, manifest, hash, capability declaration,
   and Core/Desktop compatibility without running the plugin code.
5. The Host stages and activates the version for the selected Workspace.

This path does not require SPS official review. The local source warning is
intentional: the Host, not SPS, decides to trust their own development code.
Mandatory technical checks cannot be skipped because they prevent malformed
or incompatible packages from damaging the installation.

## Marketplace Phase 1

Marketplace is a feature inside **Settings > Plugins**, backed by the SPS
Official Registry.

Phase 1 provides:

- Search, detail pages, capability declarations, compatibility requirements,
  release notes, and verified publisher information.
- A Core-owned Marketplace Assistant that uses a user-authorized AI adapter.
  Without an adapter, ordinary search and details remain available.
- Read-only `search_marketplace_plugins` and `get_marketplace_plugin` tools.
- Explicit Host installation, Workspace activation, update, disable, and
  rollback.
- Registry refresh independent of a Desktop update. A newly verified plugin
  can appear after catalog refresh.
- Compatibility blocking when a plugin needs a newer SPS Desktop/Core version.

### Implementation status

Core Marketplace search and plugin details are implemented by the SPS
Marketplace route/service and are covered by Core route/service tests and the
packaged Marketplace MCP smoke test. The Core-owned Marketplace Assistant is
also implemented: it uses the selected user-authorized AI adapter and exposes
only the read-only catalog tools above. The Assistant can search, compare, and
recommend; it cannot install or change plugin state.

The remaining Marketplace work is candidate-specific acceptance and registry
productization: verify the complete search/detail/Assistant flow against the
release tuple, refresh and compatibility behavior, and publish the evidence.
This is validation and release work, not implementation of the Marketplace
feature itself.

Phase 1 does not provide public self-service uploads, payment, sales,
ratings, refunds, or a community marketplace. A future Developer Portal may
accept submissions, run automated checks, and support human review before a
package is signed into the Official Registry.

## Export and Import

### Host Transfer

Only the signed-in Host can create a portable Owner Vault transfer bundle. It
contains a fresh database backup plus SPS-managed `storage`, `instances`,
`projects`, and, when present, Default Memory data and journals.

It deliberately excludes account sessions, encryption keys, raw secrets,
memory sidecar credentials, live database files, logs, Tailscale state, CLI
logins, Agent credentials, and Host project folders located outside the Owner
Vault. After SQL restore, SPS also removes restored session, OAuth, API-key,
secret-material, Node-credential, and transient execution records before the
new Host starts.

Host restore is available only during fresh-Host setup. SPS validates and
restores into a temporary Vault, promotes it only after success, and refuses
to merge with or replace an activated Host.

The destination Host must sign in again, reconnect CLI/API credentials,
Tailscale and Member Nodes, reselect external Workspace Sources, and recheck
plugin compatibility.

### Workspace Packages

Each Workspace can export Core-managed Workspace metadata, Agents, Skills,
Projects, Tasks, comments, routines, portable Git metadata, and environment
input declarations. Import always creates a separate new Workspace. The UI
and API both reject merge, replace, and skip strategies against an existing
Workspace.

Local source contents and credentials are never packaged. Plugin-owned opaque
database, file, and Memory Provider data require a future standard plugin
portability contract; until then, Host Transfer is the complete server-level
preservation path.

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

Still required before the first complete product release:

1. Run the Marketplace search/detail/Assistant acceptance flow against the
   exact release tuple and publish its evidence. The feature implementation is
   already present; this item is candidate verification and release gating.
2. Run the current Plugin Builder conversation -> external SDK project -> manual
   Desktop connection -> build/validate/test -> isolated Preview -> package and
   explicit Host review flow against the exact release tuple. The source
   foundation exists; parent verification of the current Host handoff and
   restart/ledger cases is pending. Paid-provider authoring, automatic
   conversation-to-Desktop project binding, public submission, publisher
   review, Official Registry signing and community marketplace lifecycle remain
   outside the verified scope.
3. Complete a physical fresh-machine Host restore acceptance test with a real
   transfer bundle and publish the evidence.
4. Complete direct, two-computer Host/Member acceptance tests and publish a
   signed Windows release to validate real automatic updates.

## Non-Goals for the First Release

- Browser-first SPS use.
- macOS or Linux support.
- Public community marketplace, payments, or plugin sales.
- A mandatory Task/Room/role/memory process.
- Silent AI-driven plugin installation or lifecycle changes.
