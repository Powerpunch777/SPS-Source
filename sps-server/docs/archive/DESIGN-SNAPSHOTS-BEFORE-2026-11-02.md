# 2026-11-02 정렬 이전 설계 스냅샷

보존 목적의 과거 문서다. 현재 제품 정책이나 구현 지시로 사용하지 않는다.
현행 기준은 [설계 적용 기준](../current/DESIGN-BASELINE-2026-11-02.md)이다.
아래 블록은 원래 current 문서의 내용으로, 과거 시험·실패·리비전 기록을 보존한다.
블록 안 상대 링크는 당시 원래 파일 위치 기준이며 활성 링크가 아니다.

## current/PRODUCT-ARCHITECTURE-ko.md

``````markdown
# SPS Product Architecture

Last updated: 2026-11-01

## Purpose

The confirmed [Core completion policy](CORE-COMPLETION-POLICY-ko.md) supersedes
older Marketplace and Builder requirements below. SPS runs solutions developed,
reviewed and approved through its own delivery business. It does not operate a
public Plugin marketplace. Internal package management and SDK/Runner extensibility
remain Core responsibilities. New Builder work follows its v15 design in the
separate [SPS-MY-PluginBuilder repository](https://github.com/Powerpunch777/SPS-MY-PluginBuilder),
independently of this repository's Core completion work.
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

New Builder design, implementation and UI belong to the separate
[SPS-MY-PluginBuilder repository](https://github.com/Powerpunch777/SPS-MY-PluginBuilder),
whose v15 design is authoritative for that plugin. The user authorized parallel
development on2026-11-01. Do not implement its workflow in Core or infer its
architecture from the older bundled `sps-plugin-discovery`. Existing bundled
code and SDK integration remain compatibility constraints. The following notes
are historical source behavior, not new Builder requirements or a Core release gate.

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
``````

## current/CORE-COMPLETION-POLICY-ko.md

``````markdown
# SPS Core 완성 기준과 확정 제품 정책

확정일: 2026-10-28. 이 문서는 이전 문서의 공개 Marketplace, Builder 선행 개발,
완전한 비신뢰 코드 OS 격리 우선 요구보다 우선한다. 구현 완료 선언은 아니다.

## 제품과 현재 범위

2026-11-01 사용자 추가 지시: Core 안정화와 별도로
[`Powerpunch777/SPS-MY-PluginBuilder`](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)의
v15 설계에 따른 Builder 개발을 별도 레포에서 병행한다.
같은 날 장기목표도 Core 필수 완성 범위를 유지하면서 해당 Builder의 구현과
실제 앱 검증을 병행하는 것으로 다시 설정했다. Core 완료와 Builder 완료는
각각의 증거로 판정하며, 어느 쪽의 통과도 다른 쪽의 미완성을 대체하지 않는다.
별도 저장소·작업 폴더와 고정된 공개 SDK를 사용하며, Builder의 신규 기능을
Core 완성의 선행조건에 추가하거나 미해결 Core 실패를 완료로 바꾸지 않는다.
공개 Builder 저장소에 비공개 Core 소스·사용자 데이터·자격증명을 복사하지 않는다.

SPS는 자체 외주 사업에서 제작·검증·승인해 납품한 솔루션을 실행·관리한다.
Core의 기술 계약은 범용성을 유지하지만 외부 개발자의 자유로운 게시·판매·평판·
커뮤니티 유통이나 공개 Marketplace는 제공하지 않는다.

Core는 Workspace, 데이터·설정·권한, 통신, Plugin 설치·실행·프로세스 생명주기·
복구, Runner 연동과 관리 인터페이스를 소유한다. 내부 Registry, 패키지 식별·버전·
무결성·승인, 설치·업데이트·제거·롤백은 유지한다. 공개 탐색 UI/API와 관리용
Registry·패키지 검증을 같은 기능으로 취급하지 않는다.

신규 Plugin Builder의 설계·코드·UI·구현 계획의 기준은 별도
`SPS-MY-PluginBuilder` 레포다. `SPS-Source`와 비공개 `SPS-Core`에는
Builder 전용 업무 흐름이나 신규 제품 기능을 추가하지 않는다. 이 레포의 기존
`sps-plugin-discovery`는 호환성 유지 대상이며 신규 Builder의 설계 원본이 아니다.
Builder 기능·역할·세션·기억·Runner·UI를 결정할 때는 해당 레포의
`docs/design/README.md`가 안내하는 현행 통합 설계서를 먼저 따른다.
현재 기준은 `docs/design/01_Design/SPS_Plugin_Builder_Codex_Final_Design_v15.md`이며,
기술 조사와 UI 참조도 같은 레포의 연결 문서를 사용한다. 이 레포의 오래된 설명이나
과거 대화로 Builder를 다시 설계하지 않는다. 통합 설계서가 명시한 실제 Core/SDK
계약·보안 제약의 우선순위와 미검증 연동 구분은 유지한다.
기존 코드 호환성, SDK·Plugin 계약과 실행·배포 연동 여지는 보존한다. Builder 없이도 Core와
기존 SDK만으로 승인한 Plugin을 설치·실행·관리할 수 있어야 한다.

Core·Desktop 완성 작업이 끝나면 플러그인 신규 개발에 들어가기 전에 멈추고 결과를 보고한다.
이 정지는 Core 완성 목표의 범위이며, 별도 지시된 Builder 레포의 병행 개발까지
금지하는 뜻이 아니다. 추가 솔루션 개발은 사용자의 별도 시작 지시를 따른다.
기존 Core 플러그인 실행·SDK·권한·복구 호환성 검증은 계속 유지한다.

AI와 Agent는 필수가 아니다. Runner는 실제 작업을 수행하는 실행 컴퓨터이며
Target 또는 Agent와 동일시하지 않는다. 기존 Node 명칭·wire protocol·SDK 계약은
호환성을 위해 유지하고, 용어 변경을 대규모 개명 작업으로 확대하지 않는다.
통신·원격 관리는 확정된 Tailscale 사설 네트워크와 SSH 방향을 유지한다.
추가 Native LAN 개발은 [보류 기록](NATIVE-DEVELOPMENT-DEFERRED-ko.md)을 따른다.

2026-10-30 이동용 내보내기는 현재 DB snapshot·포함 파일의 민감값을 유지하되,
민감정보가 포함될 수 있고 SPS가 이동 파일 자체를 암호화하지 않는다고 명확히 안내한다.
기존 기기 개인키·로컬 로그인 저장소·별도 Vault secret 경로를 추가로 포함하지 않는다.
일반 전체 백업과 복원 후 자격증명·실행 권한 정리도 그대로 유지한다.
[내보내기 민감정보 검토](../reviews/OWNER-VAULT-EXPORT-SENSITIVITY-2026-10-30.md)를 따른다.

## 보안 경계

지원 Plugin은 자체 제작·검토·승인한 패키지다. 일반 Worker는 현재 같은 OS 사용자
권한으로 실행되며 완전한 악성 코드 샌드박스가 아니다. API 권한·폴더 경로 검사와
별도 프로세스만으로 Windows 파일·네트워크·자격증명 격리를 보장하지 않는다.

AppContainer 연구·실험 코드는 보존한다. 제품용 완전한 비신뢰 코드 OS 격리는
1차 Core 완성의 필수 조건에서 제외하며, 이 결정을 이유로 기존 capability·grant·
Secret 중개·파일 API 범위·패키지 검증·통신 인증·종료 확인을 약화하지 않는다.
향후 격리 실행기를 추가할 수 있는 Core 실행 계약과 Runner 확장성도 유지한다.

## 필수 완료 증거

| 영역 | 필요한 코드·실행·검증 증거 |
| --- | --- |
| 독립 운영 | Builder·공개 Marketplace·AI 없이 설치·시작·운영·관리 가능 |
| Plugin 생명주기 | 설치·시작·중지·재시작·오류·업데이트·롤백, 정확한 프로세스 소유권과 종료 확인 |
| 비정상 종료 | 잔여 Worker·자손 프로세스의 안전한 종료 또는 소유권을 증명한 복구. 알 수 없는 PID 인수·강제 종료 금지 |
| Workspace | 데이터·설정·권한·실행 분리, 삭제·권한 변경 시 자원 정리, 다른 Workspace 접근 거부 |
| 보안 | capability·grant·Secret·파일 범위·패키지 무결성·승인·Core/Plugin 통신 검증 |
| Runner | 여러 실행 컴퓨터 등록·배정·상태·실패·중단·복구, Core/Runner 책임과 SDK 호환성 |
| 데이터·배포 | 설치·업데이트·롤백·복구 중 기존 데이터와 인증정보 보존 |
| 검증 | 변경별 선택 검사와 실제 필수 통합·Windows·CI 증거. 미선택·건너뜀·실패·다른 revision 결과 구분 |

공개 Marketplace·Builder 신규 개발·완전한 비신뢰 OS 격리를 이유로 Core 완성을
지연하지 않는다. 반대로 실제 필수 결함·검사 실패·미확인 종료·보안 게이트를
범위에서 제외하거나 예정 문서로 대신해 완료 처리하지 않는다.

기존 코드·검사와 미커밋 작업을 보존하며 실제 결함과 미완성 통합부터 수정한다.
전체 로컬 검사는 필요할 때만 실행하고, 우선 작은 관련 검사를 사용한다.

완료 보고는 현재 완성도와 근거, 실제 변경, 남은 필수 항목, 검사·CI 결과,
공개 Marketplace 정리 결과, 후순위 기능과 이유, Builder 핸드오프 전 남은 작업을
구분한다. 현재 상태는 로드맵과 최신 검증 기록에서 별도로 확인한다.
``````

## current/PRODUCT-MODEL-ko.md

``````markdown
# SPS 제품 모델

최종 갱신: 2026-11-01

이 문서의 현재 범위는 [Core 완성 정책](CORE-COMPLETION-POLICY-ko.md)을 따른다.
제품 모델 설명은 구현·검증 완료 선언이 아니다.

SPS는 개인·팀·기업별로 필요한 프로그램을 Plugin으로 구성하는 범용 워크스테이션
기반이다. AI는 필수가 아니며 일반 UI·데이터·고정 규칙 자동화도 제품 범위다.
현재 지원 클라이언트는 Windows Desktop이고 기업 배포의 운영·격리 검증은 별도다.
처음부터 특정 회사 조직도, Task 보드, Room, Agent, 역할, 메모리 방식을 강제하지 않는다.

Core는 비공개, Plugin SDK는 공개를 유지한다. 초기 실증은 게임 개발 워크스테이션,
사업 방향은 고객별 Plugin 제작·납품과 공통 기술 재사용이다. 자체 제작·검토·승인한
Plugin을 운영하며 공개 Marketplace나 외부 개발자의 자유로운 게시·판매·커뮤니티
유통은 제공하지 않는다. 내부 Registry와 패키지 검증·승인·관리는 유지한다.

## 시작점

1. 사용자는 SPS Desktop에서 Host를 만들거나 기존 Host에 참여한다.
2. 새 Workspace는 중립 상태로 시작한다.
   Agent 없는 상태도 유효하며, 선택된 사용 가능한 Shell이 없으면 독립 빈 화면을
   제공한다. 특정 Plugin이나 Builder의 활성화를 Core가 필수로 요구하지 않는다.
3. 필요한 승인 Plugin의 실제 설치, 활성화, 업데이트, 비활성화·제거는 Host가
   **설정 > 플러그인**에서 패키지와 권한을 검토하고 명시적으로 결정한다.
4. AI가 필요한 경우에만 기존 권한 계약에 따라 모델 API·승인된 CLI·외부 Agent
   세션 중 필요한 경로를 사용한다. AI 없이도 일반 Plugin을 운영·관리할 수 있어야 한다.

공개 탐색·추천과 Marketplace Assistant는 제품의 정상 시작 경로에서 철회됐다.
내부 Registry·패키지 검증은 공개 Marketplace와 구분하며, Plugin이나 대화가
Host의 설치·활성화 승인 및 실행 권한 검사를 대신하지 않는다.

## 제품의 두 층

### SPS Core

Core는 Desktop, Host/Member/Node 연결, Workspace Source, 선택적 AI Runtime,
실행 기록, Artifact, 데이터·설정·권한, 보안 저장소, 백업, 업데이트, 진단,
내부 Registry와 플러그인 수명주기처럼 여러 작업 방식에서 공통으로 필요한
기술 기반을 제공한다. 업무 흐름·조직·역할·대화 정책은 강제하지 않는다.

AI 실행은 모델 API·승인된 CLI·외부 Agent 세션 중 필요한 경로만 선택한다.
OCE는 선택적인 별도 Agent 관리·배포 Connector이며 모델 공급자나 Core 필수 요소가
아니다. 기존 실행 API를 재사용하고 신규 Port는 실제 간극이 있을 때만 추가한다.
보호 미지원은 명시적으로 거부하며 기존 Workspace scope를 OS 격리로 표시하지 않는다.

### Plugin

Plugin은 실제 작업 방식을 정의한다. 예를 들어 게임 제작 Workplane은 Room, Task,
Lead/Worker, 리뷰, 장기기억을 만들 수 있고, 웹 개발 Plugin은 전혀 다른 화면과
규칙을 만들 수 있다. 이런 업무 의미는 Core의 기본 규칙이 아니다.

2026-11-01 사용자 승인으로 `Plugin Builder`는 별도 공개 저장소
[`Powerpunch777/SPS-MY-PluginBuilder`](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)와
작업 폴더에서 v15 설계에 따라 병행 개발한다. 고정된 공개 SDK를 사용하며 비공개
Core 소스·사용자 데이터·자격증명을 복사하지 않는다. Builder 신규 기능은 Core
완성 목표·선행조건에 포함하지 않고, Core 필수 검증이나 미해결 실패를 대체하지 않는다.
Builder 없이도 Core와 기존 SDK만으로 승인 Plugin을 설치·실행·관리할 수 있어야 한다.

## 용어

| 용어 | 의미 |
| --- | --- |
| Host | Workspace와 공유 Source를 관리하는 기술적 기준 컴퓨터 |
| Member | Host에 참여해 허용된 도구와 Node를 사용할 수 있는 사용자 |
| Node | 특정 컴퓨터의 CLI, 로컬 AI, 연결 도구를 SPS에 제공하는 실행 지점 |
| Workspace Source | Host가 선택한 프로젝트 폴더에 대한 보호된 접근 경로 |
| Plugin | SPS 위에 실제 업무 흐름과 UI를 추가하는 독립 패키지 |

Host와 Member는 기술 연결 역할일 뿐 회사의 상하 관계를 뜻하지 않는다. 어떤
사람이나 AI가 어떤 일을 할지는 선택한 Plugin이 결정한다.

## 지원 범위

- 첫 번째 지원 대상은 Windows 10/11 x64와 Tailscale 기반의 Host/Member 연결이다.
- SPS는 Desktop-first 제품이다. 일반 브라우저는 Workspace 사용 경로가 아니다.
- 공식 Registry와 개인 Local Development Registry를 모두 지원하는 방향이다.
- 커뮤니티 판매, 결제, 공개 업로드 Marketplace는 제공하지 않는다.

Source `9e903d3`의 Windows·legacy recovery·물리 Runner 검증은 아직 미통과다.
진행 중인 CI나 Builder 개발 결과를 Core 완료 근거로 계산하지 않는다. 현재 근거와
남은 필수 항목은 [최종 검증 기록](CORE-FINAL-VALIDATION-2026-10-30.md)을 따른다.

세부 제품 계약은 [PRODUCT-ARCHITECTURE-ko.md](PRODUCT-ARCHITECTURE-ko.md)를
따른다.

다중 백엔드 전환의 재사용/권한/원격 파일/첫 구현 범위는
[MULTI-BACKEND-WORKSTATION-PLAN-ko.md](MULTI-BACKEND-WORKSTATION-PLAN-ko.md)를 따른다.
``````

## current/ROADMAP.md

``````markdown
# SPS 구현 로드맵

최종 갱신: 2026-11-01

**확정 범위:** [Core 완성 정책](CORE-COMPLETION-POLICY-ko.md)이 아래 이전 단계 기록보다
우선한다. Core는 AI 선택형·워크플로 중립 기반이며 공개 Marketplace 탐색·추천과
Marketplace Assistant는 정상 시작 경로로 제공하지 않는다. AppContainer 연구는 보존하되 완전한
비신뢰 OS 격리는 1차 필수 조건에서 제외한다. 내부 Registry·검증·설치·업데이트,
SDK·Runner와 기존 보안은 유지한다. Core 작업의 최우선 목표는 독립 운영 가능한
SPS Core 완성이다.

2026-11-01 사용자 승인으로 Builder는 별도 공개 저장소
[`Powerpunch777/SPS-MY-PluginBuilder`](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)와
작업 폴더에서 고정된 공개 SDK·v15 설계로 병행 개발한다. 이전의 핸드오프까지 보류·
Core 완료 후 착수 문구는 이 추가 지시로 대체된다. Builder 신규 기능을 Core 완성
목표·선행조건으로 추가하거나 Core 필수 검증·미해결 실패를 대체하지 않는다.
신규 Builder의 기준은 해당 레포의 통합 설계 v15, HTML v9 화면구조,
`UI-IMPLEMENTATION-CONTRACT-2026-11-01.md` 시각 기준이며, 플러그인 영역은 Codex 앱처럼
깔끔한 검정·중립 회색으로 표현한다. 이는 Core 전역 테마 변경이나 실제 AI 실행 완료를
뜻하지 않는다. 비공개 Core 소스·사용자 데이터·자격증명은 공개 저장소에 복사하지 않는다.

Source `9e903d3`의 필수 Windows·legacy recovery·물리 Runner 검증은 아직 미통과다.
진행 중인 CI를 통과로 기록하지 않으며, Core 완료 여부와 현재 근거는
[최종 검증 기록](CORE-FINAL-VALIDATION-2026-10-30.md)을 따른다.

## 현재 우선순위

제품은 **AI 선택형 범용 워크스테이션**이며 Core 비공개·SDK 공개를 유지한다.
현재 제품 계약은 [아키텍처](PRODUCT-ARCHITECTURE-ko.md)다. 2026-10-28 사용자
요청으로 Native 추가 개발을 보류하고 **Core와 로컬 Desktop 안정화**를 우선한다.
[Windows 내장 연결 계획](WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md)은 후속 설계로
보존하며, [보류 기록과 재개 순서](NATIVE-DEVELOPMENT-DEFERRED-ko.md)를 따른다.
다중 실행 경로의 기반·수용 기준은 [다중 백엔드 계획](MULTI-BACKEND-WORKSTATION-PLAN-ko.md)에 보존한다.
구현 상태와 테스트 증거는 [재사용 감사](../reviews/MULTI-BACKEND-REUSE-AUDIT-2026-10-25.md),
[Core/Plugin 진행 기록](../reviews/CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)으로 분리한다.

Workspace 전용 Plugin은 논리적 권한과 별도 프로세스를 구현했으나 OS 샌드박스는
미완료다. 기존 Host Plugin에는 자동 적용하지 않는다. 최신 범위와 로컬 Desktop
진행 메시지·종료 검증은 [Workspace 격리 상태](../reviews/WORKSPACE-ISOLATION-STATUS-2026-10-28.md)를 따른다.

2026-10-27 현재 Core·Desktop은 Native 등록/복구, 승인된 Workspace 탐색과 격리 창,
개인 Inbox 상태 변경, 선택적 모델 연결 설정 및 Member의 만료 전 같은 키 갱신을
연결했다. [Workspace/Inbox 검증](../reviews/NATIVE-INBOX-STATE-2026-10-27.md),
[모델 설정 검증](../reviews/MODEL-HOST-SETTINGS-2026-10-27.md),
[Member 갱신 검증](../reviews/NATIVE-MEMBER-RENEWAL-2026-10-27.md),
[Host 갱신과 Member target 전환](../reviews/NATIVE-HOST-RENEWAL-2026-10-27.md)이 각 범위와 한계를 기록한다.
Native 기본값은 OFF다. issuer 회전·만료 후 신뢰 복구, Native Source/Node, 실제 AI 실행,
설치/업데이트/복원과 물리 두 PC 및 보안 게이트는 남아 있다.
후속 [Native Plugin 실행 기반](../reviews/NATIVE-PLUGIN-EXECUTION-FOUNDATION-2026-10-27.md)은
기존 앱 작업자와 비공개 고정 호출을 연결하고 호출별 현재 권한·취소·결과 전달 경계를 추가한다.
실제 선언 shell/widget 화면은 별도 Native Plugin 창에서 실행하고, 상대 모듈·CSS/자산과
데이터/액션 호출을 연결했다. joined Electron/Core/DB E2E에서 상태 변경·비활성화 차단과 자연 종료를 통과했으며,
스트림·Host 탐색/알림·전체 공개 SDK 지원은 미완료다. 자세한 범위와 증거는
[Native Plugin UI 기록](../reviews/NATIVE-PLUGIN-UI-2026-10-27.md)을 참조한다.
후속 [공개 Native 연결 SDK](../reviews/NATIVE-CONNECTIVITY-SDK-2026-10-27.md)는
현재 호출의 검증된 연결 근거만 읽는 `connectivity.current()`와 전용 read capability를 추가한다.
전체 Host 목록·연결 생성·이벤트 구독·실행 권한을 제공하는 API는 아니며 아직 미출시 소스다.
아래는 단계별 이전 구현·검증 이력이며, 전체 플랫폼 완성이나 현재 배포 승인을 의미하지 않는다.

최신 local 관리 increment: 준비된 Host의 직접 소유 Core 자식에 Owner 세션 결속
기기 status/list/events/approve/revoke를 연결하고, 독립 Core Settings에 목록과
명시적 승인/철회를 추가했다. 확인창 도중 계정/Host/기기 변경 거부와 이전 목록 제거,
조회/변경 트랜잭션 세션 재검사를 포함한다. LAN OFF·등록/초대/갱신 미연결이며
준비된 Host의 실제 승인 전체 앱 흐름과 두 PC/서명본 검증은 남아 있다.
[기기 관리 검증](../reviews/NATIVE-HOST-MANAGEMENT-VERIFICATION-2026-10-25.md)을 따른다.

후속 [준비된 Host 소스 앱 수용](../reviews/NATIVE-PREPARED-HOST-ACCEPTANCE-2026-10-26.md)은
시험용 보호 identity를 실제 Main이 재독해한 뒤 기기 관리의 available 빈 목록을
조회하는 경로를 통과했다. Plugin startup 차단/0-Agent/일반 renderer 403과 재시작을
검사했지만 보안 확인창·실제 기기 enrollment/승인·LAN/물리 두 PC 수용은 아니다.

[등록 HTTP 경계](../reviews/NATIVE-ENROLLMENT-HTTP-BOUNDARY-2026-10-26.md)는 기존
세션·초대·발급 서비스를 한도/기한/late-effect guard와 조합해 loopback TLS/mTLS 및
임시 DB에서 검증했다. 제품 mount·앱 세션 교환·LAN listener·HTTP/WS 전체 인가는 미완료다.

1. Windows Desktop/Host/Member/Node를 우선 안정화하고, 외부 Tailscale 없이 동작하는
   내장 **LAN** 경로를 개발한다. Stage 0 감사는 완료했고, 전체 초대코드와 서버 지문
   확인(D1), PC별 mTLS 인증서(D2), LAN 기본 off/명시 opt-in(D3)이 승인됐다. Core 기기
   registry·승인/철회·현재 Workspace 인가·선택적 mTLS/WS 경계와 일회용 pairing 저장은
   source 기반이다. 신뢰된 Host 전용 Core Settings에서 명시 확인 후 인증서를 준비하는
   좁은 경로가 연결됐다. 비활성 Member PKCS#10 요청/인증서 발급과 loopback mTLS 시험도 추가했다.
   고정 issuer PEM/SPKI·Host/device·로컬 키/CSR·chain/profile을 검사하는 recipient validator와,
   계정 issuer origin/subject·Host/device·신뢰 pins를 ciphertext 안에 결속하는 Windows pending capsule도 있다.
   private pending filestore도 구현됐다. Owner Vault 밖의 논리 account/Host/device slot에 first-writer/create-only로
   저장하고 pins는 암호문 안에만 둔다. 덮어쓰기·삭제·자동복구는 없고 caller는 격리 smoke뿐이다.
   발급 응답은 기존 키를 보존한 별도 create-only issued companion에 암호화 저장하고 재독해 시
   pins·원래 키/CSR·chain/profile·현재 인증서 만료를 검사한다. 새 Host issuer는 이전 인증서를
   실제 loopback TLS 1.3에서 거부했다. unit AES는 DPAPI 증거가 아니며, Source `48a35262` Windows CI에서
   실제 43.8.3/24.22.0 DPAPI 재독해는 별도로 통과했다. Main/IPC·GUI·enrollment caller 연결은
   아직 없다. 저장 후 guard 실패는 파일 rollback을 보장하지 않는다.
   [발급 자격 저장 검증](../reviews/NATIVE-MEMBER-ISSUED-STORE-VERIFICATION-2026-10-25.md)을 따른다.
   이는 제품 enrollment·사용자 인증·기기 승인·Workspace/Node/Source grant가 아니다.
   LAN은 OFF: Native LAN listener·방화벽 변경·Member 발급 활성화·enrollment·세션 등록·갱신은 없다.
   D7은 server/Member 90일·issuer 365일과 기존 키 갱신 정책 승인이지, 실제
   갱신 구현은 아니다. 미출시 v2 DPAPI store의 Vault-incarnation 결속·복구·process-local
   interlock 한계는 [계획](WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md)에 기록한다.
   Source `425000cb` CI는 실제 Host/새 Member filestore의 Windows safeStorage 프로세스 간 재독해를
   Electron 43.8.3 / Node 24.22.0에서 통과했다. Settings와 9개 Linux shard/typecheck/build도 통과했지만
   No-AI의 elevated PostgreSQL 거부와 Zod gate로 전체 실패다. Source `1cddbcf7`의 첫 CI 실행기 보완도
   Windows 초기화 오류로 unit 5개 실패해 뒤 E2E가 건너뛰어졌다. Source `1e6152a8`의 시험 전용
   desktop 후속도 동일하게 unit 5개 실패했고 Native/Settings/No-AI는 실행되지 않았다. 새 restricted token의
   default DACL에 사용자 SID를 추가하는 보완은 로컬 8/8이나 elevated CI는 검증 전이다.
   Core `0955e8f63`은 초대별 공개 발급 기록과 실제 mTLS 소켓 완료를 조정하는 비활성 내부 서비스를
   추가했다. 발급은 초대를 소비하지 않고 완료 때만 pending 등록·소비·감사를 원자적으로 처리한다.
   해당 revision의 집중 40/40·전체 typecheck/build와 Core PR CI 15/15 job은 통과했다.
   후속으로 직접 소유한 Main→Core 자식의 공개 서명 IPC 및 명시적 Core factory를 추가했다.
   Main은 현재 Host 세션/저장 identity/account generation을 재확인하고 개인키를 전달하지 않는다.
   중복 Host start는 하나로 합치며 start 중 stop은 늦은 spawn을 차단한다. 채널 disconnect/dispose는
   새 호출과 마지막 DB write를 차단한다. 제품 session caller/등록 UI/ingress·자격 저장 caller·갱신은 아직 없다.
   비활성 session adapter는 실제 SPS Identity 쿠키와 exact session/user/expiry를 발급·등록 트랜잭션에
   결속하며 wrong-secret 예산 전·마지막 write 뒤 재검사한다. 다른 user guard 조합은 거부하고,
   local logout은 shared row lock으로 순서를 정한다. 제품 session exchange/route mount는 아직 없고
   실제 HTTPS·fixture RSA session·mTLS 소스 시험을 물리 PC나 Google 운영 증거로 사용하지 않는다.
   [세션 결속 검증](../reviews/NATIVE-SESSION-ENROLLMENT-VERIFICATION-2026-10-25.md)을 따른다.
   Source `7311041b` push CI `40190150149`는 16/18 job 성공이다. 9개 Linux shard/full build와
   Windows Native DPAPI·Settings·No-AI·packaged Workspace surface는 통과했지만 packaged Preview는
   실제 Assistant 등록의 서버 오류로 실패했고 Zod gate도 차단됐다. Core `ed45c51c` PR CI
   `40190064373`는 15/15 성공이다. 이 CI를 후속 issued companion 검증으로 재사용하지 않는다.
   후속 Source `48a35262` push CI `40197294957`도 16/18 성공이며 companion DPAPI·Settings·No-AI·
   packaged Workspace는 통과했지만 Assistant 등록 500/보류 Zod는 남았다. Desktop의 서버 자산 복사
   누락을 별도 재현하고 패키징 gate를 보완한다. [자산 검증](../reviews/PACKAGED-AGENT-ASSETS-VERIFICATION-2026-10-25.md)을 따른다.
   [서명 채널 검증](../reviews/NATIVE-SIGNER-CHANNEL-VERIFICATION-2026-10-25.md)과
   [CI 채널 관측](../reviews/NATIVE-CI-CHANNEL-CHECKPOINT-2026-10-25.md)을 따른다.
   [등록 조정·CI 후속 검증](../reviews/NATIVE-ENROLLMENT-ORCHESTRATION-VERIFICATION-2026-10-25.md)을 따른다.
   기존 복구·Source·Node 권한과 Zod High `1243066` 보류·Low 2건 등 출시 Gate는 유지한다.
   UI token gate·Tailscale-free Source·Host 승인/복구의 전체 앱/물리 수용도 미완료다.
   정확한 명령·수·runtime·CI revision은 아래 검증 기록에 모으며,
   개발 UI 결과를 서명 설치본 또는 두 PC 증거로 사용하지 않는다.
   [Member 기기 검증](../reviews/NATIVE-MEMBER-DEVICE-SOURCE-VERIFICATION-2026-10-25.md)과
   [pairing 저장 검증](../reviews/NATIVE-PAIRING-STORE-VERIFICATION-2026-10-25.md),
   [Member 인증서 검증](../reviews/NATIVE-MEMBER-CERTIFICATE-VERIFICATION-2026-10-25.md),
   [Member 자격 검증](../reviews/NATIVE-MEMBER-CREDENTIAL-VERIFICATION-2026-10-25.md),
   [pending 저장 검증](../reviews/NATIVE-MEMBER-PENDING-STORE-VERIFICATION-2026-10-25.md),
   [설정/복원 lifecycle 검증](../reviews/NATIVE-SETTINGS-RESTORE-VERIFICATION-2026-10-25.md)을 따른다.
2. Native 초기 연결·승인·철회·복구를 0-Agent/0-Plugin에서도 제공한다. 기존 사용자
   인증·Workspace/Plugin·Node 실행 권한은 분리하고, HTTP/WS 양쪽에 적용한다.
3. API·Owner 복구·Host Source/SMB의 별도 의존성을 이전/검증한다. 실제 Windows 두 PC와
   동일 서명본 수용 전에는 기존 Tailscale/설정/지원표를 삭제하거나 무음 전환하지 않는다.
4. 승인 Connection의 최소 SDK 조회/상태·관측을 공개한다. Plugin에 원시 키/관리자
   소켓 API를 주지 않는다. WAN/Relay 및 Linux 제품 구현은 후속 결정으로 둔다.

아래는 이미 확보한 소스 기반이며 새 연결 완료 증거가 아니다. 이 기반을 보존하면서
CLI/Gateway/OCE의 후속 확장보다 위 Windows 연결 작업을 먼저 진행한다.

## 기존 소스 기반과 후속 실행 경로

1. No-AI reference의 소스 수용을 완료했다. 실제 UI/state/events/Workspace Job,
   A/B 거부·Host 재시작·Native 복구는 [수용 기록](../reviews/NO-AI-WORKSPACE-ACCEPTANCE-2026-10-25.md)을 따른다.
   Node/session 등 기존 계약은 필요한 후속 연결에서 개별 검증한다.
2. Node Runtime의 읽기 전용 연결 관측(Stage 2a)을 기존 API에 추가하고 source
   Desktop에서 검증했다. [관측 수용 기록](../reviews/RUNTIME-DISCOVERY-ACCEPTANCE-2026-10-25.md)을 따른다.
   Host 초기화 API 등록 snapshot과 공개 reader(Stage 2b)도 실제 권한 거부까지
   검증했다. [Host 지원 수용 기록](../reviews/HOST-SUPPORT-ACCEPTANCE-2026-10-25.md)을 따른다.
   안전한 Agent 실행 설정 조회(Stage 2c)는 기존 list/get을 보존하며 config/키 없이
   별도 Node binding 관측을 제공한다. [Agent 수용 기록](../reviews/AGENT-EXECUTION-DESCRIPTOR-ACCEPTANCE-2026-10-25.md)을 따른다.
   모델 요청·CLI·Agent 세션과 OCE 관리의 서로 다른 능력/권한/실행 소유권은 계속 정렬한다.
3. Direct API Stage 3a의 내부 전송/Secret 기반에 Stage 3b의 Host 연결·grant,
   공개 `models.list/submit/get/cancel`, 중복 방지 Run과 별도 실행 기록을 결속했다.
   Host 모델 연결·Plugin 승인 설정 UI는 기존 API에 연결했고,
   실제 제공자 인증은 아직 검증하지 않은 mock-first source 범위다.
   [Host 설정 후속](../reviews/MODEL-HOST-SETTINGS-2026-10-27.md)을 따른다.
   [Stage 3b 검증 상태](../reviews/MODEL-BROKER-ACCEPTANCE-2026-10-25.md)를 따른다.
   [Stage 3a 검증](../reviews/MODEL-TRANSPORT-FOUNDATION-ACCEPTANCE-2026-10-25.md)은
   당시 내부 기반의 증거로만 유지한다. CLI 사례도 승인된 시험 범위에서 구현한다.
   실키·고객 데이터·유료 API 및 실제 게임 빌드 환경은 별도 확인.
4. 기존 Gateway adapter의 고정 버전 호환을 검증하고 OCE는 별도 read-only Connector부터.
5. 기존 SDK·Plugin·Preview 호환성을 보존한다. 승인된 Builder 병행 개발은 별도
   저장소에서 진행하며 Core 완성의 필수 검증이나 목표에 포함하지 않는다.

선택적 Primary/Extension·UI 자유, Native 복구, OS/renderer 보호, Workspace stop·
데이터 수명주기는 기존 [비파괴 이전 계획](../reviews/CORE_PLUGIN_ARCH_MIGRATION_PLAN.md)을
이어간다. 다중 백엔드 조사로 완료 처리하거나 OCE로 대체하지 않는다. 서명·Identity·
최신 보안/의존성·Linux·물리 두 PC 릴리스 게이트 역시 별도 유지한다.

## 2026-07-30 계획 이력

아래의 완료/다음 단계 표기는 당시 범위의 기록이며 현재 후보나 2026-10-25 목표
완료 판정으로 사용하지 않는다. Agent 필수 연결·필수 공통 Shell을 전제한 문장은
위 현재 계약으로 대체된다. 기존 증거는 날짜/tuple과 함께 보존한다.

현재 제품 정의는 [PRODUCT-ARCHITECTURE-ko.md](PRODUCT-ARCHITECTURE-ko.md)이며, 자세한 구현
순서는 [CORE-WORKSPACE-PLUGIN-BASELINE-PLAN-ko.md](CORE-WORKSPACE-PLUGIN-BASELINE-PLAN-ko.md)를 따른다.
이 로드맵은 특정 AI 회사 구조를 Core 기능으로 만들지 않는다는 원칙 아래 진행된다.

플러그인 제작 기반의 세부 구현 순서와 완료 Gate는
[PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md](PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md)를 따른다.

## 0단계: 기존 제품을 기준 구조에 맞추기 — 완료

- Company 중심 기본 UI를 Workspace 용어로 바꾸되, 기존 저장소는 일시적인
  마이그레이션 호환 계층으로만 유지한다.
- Paperclip Workplane 탐색과 Experimental 화면을 SPS 기본 Core UI에서 제거한다.
- Core 업무 역할 제어를 중립적인 Workspace 멤버십, Host/Node 신뢰,
  플러그인 전용 실행 Grant로 바꾼다.
- 현재 Project Source UI를 Host 소유의 이름 있는 Workspace Source로 바꾼다.

이전 단계 기록(현재 필수 조건 아님): Discovery & Builder 플러그인과 Host/Member 기술 설정만
있고 내장 Room/Task/역할 흐름이 없다.

## 1단계: Host, Member, Node, Source 기본 루프 — 자동 검증 완료, 물리 장치 확인 대기

- SPS 로그인, Host 생성, 초대, Member 참여, Node 승인/철회, 재시작 복구,
  Tailscale 전용 접근을 검증한다.
- Member가 선택한 로컬 Runtime만 공개하고 Credential은 로컬에 유지한다.
- Host가 여러 Workspace Source를 관리하고 플러그인 전용 Source Grant로 Member가
  편집하게 한다.
- Member 제거 시 활성 접근, Node, Runtime 연결, Grant는 즉시 제거하고 과거 기록은
  보존한다.

완료 기준: 패키지된 Host와 Member Desktop이 실제 Host 프로젝트 Source를 사용해
전체 루프를 완료한다.

## 2단계: 안정적인 플러그인 플랫폼 — 엔지니어링 기준 완료

- Extension Profile, Manifest, 호환성, Capability, 데이터 격리, 마이그레이션,
  실행, Connector, UI 계약을 공개한다.
- 플러그인은 Workspace별로 동작한다. 비활성화는 되돌릴 수 있고, 완전 삭제는
  SPS 내부 데이터만 지우며 프로젝트 폴더는 보존한다.
- 공식 Registry와 로컬 개발 패키지만 제공한다.
- Conformance Test, Test Kit, 패키지 검사, 단계적 업데이트, Rollback, Backup,
  Diagnostics를 만든다.

완료 기준: 플러그인 작성자가 SPS Core를 수정하지 않고 외부 폴더에서 개발, 검사,
설치, 활성화, 비활성화, 업데이트, 복구, 삭제를 할 수 있다.

## 3단계: 기존 Discovery/Builder 구현 기록과 현재 개발 경계

기존 코드는 SDK/Core 호환성을 유지한다. 공개 탐색·추천과 Marketplace Assistant는
제품에서 철회됐으며 내부 Registry 관리와 구분한다. 새 Workspace가 특정 Plugin이나
AI Runtime을 필수로 요구해서는 안 된다. 내부 패키지의 검증·승인·설치·업데이트 관리는
Core 관리 인터페이스에 남긴다. Builder는 위의 2026-11-01 사용자 승인에 따라
별도 공개 저장소에서 병행 개발하며, Core 필수 검증을 대신하거나 Core 완성 목표를
확장하지 않는다. 이 문서는 Builder UI·Plugin·역할의 새 설계를 결정하지 않는다.

## 4단계: 베타 준비 — 다음 단계

- Core가 범용 Workspace Shell, Dashboard, Inbox를 제공하고 플러그인이 위젯,
  보고, 행동, 탐색 구성을 제공하는 계약을 구현한다. 상세 기준은
  [WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md)를 따른다.
- Host와 Member의 패키지된 Desktop 사용성과 안정성을 전체 점검한다.
- 업데이트 호환성, 플러그인 마이그레이션 검토, 백업/복원, 삭제, Node/Source 철회,
  네트워크 중단 후 재시도와 진단을 시험한다. SPS 1차 버전은 오프라인 제품 모드를
  제공하지 않는다.
- Windows/Tailscale 지원 범위, 알려진 제한, 개인정보와 백업 안내, 출시 점검표를
  공개한다.

완료 기준: 소규모 비공개 베타 사용자가 개발자 콘솔 없이 독립 Workspace를 만들고,
안전하게 Host에 참여해 공식/로컬 플러그인을 사용할 수 있다.

## 베타 이후

- 공개 게시·판매·평판·커뮤니티 유통은 제품 범위에서 제외한다.
- Access Control, Team Workplane, Memory Provider, Game, Web, App,
  Plugin Development Pack 같은 선택형 공식 작업 플러그인
- 추가 운영체제와 승인된 네트워크 방식
``````

## current/CORE-WORKSPACE-PLUGIN-BASELINE-PLAN-ko.md

``````markdown
# SPS Core와 플러그인 기준 구현 계획

최종 갱신: 2026-08-01
기준 후보: SPS Desktop `0.4.104`, SPS Core `8339edd1ee6cb479a757c303039e123b5e0680cf`,
Plugin SDK `0.11.0` (`f24d9b236a8bdaee9441f37694b7e4298aa7e6c2`)

## 목적

SPS Core는 특정 회사 조직이나 Paperclip의 업무 방식을 강제하지 않는 Windows
Desktop-first 기반이다. Host, Member, Node, Runtime, Workspace Source, plugin
lifecycle, 보안 경계와 기록을 제공한다. Room, Task, Lead/Worker, 승인, 보고,
장기기억과 프로젝트 방식은 플러그인이 정의한다.

## 경계

| 영역 | Core | 플러그인 |
| --- | --- | --- |
| 작업 방식 | 정의하지 않음 | Room, Task, 역할, 보고, 승인, 메모리 |
| 컴퓨터 | Host, Member, Node, Tailscale, Desktop 수명주기 | 어떤 Node와 Runtime을 쓸지 결정 |
| AI 실행 | Runtime 발견, Node 상태, run 기록, 기술적 grant | Agent/Worker 의미와 작업 규칙 |
| 파일 | Host가 고른 Source와 암호화 route | Source를 프로젝트/작업 범위에 연결 |
| 플러그인 | 서명, 호환성, stage, Host lifecycle, 로그 | 데이터, UI, 도구, 자동화, 업무 정책 |
| 보안 | secret handle, Node credential 격리, 위험 기술 동작 확인 | 업무상 승인 주체와 승인 기준 |

Host는 물리적인 SPS 서버 컴퓨터다. 조직의 상사 역할을 뜻하지 않는다. 플러그인은
필요에 따라 Lead, Worker, Reviewer 같은 업무 역할을 자체적으로 만든다.

## 기본 Workspace

기본 Core는 Room, Task, Project, Inbox, 역할 또는 메모리 정책을 자동으로 만들지
않는다. Marketplace와 Marketplace Assistant는 검색·상세 조회·추천만 담당한다.
Plugin Builder는 제작, 검사, Preview, package까지만 담당한다. 두 기능 모두
설치·활성화·업데이트·비활성화·삭제를 실행하지 않으며, Host가 `설정 > 플러그인`에서
수동으로 lifecycle을 결정한다.

## Host, Member, Node, Runtime

- Host 하나는 여러 Workspace를 가질 수 있다.
- Member는 Workspace에 참가한 SPS 계정이고, 한 Member는 여러 Node를 가질 수 있다.
- Node는 Member 컴퓨터의 Desktop 실행 단위다.
- Runtime은 Node 소유자가 공개하기로 선택한 CLI, 로컬 AI, API 또는 Connector다.
- API 키, CLI home, 로컬 경로와 자격증명은 Node 밖으로 전송하지 않는다.
- Host는 Node와 grant를 승인·철회한다. Member 제거 시 관련 Node, Runtime 공개,
  Source/execution grant를 철회하되 과거 기록은 보존한다.

첫 출시 플랫폼은 Windows 10/11 x64이며 팀 연결은 Tailscale을 사용한다. 일반
브라우저는 제품 사용 경로가 아니며 Host Workspace는 Desktop bridge로 보호한다.

## Workspace Source

Source는 Host가 고른 로컬 폴더를 나타내는 불투명한 이름 있는 핸들이다.

1. Host만 Desktop 폴더 선택으로 Source를 만든다.
2. Core는 Source ID, 이름, 상태를 관리하고 실제 경로는 Host Desktop에만 둔다.
3. Host가 필요할 때만 승인된 Member Node에 transport route를 만든다.
4. Node grant에는 대상 Node 공개키로 암호화된 접근 자격증명만 저장한다.
5. 플러그인은 Source ID를 사용하며 세부 폴더 정책은 플러그인이 결정한다.

Member는 Host 경로나 자기 컴퓨터 폴더를 임의로 Source로 지정할 수 없다. Host Vault를
복원했더라도 새 Host가 로컬 폴더를 다시 선택하기 전에는 Source를 사용할 수 없다.

## 표준 플러그인 계약

- Profile `1.0`: 기존 Paperclip 호환 번들용
- Profile `2.0`: SPS의 작업 방식 중립 계약이며 신규 개발의 기본값

주요 primitive는 `workspace.sources.metadata`, `workspace.sources.route`,
`runtimes.list`, `runtimes.dispatch`, `runs.observe`, `artifacts.write`,
`secrets.use`다. 선언만으로 권한이 부여되지 않으며 Core가 manifest, 호환성,
활성 상태, Node 준비 상태와 실행 grant를 매번 검증한다.

## 현재 구현 상태

통과한 범위:

- Profile 2.0 SDK와 1.0/2.0 Desktop 호환성
- Source, Runtime, execution grant, Run, Artifact 계약과 Host 보안 경계
- Marketplace 검색/상세 및 Builder의 build·validate·test·pack·Preview 흐름
- packaged bootstrap, Workspace, Plugin Preview, Host plugin lifecycle
- Desktop `261/261` (exit 0), desktop-node `39/39`, 공개 Plugin SDK `146/146`
- `0.4.104` 패키징 및 Host/main과 Member/laptop 설치
- Installer SHA256 `B58E7EAE15884D4E9B052ED3A15A9B43B340CB83DCAE1EE0D1A71261C974C2C1`, size `255265752`
- 양쪽 app.asar SHA256 `2ECC983D650BBBB51798762A1A4AAFB6B8096AE5073C251CD33FB7C66E34EFEC`
- 브라우저 직접 접근 차단과 Desktop-only Host 기술 API

아직 완료로 표시하지 않는 범위:

- Host Source → laptop Agy CLI 물리 실행 E2E: run `e0286388-cf8d-4acb-9890-40d8fce1edab`
- Source 철회 후 거부(run `e5bec7a5-9324-4479-aea2-834d4dca5730`), 원본 해시 불변, 양쪽 재시작 후 복구
- 모든 visible control의 직접 조작 감사와 공개 릴리스 서명/배포 게이트

## 1~8단계 완료 판정

1. 공개 SDK와 계약 고정: 자동 검증 통과.
2. Workspace Shell·Dashboard·Inbox 기반: packaged Workspace 검증 통과. 업무 의미는 플러그인에 둔다.
3. Developer Mode·Local Registry: build/validate/test/pack·Preview 검증 통과.
4. Plugin Preview 격리: production과 분리된 Preview와 cleanup 검증 통과.
5. Diagnostics·Test Kit: SDK와 Desktop 회귀에 포함되어 통과.
6. Job·Dependency lifecycle: packaged Host plugin lifecycle 검증 통과.
7. Marketplace Assistant·Builder: 검색/추천과 제작·Preview 계약 검증 통과. lifecycle은 수동 Host 경계로 유지.
8. 두 컴퓨터 reference E2E: **완료**. Host Source를 `Z:\\`로 마운트하고
   `SPS_WORKSPACE_PATH=Z:\\`를 사용한 실제 파일 편집, 철회 후 거부, 재시작 후 복구를 확인했다.

따라서 현재 제품은 “Core와 플러그인 플랫폼의 자동·패키징·물리 E2E 기준 통과”
상태다. 남은 항목은 베타 사용성 점검과 공개 릴리스 서명·배포 게이트다.
``````

## current/PLUGIN-BUILDER-CHAT.md

``````markdown
# Plugin Builder Chat

Status: source development implementation, updated 2026-10-24. This is not a new
installer or a Stable release. Existing installation and user data are unchanged.

## Ownership

Builder owns one Lead, optional Workers, conversations, attachments and reports.
Core provides authenticated Workspace scope and generic Agent session transport.
The public SDK exposes capability-checked actions and Agent sessions, without
private Core imports or arbitrary RPC. The SDK additions are pinned by commit in
support-matrix.json; they are not part of the published v0.11.0 tag.

## Implemented

- Conversation list, new conversation, persisted transcript and execution logs.
- Bottom composer, UTF-8 text attachments and configured Agent model display.
- Collapsible, resizable Worker/results panel and existing authoring records.
- Lead-only delegation to selected Workers, asynchronous reports and result tool.
- Workspace-scoped state, duplicate-send exclusion, bounded content and restart
  reconciliation. Interrupted runs are not automatically repeated.
- Generic plugin prompts do not inherit the legacy issue-work default or resume
  delta. Normal issue execution retains its existing behavior.

## Verification

The list below is historical initial-chat verification. For the current pinned
Source/Core/SDK tuple, exact test counts, real CLI authoring/Preview results and
remaining authorization boundaries, use [Plugin Builder Delivery Plan](PLUGIN-BUILDER-DELIVERY-PLAN.md).

- Builder check: 14 tests.
- Public SDK: 149 tests.
- Core session context/runtime: 13 tests, including embedded Postgres context.
- Desktop source Workspace E2E passed, including panel bounds at 1024x720 and
  1440x900 and responsive Workspace checks through 1440x900.
- Development app: actual Codex Lead answered the initial connection check and
  recalled its previous response on the next turn. After the final backend
  restart it restored the transcript and recalled that answer again. No file
  edits were requested. The right-hand panel was also inspected in the app.
- Final source E2E rerun passed with screenshots and responsive assertions.
  One preceding run without screenshot capture failed while establishing the
  fresh Host Identity session (`desktop_access_required`); no authenticated
  Workspace window opened. Retrying passed with the live development Host still
  running. Its cause is not established, so startup reliability is not certified
  by this passing retry and remains a separate regression investigation.

These are source-development results, not signed-package or two-device evidence.

## Remaining

- Real-account Worker delegation/report end-to-end verification.
- Per-message model overrides. Exact-run cancellation is implemented with
  process termination/state reconciliation; unresolved runs are not auto-retried.
- Convenient Source/CLI authoring setup. Host-selected project references and
  separate gated Preview exist, but a reference does not configure Agent cwd.
- Image/binary attachments and file diff presentation.
- A fresh installer, SDK release and complete release gates before distribution.

The development app uses its persistent isolated profile and supports UI hot
reload. Backend/main/preload changes require restarting development, not packaging.
``````

## current/PLUGIN-DEVELOPER-PLATFORM-ko.md

``````markdown
# SPS Plugin Developer Platform

공개 SDK의 단일 원본은 [`Powerpunch777/sps-plugin-sdk`](https://github.com/Powerpunch777/sps-plugin-sdk)다.
SPS Desktop도 이 SDK의 고정된 revision을 사용하며, 별도 내부 복제본을 제품 계약으로 취급하지 않는다.

SPS Core는 플러그인 제작자가 반복 인프라를 새로 만들지 않도록 Plugin Developer Platform을 제공한다.

## Core SDK

| 제공물 | 플러그인에서 사용하는 목적 |
| --- | --- |
| Manifest schema | 이름, 버전, 의존성, 설정, UI, tool, job, Connector 선언 |
| Data scopes | Company, Agent, Thread, Run, Artifact, Store 범위 상태 저장 |
| UI SDK | 메뉴, 설정 탭, panel, modal, 공통 디자인 token |
| Agent Tool SDK | AI가 호출할 typed tool 등록과 결과 전달 |
| Event and Job SDK | event 구독, durable job, 재시작 복구, 상태 보고 |
| Artifact API | 첨부, 생성 파일, 실행 로그, 결과물 연결 |
| Backend and Node API | Agent 실행기, Node, Runner 상태와 command 기록 |
| Connector SDK | MCP, OAuth, HTTP API, CLI 연결 |
| Catalog API | Marketplace 검색과 package metadata 조회 |
| Diagnostics SDK | Core·Desktop·Plugin의 안전하고 구조화된 상태 증거 |
| Test Kit | mock Workspace/Host/Member/Node/Runtime/Source, lifecycle, UI, tool 회귀 검사 |
| Conformance Report | 패키지 후보와 release 검토에 붙는 불변 검증 결과 |
| Authoring CLI | init, validate, test, pack, inspect, local publish |

## Diagnostics와 Test Kit

공개 SDK `0.6.0`부터 다음 진입점을 SPS Desktop 없이 플러그인 저장소에서
직접 사용할 수 있다.

```text
@sonparkserver/plugin-sdk/diagnostics/v1
@sonparkserver/plugin-sdk/testing/v1
@sonparkserver/plugin-sdk/conformance/v1
```

Diagnostics는 콘솔 로그를 전달하는 통로가 아니다. `origin`, `category`,
`level`, 안정적인 `code`, 짧은 `message`, 제한된 구조형 `details`만 보존한다.
자격증명, secret, 절대 로컬 경로, command, stdout, stderr와 순환 객체는
진단 이벤트나 conformance 보고서에 들어갈 수 없다.

Test Kit는 메모리 안에서 결정적으로 동작한다. Workspace와 Host·Member,
Node·Runtime·Source, capability 허용·거부, 네트워크 단절, lifecycle,
migration·rollback·backup, Shell·Dashboard·Inbox 충돌, Tool·Event·Job·Run,
Stream·Connector·MCP와 UI 상태를 실제 SPS 설치 없이 시험한다.

Conformance Report는 테스트 결과와 안전한 Diagnostics를 묶는다. Developer
Mode가 build·validate·test를 모두 통과시킨 후보에 이 보고서를 첨부하며,
Host는 release 검토 화면에서 콘솔이나 DB를 열지 않고 근거를 확인할 수 있다.

공개 SDK `0.7.1`부터 `@sonparkserver/plugin-sdk/dependency/v1`도 제공한다.
필수·선택 의존성, 서비스 발견, 버전 범위, 충돌, 순환 관계와 변경 영향은
설치나 활성화를 수행하지 않는 순수 분석 계약으로 검증한다.

## 제작 흐름

```text
plugin init
  -> manifest와 최소 worker/UI 생성
  -> Core SDK 기능 추가
  -> local test와 lifecycle 검사
  -> package 생성
  -> Catalog/Registry release 등록
  -> Settings > Plugins에서 설치·활성화
```

`Plugin Discovery & Builder`는 이 흐름을 Agent 대화로 도울 수 있지만, SDK와 CLI는 사람 개발자가 단독으로도 사용 가능해야 한다.

## 기술 선언과 사람 권한

Manifest의 capability 선언은 플러그인이 사용할 수 있는 기술 인터페이스를 설명한다. 예를 들어 UI 등록, job 실행, Catalog 읽기, Connector 사용 여부를 선언한다.

사람이 그 기능을 사용할 수 있는지는 Core가 정하지 않는다. Access Control 같은 정책 플러그인과 실제 업무 플러그인이 결정한다.

## 호환성

현재 SDK와 일부 패키지는 Paperclip manifest·runtime 호환 필드를 포함한다. 이 필드는 이행을 위한 compatibility bridge다. 새 SPS SDK의 공개 계약은 Paperclip 이름이나 특정 Workplane을 요구하지 않아야 한다.
``````

## current/PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md

``````markdown
# SPS 플러그인 플랫폼 구현 계획

2026-11-01 경계 명시: 신규 Builder의 v15 설계·소스·UI·구현 계획은 별도
[`SPS-MY-PluginBuilder`](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)
레포에서 관리한다. 아래는 기존 플랫폼·번들 Builder의 과거 구현 기록이며,
신규 Builder를 Core에 구현하거나 보류된 공개 Marketplace를 재개하는 근거가 아니다.

최종 갱신: 2026-08-02
기준 후보: historical snapshot SPS Desktop `0.4.104` (see `CURRENT-CANDIDATE.md` for the current candidate)
상태: 1~8단계의 계약·패키징·자동 검증과 두 컴퓨터 물리 E2E 기준 통과. 공개 릴리스 게이트는 별도.

## 목표

SPS Core는 게임, 앱, 웹, 플러그인 개발처럼 서로 다른 작업 방식을 강제하지
않는다. Core는 Desktop, Host/Member/Node, Runtime, Workspace Source, plugin
lifecycle, 보안과 실행 기록을 제공하고, Room·Task·역할·메모리·승인·보고는
플러그인이 정의한다.

Marketplace Assistant는 접근 가능한 AI adapter로 검색·비교·추천·제작 brief를
돕는다. 설치나 lifecycle 변경은 수행하지 않는다. Plugin Builder는 외부 plugin
프로젝트를 build·validate·test·preview·pack하고, 실제 설치는 Host가 설정 화면에서
수동으로 한다.

## 1~8단계와 현재 상태

### 1단계: 공개 Runtime SDK와 계약

Profile 2.0, scoped primitive, typed tool, UI bridge, worker context, lifecycle,
Source/Runtime/Run/Artifact 계약을 고정한다.

상태: 완료. SDK `146/146`, Profile 2.0 및 1.0 호환 검증 통과.

### 2단계: Workspace Shell·Dashboard·Inbox 기반

Core shell과 범용 contribution 계약을 제공하되 Paperclip의 Room/Task 의미를
Core에 다시 넣지 않는다. plugin이 필요하면 widget, inbox item, navigation을
기여한다.

상태: packaged Workspace와 baseline navigation 검증 통과. 업무 의미를 가진 화면은
플러그인 범위로 남긴다.

### 3단계: Developer Mode·Local Registry

외부 plugin 프로젝트의 build·validate·test·pack, source/output hash, stage,
Preview와 Last Known Good를 제공한다.

상태: packaged plugin Preview와 package 검증 통과.

### 4단계: 격리 Plugin Preview

production DB, secret, Source path와 분리된 Preview Host/Workspace에서 결과를
확인하고 종료 시 임시 리소스를 정리한다.

상태: packaged Plugin Preview 및 cleanup 통과.

### 5단계: Diagnostics·Test Kit

manifest, capability, worker/run/job/connector 상태와 fixture를 안전한 진단
계약으로 제공한다.

상태: SDK와 Desktop 회귀에 포함되어 통과.

### 6단계: Workspace Job·Plugin Dependency

grant, Node/Runtime 선택, 중복 실행 방지, 취소·retry·blocked·재시작 복구를
Core가 기록하고 dependency 상태를 검증한다.

상태: packaged Host plugin lifecycle 검증 통과.

### 7단계: Marketplace Assistant·Plugin Builder

Core Marketplace는 검증된 catalog를 키워드·카테고리·호환성·검증 상태로 검색한다.
Assistant는 자연어 검색과 추천을 호출하되 plugin 상태를 변경하지 않는다. Builder는
제작과 Preview까지만 담당한다.

상태: 검색/추천, Builder, package 및 Host 수동 lifecycle 경계 검증 통과.

### 8단계: Reference Plugin과 실제 두 컴퓨터 E2E

Host Source를 Host가 선택하고, 승인된 laptop Node가 grant를 통해 CLI를 실행하며,
Host가 route를 철회하면 재실행이 거부되는지 확인한다. 양쪽 재시작 뒤에도 상태를
복구해야 한다.

상태: 완료. run `e0286388-cf8d-4acb-9890-40d8fce1edab`에서 laptop Agy CLI가 Host Source를 `Z:\\`로 사용하고 `SPS_WORKSPACE_PATH=Z:\\`를 통해 Host 파일 marker를 쓰고 읽었다. Source 회수 후 run `e5bec7a5-9324-4479-aea2-834d4dca5730`는 활성 transport route 없음으로 거부되었고 원본 해시는 유지되었다. 양쪽 재시작 후 Node·버전·플러그인·회수 상태가 복구되었다.

## 현재 증거

### 후속 Builder 작업 구조 결정 (2026-10-18)

- Builder Workspace의 AI 구성은 Lead 정확히 1명과 선택적인 Worker 0명 이상이다.
- 사용자는 제작 시작 전에 Lead를 등록하거나 선택하고 필요할 때 Worker를 추가한다.
- Lead는 사용자 대화, 작업 분배, Worker 결과 검토와 통합 보고를 담당한다.
- Worker 없이 Lead만으로 제작을 진행할 수 있다. 작업 분할 방식은 Lead가 판단한다.
- 역할과 위임 규칙은 Builder 플러그인의 책임이다. Core는 공통 실행 기반을 제공한다.
- 개발 소스 반영: Lead 선택, 대화 목록·저장·실행 기록, 텍스트 첨부,
  Worker 선택 및 Lead 전용 위임·결과 조회 도구, 기존 제작 기록 패널.
- 실제 Codex Lead의 첫 응답과 연속 응답을 개발 앱에서 확인했다.
- Worker 실계정 위임 E2E, 실행 중지, 대화에서 별도 Preview로 직접 연결은
  미완료다. 모델·추론은 선택한 Agent 설정을 사용한다.
- 세부 계약과 검증 범위: [Builder Chat](PLUGIN-BUILDER-CHAT.md).
  아래 historical 검증은 이 후속 흐름의 구현 완료를 의미하지 않는다.

- Historical snapshot (`0.4.104`): Desktop 테스트 `261/261` 통과, exit 0
- desktop-node 테스트 `39/39` 통과
- 공개 Plugin SDK 테스트 `146/146` 통과
- Historical snapshot (`0.4.104`): 패키징 완료 및 Host/main, Member/laptop 설치 완료
- Installer SHA256 `B58E7EAE15884D4E9B052ED3A15A9B43B340CB83DCAE1EE0D1A71261C974C2C1`, size `255265752`
- 양쪽 app.asar SHA256 `2ECC983D650BBBB51798762A1A4AAFB6B8096AE5073C251CD33FB7C66E34EFEC`
- packaged bootstrap, Workspace, Plugin Preview, Host plugin lifecycle 통과
- 물리 Host Source → laptop Agy CLI 편집, revoke denial, restart recovery 통과

## 완료 판정

자동 테스트와 패키징뿐 아니라 8단계의 실제 Source 실행·철회·재시작 결과도
관찰 기록되었다. 따라서 1~8단계의 제품 구현은 완료로 표시한다. 남은 항목은
베타 사용성 점검과 공개 릴리스 서명·배포 게이트이며, 세부 절차는
[`CORE-DESKTOP-E2E-AUDIT.md`](CORE-DESKTOP-E2E-AUDIT.md)와
[`BETA-ACCEPTANCE-RUNBOOK-ko.md`](BETA-ACCEPTANCE-RUNBOOK-ko.md)에 따른다.
``````
