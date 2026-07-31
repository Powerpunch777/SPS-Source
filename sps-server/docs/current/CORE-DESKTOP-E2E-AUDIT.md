# SPS Core Desktop E2E Audit

> Historical evidence note: this audit records the `0.4.84` packaging pass.
> The current development candidate is `0.4.96`; use
> `BETA-ACCEPTANCE-RUNBOOK-ko.md` and `release/support-matrix.json` for the
> next physical acceptance run.

Status: engineering baseline passed; physical two-computer and full visible-control
acceptance remain release gates.

Desktop under test: SPS Desktop 0.4.84 (Windows)

## Objective

Prove that a clean SPS Core installation can create or join a server, keep its
state after restart, connect a Member computer, and safely update before any
additional workplane plugin is treated as release-ready.

This audit is intentionally driven through the packaged Electron application.
Automated unit tests guard regressions, but do not replace direct button and
error-state verification.

The concise two-computer execution steps are maintained in
[`BETA-ACCEPTANCE-RUNBOOK-ko.md`](./BETA-ACCEPTANCE-RUNBOOK-ko.md).

## Rules

1. Every visible interactive control is recorded and exercised. A control that
   appears normal is not excluded.
2. Destructive actions run only in a disposable SPS QA company, project, and
   Member identity. Existing user companies and projects are navigation-only.
3. Each result is recorded as `pass`, `fail`, `blocked`, or `not-applicable`.
   A disabled control is tested for both its disabled state and the condition
   that enables it.
4. Evidence consists of the packaged app version, UI accessibility snapshot,
   screenshots where helpful, and desktop or host logs when a failure occurs.

## Release Gates

| Gate | Required result |
| --- | --- |
| Core setup | Fresh launch, sign-in, Host creation, and restart pass. |
| Team connection | Full invite, join, cancellation, invalid invite, and revocation pass. |
| Node and project source | Host-only source selection and approved Member access pass. |
| Persistence | App restart, Host restart, and interrupted connection recovery pass. |
| Update safety | Older or malformed release is never downloaded, prompted, or installed. |
| Desktop security | Normal browser workspace access is blocked; Electron receives only its narrow local bridge. |
| UI inventory | Every recorded control has a result, including empty, loading, and failure states. |

## Findings

| ID | Severity | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| CORE-001 | P0 | Desktop update | A 0.4.80 installation downloaded and offered stale 0.4.49 on launch. The stale package could downgrade the app at quit. | Fixed in source; unit and packaged-app retest passed. |
| CORE-002 | P1 | Installer delivery | The earlier 0.4.80 candidate command emitted a small web-installer stub instead of a self-contained installer, so it did not replace the installed app. | Fixed for the current 0.4.84 local candidate: a self-contained common installer, unpacked-runtime verification, isolated Electron sign-in, and Owner Host smoke all pass. Official signed-release delivery remains a release gate. |
| CORE-003 | P1 | Core boundary | Legacy compatibility routes and storage still contain Paperclip-era names. | Mitigated in the baseline surface: the Core route map exposes Workspace, Host settings, Assistants, Sources, Nodes, Team access, Plugins, and plugin pages only. Legacy routes remain an internal migration bridge and must not re-enter baseline navigation. |
| CORE-004 | P2 | Desktop shell | The native title duplicated the company name on Server settings. | Fixed; title composition now deduplicates the company segment. |
| CORE-005 | P2 | Identity UX | Company switcher exposes `Sign out` while account menu exposes `SPS Desktop sign out`. The intended scope is not clear in the UI. | Open; execute both paths with a QA identity and clarify or consolidate. |
| CORE-006 | P2 | Navigation model | Core settings navigation mixes neutral server settings with active plugin configuration pages, while page-title hierarchy is inconsistent across the same tree. | Open; label plugin-owned settings explicitly and normalize title composition. |
| CORE-007 | P0 | Host bootstrap | The visible `Create new company` flow reached a non-actionable `Instance admin required` state for the signed-in Desktop user. | Fixed; a valid SPS Identity session creates or recovers the first company and claims a durable Core instance-admin role only when no real administrator exists. |
| CORE-008 | P1 | Onboarding boundary | New-company onboarding hardcoded mission, lead-agent, SaaS, content-business, and marketplace language before a plugin was chosen. | Fixed in baseline routing: a new Workspace opens the neutral home with an Initial Assistant and Plugin Discovery & Builder; legacy onboarding remains isolated from the baseline surface. |
| CORE-009 | P1 | First sign-in | Google OAuth completed and the account state persisted as `succeeded`, but the live login screen stayed on `checking` until SPS Desktop restarted. | Fixed in direct packaged-app QA; the app proceeded from browser completion to Host/Member choice without restart. |
| CORE-010 | P0 | Owner Host workspace handoff | A fresh signed-in profile created its local SPS Server and Owner Vault, but `Workspace open` consistently failed because the Desktop could not establish its Workspace session. | Fixed in direct packaged-app QA; the app reopened the existing authenticated Host and reached the company dashboard. |
| CORE-011 | P1 | Default plugin boundary | The neutral Core baseline showed a `Rooms` navigation entry even though the Room Workplane bundle was disabled; selecting it reached a Not Found page. | Fixed; baseline navigation does not contain Room, Task, Project, Inbox, or workplane routes. A plugin supplies its own navigation only when enabled. |
| CORE-016 | P1 | Team access boundary | The first baseline pass hid the legacy role-based invitation screen entirely, which also removed the Core technical Host/Member connection path. | Fixed in source with a new Team access screen: it creates a human-only technical Member invitation, copies the full Desktop join link, lists recent invitations, and revokes unused links without exposing workflow role choices. In Baseline mode the physical local Host, proven by a second per-launch Desktop header, is the only technical manager; a remote legacy instance-admin flag is insufficient. Legacy role/grant APIs return `404`. Packaged Owner Host smoke confirms the Team access bundle is present; direct packaged-app interaction remains a release gate. |
| CORE-017 | P0 | Desktop local dependency | The source Desktop imported a newer `@sps/desktop-node` export than the stale local `file:` dependency copy exposed, so Electron failed before rendering the first screen. | Fixed with an exact local dependency synchronizer run before start, test, and Owner Host runtime preparation. An isolated source Desktop and a fresh `win-unpacked` candidate both reached the rendered sign-in screen. |
| CORE-018 | P1 | Neutral onboarding language | The sign-in and server-choice copy described Rooms, Tasks, and long-term memory as mandatory Core data before any workflow plugin was selected. | Fixed: baseline Desktop copy now refers only to Workspace and enabled plugin data. A renderer test and direct Electron screenshots verify the revised screen. |
| CORE-019 | P1 | Technical Member removal | Removing a connected person had no dedicated baseline path, and Node revocation did not close every Source-route grant. | Fixed in source: Host-only Team access lists technical connections without workflow roles; removal archives the technical record and revokes all owned Nodes, Runner/Agent/Source grants, active bindings, and eligible execution. The removed Desktop receives a dedicated code, stops work, clears its remote team profile, and returns to setup. Server, Desktop Node, and UI tests pass. Direct packaged-app interaction remains a release gate. |
| CORE-020 | P1 | First Workspace | A newly created Workspace could remain on its home screen without registering the Assistant required by Plugin Discovery & Builder. | Fixed in source: after the Assistant query succeeds, a Workspace with no non-terminated Assistant redirects to the neutral Initial Assistant setup. The setup has no Core workflow role or reporting line. Type checking and the focused UI regression suite pass; direct packaged-app interaction remains a release gate. |
| CORE-021 | P1 | Assistant boundary | The baseline `/assistants/:id` route reused the legacy Agent dashboard, which could expose reporting lines, Task assignment, budgets, and workflow permissions even though Core is workflow-neutral. | Fixed in source: baseline Assistant routes now use a dedicated Runtime settings page. Shared configuration hides reporting, workflow capability, and role-template fields in this mode; legacy Agent detail remains available only outside the baseline route map. Type checking and the focused UI regression suite pass; direct packaged-app interaction remains a release gate. |
| CORE-022 | P1 | Workspace switcher | The baseline shell still used the legacy Company switcher and opened the Paperclip onboarding wizard when creating a second workspace. Its team action also pointed at a legacy invitation route. | Fixed in source: baseline mode now presents a neutral Workspace switcher, creates a Workspace from a name-only dialog, hides issue prefixes, and links directly to Team access and Host settings. Host-only controls are withheld from a Member session even when that legacy session carries an instance-admin flag. The legacy Company flow remains outside baseline mode. Type checking and 40 focused baseline UI assertions pass; direct packaged-app interaction remains a release gate. |
| CORE-023 | P0 | Owner Host packaging | The packaged Electron candidate could contain an incomplete Owner Host runtime: non-Node runtime assets and `node_modules` were filtered by separate copy rules, so a sign-in renderer could pass while Host creation failed later. | Fixed: the runtime and its dependency directory are copied as explicit independent resources. A post-package verifier now requires the runtime manifest, release baseline, bundled Node, Core server dependency, Memory sidecar, Discovery, and Room bundles before release metadata is written. A rebuilt `win-unpacked` candidate passed that verifier and the live Owner Host smoke. |
| CORE-024 | P1 | Release trust | The current local candidate is intentionally unsigned (`NotSigned`). It is suitable for development and controlled beta testing only, not a public production release. | Open external release prerequisite: configure the official code-signing certificate in the release workflow, then rebuild and verify the signed artifact before public distribution. |
| CORE-025 | P1 | Baseline Host boundary | The generic plugin lifecycle route was Host-only in the baseline, but a legacy access-admin route performed its own instance-admin lookup and could have accepted a remote legacy admin session. | Fixed: both common and access-specific Core checks require the physical local Host in baseline mode. Focused server tests prove a remote legacy instance-admin request is denied before storage is accessed; the rebuilt packaged Owner Host smoke passes. |
| CORE-026 | P1 | Legacy global-admin re-entry | Several Paperclip-era services could independently re-read an `instance_admin` database row after request authentication, which would make a remote legacy administrator appear privileged again. | Fixed: SPS baseline authentication strips that flag from remote sessions and board keys; authorization, board-key activity, and access services also ignore legacy global-admin rows. Host-only Core requests must carry the Electron loopback two-proof header. The Desktop bridge now sends that proof only to technical Core endpoints, never workflow endpoints. Focused boundary tests cover both Host allow and remote deny behavior. |
| CORE-027 | P1 | Initial Workspace | The packaged baseline Smoke exposed an automatic paused Reflection Coach and a Discovery catalog unavailable to its worker. This violated the empty-Workspace and first-Assistant contract. | Fixed: baseline Workspace creation and startup reconciliation no longer auto-provision Paperclip built-ins, and legacy built-in-agent routes return `404` even when a migrated instance retains the experimental flag. The new `registry.catalog.read` capability passes only the verified public catalog path to an opting-in plugin. A rebuilt packaged Owner Host smoke verifies no automatic Assistant, only Discovery enabled while Memory and Room Workplane are disabled, `hasCatalog: true`, and rejected chat before Initial Assistant setup. |
| CORE-028 | P1 | Company plugin activation | A remote user with a migrated `agents:configure` grant could change which plugin surface is active for a Workspace, despite Baseline lifecycle being Host-owned. | Fixed: in Baseline, memory selection, per-Company plugin activation, and plugin tool-grant controls require physical Host proof before any legacy company permission is considered. A route regression rejects the remote legacy instance-admin path before plugin storage is read. |
| CORE-029 | P1 | Native Host proof | The Desktop main-process flow that creates, lists, or revokes a technical Member invitation sent only its normal local access token. The same omission existed in native Registry stage/enable/list and Owner Vault backup calls. Core could therefore fail to recognize the signed-in physical Host as its Host-only authority, while the surrounding Workspace UI used the stronger two-proof path. | Fixed: the Core team check now shares the canonical SPS Host authority predicate, and all native Host technical requests carry the second launch-scoped proof. The Desktop route matcher now includes database backup as well. Route coverage proves a header-backed signed-in Host is accepted while a remote legacy instance-admin remains denied; Desktop regression, packaged Owner Host, and isolated Electron smoke reran successfully. |
| CORE-030 | P1 | First-install performance | On the physical beta laptop with about 58 GB free space, the self-contained 377 MB `0.4.81` NSIS installer remained in extraction for more than 40 minutes. | Implemented candidate fix: `0.4.82` moves Codex and Claude ACP runtimes into explicit packs. The common installer is 214.6 MB and a clean temporary Windows installation completed in 112 seconds. Repeat on the beta laptop before release. |
| CORE-031 | P1 | Neutral Core packaging | The Owner Host previously bundled Codex, Claude, and Cursor provider assets by default. | Codex ACP and Claude ACP are now separately hashed, explicit packs. Core resolves them via a product-neutral environment contract. Cursor Cloud remains a small direct SDK bridge and is documented as a deliberate follow-up, not hidden behavior. |
| CORE-012 | P1 | Settings navigation | The Company Settings Org Chart, import, and export links used root-relative browser anchors and reached Not Found under a company-prefixed route. | Fixed; they now use the Core router link contract. |
| CORE-013 | P2 | Task status UX | An unassigned Task offered `In Progress`, then the server rejected the transition and only showed `Task update failed`. | Fixed; all status pickers disable `In Progress` until an agent or member is assigned and explain why. |
| CORE-014 | P2 | Desktop sign-in | A human Google sign-in could expire while choosing an account or completing MFA. | Fixed; the cancellable loopback sign-in callback now remains live for 15 minutes instead of 5. |
| CORE-015 | P1 | Member handoff | A direct SPS2 invitation was accepted but left the Member on setup instead of opening Workspace and requesting Node registration. | Fixed; direct acceptance now enters the normal Workspace/Node lifecycle. |

## Initial UI Inventory Snapshot

Captured from the packaged 0.4.82 Electron window with renderer accessibility
enabled. The currently open existing company is navigation-only; destructive
tests will use the QA company.

| Area | Controls observed | Scope | Test state |
| --- | --- | --- | --- |
| Shell | Skip to Main Content, home link, search, sidebar collapse, sidebar resize | Core shell | Pending |
| Account | company switcher, account menu | Core identity/session | Pending |
| Workspace navigation | Workspace Home, Initial Assistant, Plugin Discovery route | Core plus enabled plugin surface | Pending packaged retest |
| Host administration | Team access, Sources, Nodes, Plugins | Core technical surface | Pending packaged retest |
| Plugin navigation | Plugin-owned sidebar and page routes | Plugin surface | Pending, separately classified |

## Executed Controls

| ID | Control and condition | Result | Evidence / note |
| --- | --- | --- | --- |
| CORE-SHELL-001 | Collapse sidebar, then restore through hover-peek and Pin | pass | Collapsed rail intentionally removes the header toggle; hover-peek exposes `Keep sidebar expanded`. |
| CORE-SHELL-001a | Collapse sidebar, focus the renderer, then press Ctrl+B | pass | Ctrl+B restores the expanded sidebar when the SPS renderer has focus. |
| CORE-SHELL-002 | Open search from the header | pass | Opens the separate Search route. It is not a command-palette modal, so Escape close is not expected. |
| CORE-SHELL-003 | Sidebar Home navigation from a nested route | pass | Returned from Tasks to Home without changing company data. |
| CORE-UPDATES-001 | Launch 0.4.80 while the official feed exposes stale 0.4.49 | pass after fix | No pending update directory and no native update-ready prompt were created. |
| CORE-SETTINGS-001 | Open every Settings navigation item without changing data | pass | Basic info, Team, Project Sources, Invites, Nodes, Secrets, Profile, Instance, Environments, Access, Heartbeats, Experimental, Extensions, three plugin pages, and Agent connections all loaded. |
| CORE-ONBOARD-001 | Open new-company onboarding, exercise direct and guided mission choices, then cancel | partial | Both mission choices rendered; final confirmation was blocked by `Instance admin required`. Close/cancel returned to the previous screen without creating data. |
| CORE-AUTH-001 | Fresh-profile Google OAuth and restart recovery | pass | Google callback, encrypted account persistence, and direct transition to Host/Member choice passed. |
| CORE-HOST-001 | Fresh-profile authenticated Host creation and restart | pass | Owner Vault was created in `authenticated` deployment mode. After restart, the real SPS account recovered its durable Core admin role and opened the company dashboard. |
| CORE-SECURITY-001 | Direct browser request to the Owner Host root and API | pass | The current packaged Owner Host smoke starts with its launch-scoped Desktop token and verifies that unheadered loopback requests to `/` and `/api/plugins` return `403`; the same paths work only through the Electron Desktop bridge. |
| CORE-SETTINGS-002 | Company Settings Org Chart, import, and export links | pass after fix | All three routed inside the active company and no longer reached Not Found. |
| CORE-BASELINE-001 | Neutral Core baseline with only Plugin Discovery | pass after fix | `Rooms` is absent until a Room Workplane plugin is explicitly bundled or installed. |
| CORE-TASK-001 | Create a Task, persist a comment, cycle statuses and priorities, open/cancel sub-task, document, and attachment dialogs | pass after fix | A disposable QA Task was created and its comment persisted. The unassigned `In Progress` transition is now visibly disabled before request dispatch. |
| CORE-INVITE-001 | Create a one-hour SPS invite and copy its Desktop link | pass | The host produced a one-time desktop deep link and a separate fresh Desktop profile received it. |
| CORE-MEMBER-001 | Complete a distinct Google account sign-in and accept the full Desktop invitation | pass after fix | A second SPS Identity account accepted the Host-created routed SPS2 invitation and opened the remote Workspace. |
| CORE-NODE-001 | Register the joined Member computer, approve it from the Host Nodes screen, and verify command readiness | pass after fix | New packaged Member Desktop registered as pending; the Host's visible `Approve` control changed it to Active. The Member's next heartbeat confirmed `active` and enabled its command runner. |
| CORE-PERSIST-001 | Restart an active Member Desktop | pass | The encrypted SPS account, private team profile, active Node state, and command runner recovered without another invitation. |
| CORE-PERSIST-002 | Restart the authenticated Host while an active Member is connected | pass | The Owner Vault restarted the Host, restored the private Tailscale route, served private health with `200`, and the Member heartbeat/command poll resumed without error. |
| CORE-TEAM-001 | Baseline Team access component: create/revoke human invitation and copy complete Desktop link | pass (automated contract) | The component test confirms that Core never displays workflow role choices and that the copied invite contains both `hub` and one-time code. Direct packaged-app check remains a release gate. |
| CORE-NODE-002 | Generic plugin run through a Host Source route | pass (automated contract) | Desktop Node test opens a signed Host Source route for the selected run, streams output through the generic plugin queue, completes the lifecycle, and cleans up the route. |
| CORE-BOOT-001 | Launch an isolated source Desktop and a fresh `win-unpacked` candidate | pass | Both actual Electron apps rendered the SPS sign-in screen. The candidate contained the neutral Workspace/plugin wording and no missing `desktop-node` export. |
| CORE-BOOT-002 | Rebuild and launch the current `0.4.84` Windows candidate | pass | The `win-unpacked` executable opened the isolated SPS sign-in renderer and passed resource verification, static Workspace UI, empty Workspace/Initial Assistant gating, baseline Team access, bundled plugins, and Registry lifecycle smoke tests. The same immutable candidate was rebuilt into an Owner Host runtime and passed its live smoke. |

## Current Automated Baseline

| Suite | Result |
| --- | --- |
| SPS Desktop | 184/184 pass |
| SPS Desktop Node | 33/33 pass |
| Packaged `0.4.84` candidate | pass: empty Workspace, Discovery catalog availability, Initial Assistant gating, closed legacy built-in-agent routes, native Host proof coverage, resource verification, isolated Electron sign-in, and Owner Host smoke all pass. |
| Public Plugin SDK | 62/62 pass, including Extension Profile 2.0, signed releases, Registry safety, package extraction, CLI authoring, and static publication template |
| Core Extension Profile schema | 20/20 pass |
| Core Plugin SDK Host contract | 18/18 pass |
| Plugin Discovery & Builder | Build, manifest verification, conversation, catalog search, and draft tests pass |
| Core UI | TypeScript check passes; five focused baseline UI suites pass 40/40 assertions (Initial Assistant, neutral Assistant detail, Workspace switcher, sidebar, and Host-only Nodes). The rebuilt packaged-app interaction remains a release gate. |
| Core technical boundaries | 182/182 pass when run sequentially: authorization, Company access, baseline built-in closure, identity/invites, Nodes, Workspace Sources, plugin database/route authorization, and legacy instance-admin denial. The large historical suite is intentionally not treated as one parallel process because some older tests mutate shared environment state. |
| Rebuilt Owner Host runtime | Current source TypeScript build and live runtime smoke pass, including Desktop-only browser rejection, baseline Team UI, bundled plugins, and Registry author/publish/install/update/rollback. |

## Next Execution Order

1. Rebuild the packaged Owner Host runtime and directly exercise every visible baseline Core control, including Team access create/copy/revoke and Node approval.
2. Exercise Host-only Source selection, a Member source route, and a generic plugin-backed run in a disposable QA Workspace.
3. Execute Host and Member restart/recovery with the active Node retained, then repeat invite revocation and reconnect behavior.
4. Repeat update, reinstall, browser-boundary, empty, loading, and failure-state checks.
5. Fix each failure and repeat the affected end-to-end path before closing it.
