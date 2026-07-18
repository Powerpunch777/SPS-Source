# Workplane Full-Stack Product Audit

Updated: 2026-07-18

## Scope

This audit covered the local SPS Workplane product, not the school game
Project. Browser and Agent execution checks used only the disposable Project
`Workplane Workspace Profile E2E 20260717`.

The target product contract remains:

- A Lead creates and assigns finite Tasks to shared Workers.
- A Worker reports a final result or blocker to the Task Room.
- The original Lead Room receives the technical result and decides technical
  completion. A Task never asks the user for approval.
- Project Agent Rooms keep durable conversation state. Repository outputs stay
  in registered Project Workspaces.
- The Core stays generic. Workplane behavior is supplied by the Room plugin.

## Findings And Fixes

### Workspace routing

Finding: a configured Project default Workspace was being considered for every
Task before the Task type. A project whose default Room Workspace was a
research folder could therefore display a research Workspace on an
implementation Task.

Fixes:

- `defaultWorkspaceId` is now a Room default only.
- Task selection order is: Lead explicit selection, explicit Task-type mapping,
  Task-type Workspace classification, then fallback.
- Agent Room defaults do not redirect finite Tasks.
- Workspace classification recognizes `research` as design-oriented and
  `build`, `app`, `server`, and `client` as implementation-oriented.
- The Workspace Profile now exposes Task-type mappings for design,
  documentation, implementation, QA, art, and voice work.

Finding: the Task contract did not state the base directory for affected paths.
This allowed a Worker to interpret `implementation/file.txt` from inside the
Implementation Workspace and create an accidental nested folder.

Fixes:

- Task creation guidance and the `affectedPaths` tool schema now explicitly
  require paths relative to the selected Project Workspace.
- Task descriptions and Task Room protocol comments label the same rule.
- Path validation continues to reject paths outside the selected Workspace.

### Room UI

Finding: the right panel had one parent scrollbar. A long Focus or Task list
pushed Changes out of view, even though Changes itself had a nested scroll
area. Completed activity duplicated the final message, raw session IDs were
not actionable, and cancelled Tasks added noise to the active Room context.

Fixes:

- Left Room list, conversation, and right context have independent scrolling.
- Changes owns the flexible remaining height and its own scrollbar.
- Completed activity cards are hidden; active and failed work still remains
  visible.
- Session details are collapsed and show resumability rather than internal IDs.
- Cancelled Tasks are hidden from the Room context but remain in Task history.
- Room rows show role and current state instead of repeating "long-lived".
- Workspace routing is collapsed under Advanced routing. It remains available
  to Owners/Admins without making everyday Project navigation unwieldy.
- Workspace selectors now have unique accessible labels.

### Backend And Configuration

Finding: the internal Agent adapter update path did not carry the company
scope used by normal SPS configuration pages. This was a likely cause of
intermittent Codex-account configuration failures in a multi-company server.

Fix:

- Room-plugin Agent configuration updates now call the scoped
  `/api/agents/:id?companyId=...` route.
- Permission checks remain enforced. A caller without `agents:configure` is
  rejected before any Agent configuration is changed.

Verified operational properties:

- The local Codex model API exposes `gpt-5.6-sol`, `gpt-5.6-terra`, and
  `gpt-5.6-luna`.
- The scheduled `workplane-reconcile` job is active and runs once per minute.
- Provider quota automatic retry remains disabled by policy.
- Codex-to-Agy quota fallback is opt-in. A new Workplane installation keeps the
  selected provider and reports the quota blocker unless its Owner/Admin
  explicitly enables fallback in Plugin settings.
- The SPS plugin health endpoint is ready and healthy.
- Memory sidecar health is ready with no warnings.
- A stale revoked-token error on `손영하-CTO` was cleared through the normal
  browser recovery control. No account was changed. Final readiness reported
  all checked Agents idle/ready.

## E2E Evidence

The browser opened the Project Room, Project Workspace Profile, Agent
configuration page, and the completed Task state. No browser console errors
or warnings were observed during the final checks.

The live Lead-to-Worker test created `CMP-270` in the test Project:

1. Designer Room created one implementation Task and assigned Code Worker.
2. The Task selected the `Build output` Workspace, not the default research
   Workspace.
3. The first Worker result revealed the affected-path base ambiguity. The Lead
   gave correction in the same Task Room; no replacement Task was created.
4. Code Worker produced
   `implementation/workplane-e2e-routing.txt` with exact UTF-8 bytes:
   `77 6F 72 6B 73 70 61 63 65 2D 72 6F 75 74 69 6E 67 2D 6F 6B 0A`.
5. Designer received the result in the original Room, independently verified
   the bytes and absence of the incorrect nested path, then marked `CMP-270`
   done.

This validates the current Product loop from Lead assignment through Worker
completion and original Room reporting. The affected-path wording fix applies
to Tasks created after this audit.

## Automated Verification

`sps-room-chat` completed `npm run check` successfully. The suite
includes organization policy, permissions, Codex account selection, durable
Room state, Agy runtime, quota behavior, message retry, Task collision,
owner-report wakeup, compact, attachments, workspace binding, and plugin
manifest verification.

`scripts/Test-SPSWorkplaneReadiness.ps1` completed with `ready: True`.

## 2026-07-18 Follow-up: Product Deployment And Readability

### Collaboration deployment boundary

Finding: SPS Core already supports authenticated private Tailnet/LAN and
authenticated public deployments, but the Workplane bootstrap only checked
`127.0.0.1:3100`. After a valid Tailnet or custom bind change it could fail to
recognize the configured server and attempt an unnecessary second launch.

Fixes:

- `Start-SPS.ps1` now resolves its host and port from the active
  SPS config unless an operator explicitly overrides them.
- All-interface binds retain an internal `127.0.0.1` health probe, while
  Tailnet and custom binds are checked at their configured address.
- The local server launcher receives the same config path explicitly, so a
  non-default config cannot be probed by one process and ignored by another.
- `Test-SPSWorkplaneCollaboration.ps1` reports local-only,
  collaboration-ready, or incomplete configuration without exposing secrets.
- `93-collaboration-deployment-readiness-ko.md` defines the recommended
  authenticated/private Tailnet rollout and the required two-user acceptance
  test.

The current server intentionally remains `local_trusted/loopback` with a
healthy listener. It is safe for solo use but is not yet an externally
reachable multi-user deployment.

### Organization readability

Finding: the Agent policy editor used viewport media queries even though the
SPS settings sidebar reduced the available content width. At normal
desktop width the editor could create a horizontal scrollbar and cut off save
and configuration controls.

Fixes:

- The policy row now uses a container-responsive layout rather than global
  viewport width.
- Essential policy fields wrap from four columns to two and then one column as
  the actual content area narrows.
- Memory access moved into a collapsed Advanced disclosure. It remains
  configurable without competing with the Task delegation fields used daily.

### Browser verification

Actual in-app browser checks after plugin deployment confirmed:

- Organization has no horizontal overflow at a 1280px viewport with the
  SPS settings navigation open.
- Organization and Agent Room pages contain no console errors and no visible
  mojibake.
- The Room still renders its Room list, conversation scrollbar, independent
  context panel, and message composer.
- The enabled Room plugin health endpoint reports `ready` and `healthy`.

### Additional tests

- `scripts/Test-StartSPSWorkplane.ps1`: all seven tests pass, including
  configured all-interface endpoint resolution.
- `scripts/Test-TestSPSWorkplaneCollaboration.ps1`: local-only,
  authenticated Tailnet, and invalid public configuration classifications pass.
- `sps-room-chat/npm run check`: build, static checks, and the
  full plugin suite pass after the responsive UI change.

## 2026-07-18 Follow-up: Worker Room Execution Boundary

### Finding

A durable Agent Room is a discussion surface, while a finite Task Room is the
only place where a Worker should perform production work. The previous runtime
treated a configured Agy Worker Room like a generic native Agent Session in
the selected Project Workspace. That made the AGENTS.md instruction the only
barrier between a casual Worker Room conversation and repository mutation.

### Fix

- A configured `worker` receives an explicit long-lived Room boundary in its
  developer instructions, Room operating brief, Agy prompt, and durable
  recovered context. `lead` and `hybrid` retain their configured Room scope.
- Codex Worker Rooms are forced to read-only sandboxing and their Room tool
  mode is read-only even when a user selects the normal conversation path.
- Agy Worker Rooms now use a persistent SPS-owned Room sandbox directory
  outside the selected Project Workspace. They launch with `--sandbox` and no
  longer pass `--dangerously-skip-permissions`.
- The same restriction applies to queued/recovered Room Jobs and an explicit
  Codex-to-Agy quota fallback. It does not change finite Worker Task execution.

### Verification

- The Agy Worker Room regression test verifies that no native Agent Session is
  created, the sandbox directory is used, the Agy sandbox flag is enabled, and
  the Worker boundary reaches the prompt.
- The Agy client test verifies that sandboxed conversations never receive the
  permission-bypass flag.
- The Worker boundary test confirms that only `kind=worker` is restricted;
  `lead` and `hybrid` retain their configured runtime scope.
- After reload, the live Room plugin reported `ready` with no error. The actual
  Room page still rendered its Room list, composer, UTF-8 Korean text, and no
  horizontal overflow.

## Residual Operational Notes

- A separate local CLI adapter must honor SPS's selected Project
  Workspace. The E2E Agy Worker completed in the selected Workspace after the
  Task contract correction. Any future third-party adapter should receive the
  same Workspace test before it is made available to Workers.
- Two human Operators editing the same Workspace can still create source-level
  conflicts. The Task affected-path contract and collision preview reduce that
  risk; they do not replace source control review.
- The browser test covered the local Owner/Admin path. Before exposing the
  server outside the trusted local network, run the same flow with an Operator
  account and the intended remote authentication/Tailnet or reverse-proxy
  configuration. The two-user checklist is in
  `93-collaboration-deployment-readiness-ko.md`.

## 2026-07-18 Follow-up: Full-Stack Clarity And Boundary Audit

### UI simplification

- Removed the global Workplane `Project Tasks` sidebar entry. It opened a
  Project-less list that was normally empty and obscured the intended Project
  context.
- Added the Project-scoped `Tasks` entry beside `Rooms`; it opens
  `/tasks?project=<project-id>` and keeps native SPS Task chat as the
  one Task conversation surface.
- Removed the duplicate Workplane Task Room tab and Room Task Summary detail
  view. Internal bounded Task data remains available for automation and
  regression tests, but is no longer a competing UI.
- Project home now shows Room cards first. Workspace/repository routing lives
  in a collapsed `Workspace & task routing` setup disclosure.
- Renamed the Room composer action to `Compact & checkpoint`; conversation
  history is saved automatically, so a manual checkpoint is not presented as
  a required save operation.

### Backend and local secret hardening

- `GET /projects/:id/external-object-summary` now enforces the existing
  Project read policy after Company access is checked. This closes a
  low-trust agent path that could otherwise inspect an out-of-scope Project
  summary.
- Windows no longer evaluates POSIX mode bits for the encrypted local master
  key: NTFS ACLs, not `chmod 600`, are the relevant security boundary.
- The local master key ACL was verified to allow only the current Windows
  user, `SYSTEM`, and local Administrators. The inherited
  `CodexSandboxUsers` group entry was removed. No secret value was read or
  logged during the audit.

### Verification

- Full Workplane plugin `npm run check` passed after the UI changes.
- Core server TypeScript `tsc --noEmit` passed after the Project summary
  authorization change.
- The focused low-trust route test is present but its embedded PostgreSQL
  harness is skipped on this Windows host; type checking and live local
  readiness succeeded, but that database-backed regression must be run in a
  supported CI/Linux environment before a release claim.
- A real in-app-browser check confirmed Room-first desktop rendering, the
  collapsed setup panel, Project-scoped Tasks, and a 390px mobile Room with no
  horizontal overflow. The deployed plugin reported `ready` with no error.

### Project access control follow-up

- Project membership/preference data remains separate from access control.
  Core now stores an explicit access mode and Project grants, with `company`
  preserving the existing collaboration default and `restricted` requiring an
  explicit human or Agent grant.
- The authorization service evaluates Project reads, writes, Issue work, and
  Task assignment against those grants. Owner/Admin recovery access remains
  available; an assigned Worker retains only Task-scoped collaboration.
- Project Configuration now exposes an Owner/Admin-only `Project access`
  panel. The live API, migration, Core server/UI type checks, and an in-app
  browser rendering check passed. The database-backed authorization suite is
  still skipped on this Windows host because its embedded PostgreSQL harness
  is unsupported; run that suite in Linux CI before an external release.
- See `94-project-access-control-ko.md` and
  `93-collaboration-deployment-readiness-ko.md` for the operator-facing
  behavior and two-user acceptance test.
