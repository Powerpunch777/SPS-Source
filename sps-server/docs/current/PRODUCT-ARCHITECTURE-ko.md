# SPS Product Architecture

Last updated: 2026-07-31

## Purpose

SPS is a Windows Desktop product for individuals and small teams that want to
assemble an AI-enabled work environment from plugins. It starts as a neutral
Workspace, not as a pre-decided company chart, Task board, Room model, or
memory policy.

The first product path is a Host computer that runs the SPS Server locally.
Members may join through Tailscale and use approved Agent runtimes on their
own computers. Browser access is not a supported product path; the Desktop
application is the client.

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
- Generic plugin surfaces: navigation contribution, settings contribution,
  tools, jobs, and future detached Preview windows.
- Generic Workspace Shell, Dashboard, and Inbox surfaces. Core owns their
  technical lifecycle and safety; plugins own workflow widgets, reports,
  actions, roles, and approval meaning.
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

The detailed Shell, Dashboard, and Inbox boundary is defined in
[WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md).
One Workspace may select one active Shell Provider, while multiple enabled
plugins may contribute widgets and Inbox items. Plugin management, recovery,
updates, diagnostics, and data transfer remain reachable through Core and
cannot be disabled by a Shell Provider.

## Navigation Rule

Plugin management has one home: **Settings > Plugins**. SPS must not expose a
duplicate top-level `Plugins` management screen.

Settings > Plugins contains:

- Official Registry search and plugin details.
- Installed plugins, Workspace activation, disable, update, and rollback.
- Local Development Registry management.
- Personal plugin staging, technical checks, and activation.
- Plugin-specific settings and the Marketplace Assistant.

`Plugin Builder`는 plugin-management 화면이 아니라 활성 플러그인이 제공하는
실제 제작 화면이다. 따라서 활성 상태에서는 Workspace navigation에 `Plugin
Builder`를 표시할 수 있다. 검색과 상세 조회는 Core Marketplace가 담당하고,
설치, 업데이트, 활성화, 비활성화, 삭제와 Registry 관리는 계속
**Settings > Plugins**에서만 수행한다.

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
from Core Marketplace search.

The user works in the existing SPS window:

- They describe the desired workflow to an Assistant.
- The Assistant creates and changes a separate plugin project folder or Git
  repository; plugin source is never inserted into the SPS application files.
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
capability differently. Builder can create a package and Local Registry release
but cannot install, enable, update, disable, or remove a plugin.

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

Implemented foundation:

- Windows Desktop Host, Owner Vault, technical Host/Member/Node path,
  Workspace Sources, generic runtime execution, plugin package lifecycle,
  compatibility checks, local development Registry support, Official Registry
  contract, Workspace Shell, Dashboard, Inbox, isolated Plugin Preview,
  Diagnostics, Test Kit, Default Memory provider, and automatic Desktop-update
  mechanism.

Still required before the first complete product release:

1. Implement Core Marketplace search, details, and adapter-backed Assistant.
2. Extend Plugin Builder into the authoring and personal-plugin test flow.
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
