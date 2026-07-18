# Workplane Release Audit

Updated: 2026-07-18

## Scope

This release audit covered the local SPS Workplane Core integration,
Room plugin backend, Room/Task/Organization frontend, startup recovery, and
the Memory Sidecar health boundary. It did not modify the school game Project.

Browser verification used only the disposable Project
`Workplane Workspace Profile E2E 20260717`.

## Product Contract Checked

- A Project creates one durable Room for each hired Agent.
- A configured Lead creates and assigns finite child Tasks.
- A Worker works in the Task Room, reports the result to the owning Lead Room,
  and does not ask the user for approval through the Task.
- Project Rooms, Tasks, registered Workspaces, and project-scoped memory have
  distinct responsibilities.
- SPS Core provides generic Projects, Issues, Agents, permissions, and
  plugins. Domain-specific workflow rules stay in the Workplane plugin.

## Findings And Changes

### Project and Task readability

Finding: the Project home repeated the same information for Agents whose
display name already matched their role, for example `Designer / designer
Room`. The Project Tasks page also lacked the selected Project name and a
clear route back to the Room-first workflow.

Fix:

- Matching names now display `Agent Room`; other Agents retain their useful
  role label, such as `engineer Room`.
- Project Tasks now shows the Project name, states that it is the finite-work
  surface, and includes `Open Agent Rooms`.
- An empty Task list now explains that a configured Lead creates a Task from
  its Agent Room instead of presenting a blank list.
- The backend `project-tasks-view` response now carries the selected Project
  summary, with a regression assertion in `test-task-room-tools.mjs`.

### Unnecessary and duplicate surfaces

- The global Workplane Task sidebar and duplicate Workplane Task chat remain
  absent. Native SPS Task chat is the only Task conversation UI.
- Project `Rooms` remains the first workflow surface; Project `Tasks` is a
  separate, project-scoped list.
- Legacy role-named Room detection remains only to retire historical records.
  New Projects never provision role-named Rooms and role instructions are not
  exposed as an active editor. Per-Agent Instructions are the active policy
  source.
- Hidden compatibility handling for old Room message modes remains read-only
  so historical conversation records still render. It has no user-facing mode
  selector and does not create a second workflow.

### Disabled experimental traffic

Finding: every sidebar render requested the experimental Built-in Agents API,
even when that feature was disabled. The server correctly returned 404 for the
disabled surface, but the resulting console errors made an otherwise healthy
Room or Project page look broken.

Fix:

- Sidebar Agents now reads the existing experimental setting first.
- Built-in Agent status is requested only when `enableBuiltInAgents` is true.
- The sidebar regression suite verifies that the disabled default makes no
  Built-in Agent request.

### Room-first project entry

Finding: a bare `/projects/{project}` visit could briefly see an empty plugin
slot list before Project/company data resolved, then fall back to native Tasks.
This contradicted the Workplane contract that hired Agent Rooms are the first
surface for a Project.

Fix:

- In Workplane mode, a bare Project URL waits for Project, Company, and plugin
  slot resolution before choosing its default tab.
- When the Room Workplane slot is present it deterministically redirects to
  `project-workplane`; otherwise normal SPS fallback behavior remains.

### Built UI freshness

Finding: the local launcher intentionally serves `server/ui-dist`, so a source
change could pass local tests while an old browser bundle continued to run.

Fix:

- `Ensure-SPSCoreUiBundle.ps1` compares UI source, `ui/dist`, and
  `server/ui-dist` timestamps.
- The normal Workplane launcher runs it before stopping a healthy server. It
  builds/copies only when stale and leaves the running product intact if a
  frontend build fails.
- It never synchronizes Agent instructions, model accounts, organization data,
  Projects, Rooms, or Tasks.

### Collaboration onboarding

Finding: the product had a safe local-only default and a deployment preflight
script, but an Organization owner had no in-product indication of whether it
was safe to invite another person.

Fix:

- Organization settings now has an Owner/Admin-only `Collaboration access`
  card. It reads the local configuration without showing a secret or changing
  network settings.
- The card distinguishes the safe local-only default, a ready authenticated
  private collaboration setup, and an incomplete setup. It lists only the
  missing prerequisite and the next safe action.
- The backend action requires `agents:configure`, so an Operator cannot use
  the card to inspect deployment topology or authentication state.
- The workflow stays deliberate: this UI never opens a port, creates a
  credential, changes a hostname, or exposes a local server to the Internet.
- `Set-SPSWorkplaneAccessMode.ps1` provides the explicit configuration
  step outside the browser: `LocalOnly`, `PrivateTailnet`, `PrivateLan`, and
  `Public`. Remote modes refuse to write configuration without an existing
  authentication secret, validate the allowed hostname, and create a config
  backup before changing the access mode.

### Startup authority boundary

Finding: historical bootstrap helpers could rewrite Agent `reportsTo`, role,
model, or Agy prompt configuration during an ordinary service restart. That is
incompatible with a product where Organization settings are the source of truth.

Fix:

- Normal startup now builds the plugin and starts SPS/Memory Sidecar
  without rewriting Agent configuration or third-party adapter files.
- The old Agy prompt sync, flat-organization migration, and Agy quota
  compatibility helper are explicit maintenance switches only. They are all
  disabled by default and reject contradictory enable/skip arguments.
- The quota compatibility helper now only classifies a quota failure. It
  removes old retry scheduling hints, so a quota block remains visible to the
  owning Lead instead of creating implicit background retries.

### Persistent startup

Finding: the registered Windows logon task had a historical failed run because
the Workplane was not ready inside the short boot-time health window.

Fix:

- The scheduled launcher now waits briefly for the desktop environment, uses a
  longer startup health window, and makes one idempotent service-start retry.
  This is service boot recovery only; it never retries Agent work or a quota
  blocked Task.
- A normal local Core start no longer rewrites `AGENTS.md`. The historical
  company-contract synchronizer is an explicit maintenance switch, preserving
  Organization/Agent Configuration as the product source of truth.
- The installed `SPSWorkplaneStartup` task was run after the change and
  wrote a successful result record with SPS and the Memory Sidecar ready.

## Browser Evidence

Actual in-app browser checks confirmed the following after the runtime restart:

- Project Room cards show the simplified labels and all hired Agent Rooms.
- A Room page renders an independent Room list, conversation scrollbar, right
  Focus/Tasks/Changes panel, file controls, checkpoint control, and native
  Task links.
- The Project Tasks page shows Project-scoped finite Tasks, their originating
  Room, and the return link to Agent Rooms.
- Organization settings rendered nine policy cards without horizontal overflow.
- Desktop and 375px mobile layouts had no horizontal overflow or console
  warnings/errors. At mobile width the right context hides intentionally while
  the Room list and conversation remain usable.
- Final Chrome verification on 2026-07-18 opened the live local server at
  1440px for Room and Project Tasks, and at 375px for the Project default URL.
  Every route returned HTTP 200 with no console errors or failed resources.
- The bare mobile Project URL ended at the Room Workplane tab and showed Agent
  Room cards first. It did not create or change school Project data.
- Final Chrome verification after the generic-UI trim showed only `Tasks`,
  `Overview`, `Configuration`, `Budget`, `Workplane`, `Memory`, and `Memory
  Candidates`. The obsolete Unreal-only direct Task launcher is no longer a
  Project tab; no console error, failed response, or horizontal overflow was
  observed at 1440px.

## Final Product Contract Check

- `69-task-room-collaboration-contract.md` was aligned with the canonical
  operating model. A Worker final report is normalized to `in_review`, wakes
  only the Task's originating Lead Room, and the owning Lead alone performs
  technical completion or sends a correction cycle. A Task never asks the
  user for approval.
- `test-task-owner-report-wakeup.mjs` passed after this alignment. It covers a
  substantive final report, duplicate protection, busy-Lead reconciliation,
  blocker handling, and the owning Lead's technical completion boundary.
- `test-task-room-tools.mjs` passed: hired-Agent Room provisioning, Lead-only
  Task ownership, collision prevention, feedback/reopen, and foreign-Lead
  completion refusal are all verified.
- The old optional Unreal direct bridge remains disabled by default only for
  installation compatibility. Its Project tab was removed so the visible
  product has a single, general workflow for web, app, game, and other work.

## Automated Verification

All checks passed:

- Room plugin: `npm run check` (build, syntax checks, and the full regression
  suite), including `test-collaboration-readiness.mjs` for local-only,
  authenticated Tailnet, missing-secret, and invalid-public-URL states.
- Core DB: `tsc --noEmit`.
- Core server: `tsc --noEmit`.
- Core UI: `tsc -b`.
- Migration numbering and safety checks.
- `Test-StartSPSWorkplane.ps1` (7/7).
- `Test-StartSPSWorkplaneScheduled.ps1`: boot delay and one service
  recovery attempt are recorded correctly.
- `Test-ApplySPSAgyQuotaCompatibility.ps1`: quota classification is
  retained while all automatic-retry metadata is rejected.
- `Test-TestSPSWorkplaneCollaboration.ps1` (4/4), including the trusted
  hostname requirement for private collaboration.
- `Test-SetSPSWorkplaneAccessMode.ps1`: explicit LocalOnly, Tailnet,
  and HTTPS public configuration paths, plus remote-mode refusal without an
  authentication secret.
- `Test-SPSAuthenticatedMultiUserE2E.ps1`: passed in an isolated Docker
  PostgreSQL instance and a real Chromium browser. It verified authenticated
  bootstrap, Owner account creation, Operator invite/join, Viewer downgrade,
  and Viewer invite API rejection. The temporary server, database, and
  container were removed afterwards.
- `Ensure-SPSCoreUiBundle.ps1`: production UI freshness check passed;
  `Test-StartSPSWorkplane.ps1` still passed after launcher integration.
- `Test-SPSWorkplaneReadiness.ps1`: SPS and Memory Sidecar ready,
  no live Agent runs, configured checked Agents idle/ready.
- Live `GET /api/health`: HTTP 200 after the final restart.

## Operational Boundary

- The current server is deliberately local-only. It is ready for this machine,
  but a friend joining requires the authenticated Tailnet or reverse-proxy
  rollout in `93-collaboration-deployment-readiness-ko.md`.
- Provider quota retry remains disabled. A quota block is reported in the
  owning Room instead of silently changing provider or creating background
  work.
- Embedded PostgreSQL integration tests remain unavailable on this Windows
  host when the embedded database runtime does not support the platform. Type,
  migration, authorization, plugin, readiness, and live browser checks remain
  green; run database integration tests in a supported Linux/Docker CI lane
  before a public deployment.
