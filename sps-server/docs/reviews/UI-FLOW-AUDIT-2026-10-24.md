# SPS UI Flow Audit: 2026-10-24

Status: source development audit, not installer or Stable acceptance.

## Scope and Provenance

Reviewed the current Desktop onboarding/connection renderer, baseline Core
Workspace, Host settings, generic Agent registration/settings, Sources, Nodes,
Team access, Plugins/Marketplace, Inbox, Plugin Builder, and Sources & Review.
Retained upstream pages that are not exposed in this baseline were not an
exhaustive manual click target. Plugin workflow ownership and all backend grants
remain unchanged.

Implementation tuple:

- Source: `d4c932361f3c86e45466b88df8564fa65f1c4b23`
- Core: `cde5cd9cc56efa0b6d83e29334d0260f7cd61087`
- SDK: `cfa64ec4f589ea9765661834e1685ef1f2e14453` (unchanged)
- Desktop: `0.4.136`, development-candidate; no new installer or SDK publication.

Follow-up documentation commits do not change the tested runtime tuple.

## Corrected Findings

| Area | Finding | Resolution |
| --- | --- | --- |
| Navigation | Agent management was hidden on Dashboard rather than Settings. | Added Settings > Agents, an overview link, list/error/retry/empty states, existing registration and detail routes. |
| Agent setup | Generic Agent registration used Assistant terminology and corporate placeholder text. Cancel returned an empty Workspace to setup again. | Use Add Agent/Agent name, optional description, blank initial name, and Cancel back to the Agents directory. Keep existing URL aliases and Marketplace Assistant's distinct product name. |
| Agent detail | No recovery path on read failure; form identity could survive a route change. | Retry/back links, Workspace-scoped detail query, Agent-keyed form and coherent breadcrumbs. |
| Workspace | Architecture-contract explanations dominated the user landing screen. | Removed implementation banners, clarified Agent and plugin navigation, simplified section labels, added independent Dashboard/Agent retry controls. |
| Team access | Old shareable invitations and late mutation results could appear after a Workspace switch. | Workspace-keyed lifetime; stale create/revoke/copy results cannot populate the new page. |
| Team access | Opaque identity subjects were displayed as people's names; read failures lacked recovery. | Opaque IDs stay in expandable details; recognizable Host/Member labels and independent read retries. No identity is fabricated. |
| Plugin settings | Cached navigation could preserve plugin A's edited configuration while saving to B. | Key the form by Plugin ID; test cached A-to-B navigation. |
| Plugin settings | Failed saved-config reads could expose defaults as a saveable configuration. | Hide save/test controls until saved configuration can be read; explicit retry, no automatic write. |
| Marketplace | Sessions/selection survived Workspace switches; repeated pending actions and failed sends were confusing. | Workspace-keyed panel, unmount guards, action lock and send-failure draft preservation. Search remains read-only; no automatic install. |
| Nodes | Failed access query appeared to be checking forever. | Explicit access error and retry instead of a loading state. |
| Inbox | Enter from a nested action button was intercepted by the list shortcut. | Handle shortcuts only when the list itself is the event target. |
| Builder | Conversation navigation erased text and attachments. | Per-conversation in-memory drafts; preserve the scratch draft and adopt it when a conversation is created. Only acknowledged sent content is cleared. |
| Builder | Pending attachment reads could race sends/project adoption or be discarded by panel toggles. | Lock send/new/conversation adoption while decoding; scope reads to the Workspace; panel changes do not discard the read. |
| Builder | Narrow layouts hid history; a first implementation displayed history in a zero-width grid track. | Add an accessible conversation-list toggle and explicitly span both grid tracks. Assert actual widths, not just CSS display. |
| Builder | Agent-settings navigation silently discarded drafts. | Require explicit discard confirmation for this new navigation action. Workspace changes remount the data hook and do not reuse the previous Workspace's data. |
| Registry | Late Source inspection could replace another Source's catalog and stage under mismatched provenance. | Revision and Source binding on inspection, rendered actions and staging. Reject stale or altered buttons. |
| Registry | Pending Host review was reported as ready and offered a duplicate apply action. | Display awaiting-review state and Settings guidance; suppress repeat apply. No nonexistent settings-opening bridge is invented. |
| Registry | One startup RPC failure left unrelated panels loading indefinitely. | Independent panel loading, generic recoverable errors and existing Refresh actions. |
| Desktop connection | A stopped Host looked like an indefinitely starting Host with no recovery actions. | Distinguish starting/stopped, show status refresh/account recovery, and offer the existing restart action only where supported. Private-team restart restrictions remain intact. |
| Dialog feedback | Cancelled restore/Source dialogs claimed progress or success. | Neutral cancellation results; Host creation completion appears only after activation acknowledges success. |

## User Flow and Interaction Inventory

Modes: **native** means the existing DEV app was opened/observed through Windows
UI automation; **isolated Electron** means a separate temporary Host/profile with
mock Identity and no paid provider; **component/contract** means mocked focused
interaction tests. These modes are not interchangeable with physical Member or
production Google OAuth acceptance.

| Surface | Exercised/reviewed | Deliberately not performed on the user's Vault |
| --- | --- | --- |
| Sign-in/server choice | Renderer recovery/cancel contracts; isolated signed-in Host creation, choice/join layout. | Sign out, switch real Google account, restore/reset live data. |
| Sidebar/Host overview | Native navigation, settings cards, directory discoverability; focused route/sidebar tests. | Change live Workspace ownership. |
| Agents | Native directory; isolated real create form for two independent folders; cancel registration; detail save component tests. | Create or alter real user Agents or CLI credentials. |
| Sources | Native empty state and Refresh; existing management component suite. | Register/share/remove real Host folders. |
| Nodes | Native empty state; access failure/retry tests. | Approve/revoke a real computer, change runner grants. |
| Team access | Native read-only page; create/copy/switch/stale-response and read-retry component tests. | Create/share real invitations or remove real members. |
| Plugins/Marketplace | Native installed/catalog views and secure-review entry; configuration/session/Workspace isolation tests. | Enable/disable/uninstall user plugins or make a paid Assistant request. |
| Inbox/Dashboard | Generic widgets/layout/fallback through isolated Electron; nested keyboard-action tests. | Archive real reports. |
| Builder | Text/attachment draft navigation, delayed-file lock, discard cancellation, narrow history geometry, exact-run stop/process exit. | Run a paid real CLI authoring request or alter the user's Lead. |
| Review/Preview | Native connected-project/source/review empty states; Registry race/pending/error fixtures; Preview acceptance recorded below. | Stage/apply an official package to the user's production Host. |

No claim is made that every destructive button was clicked on real data.

## Verification

- Desktop unit/contracts: **475/475**; `npm test`.
- Plugin Builder: **45/45**, bundled UI build and manifest; `npm run check`.
- Core UI/navigation/state regression: **100/100**, 12 focused files.
- Additional existing Source/Server settings component suites: **3/3**.
- Core UI typecheck and production build: passed. Large-chunk warnings remain.
- Workspace source Electron: passed, including cleanup, on the implementation
  tuple above. Includes actual draft/attachment retention, deferred-read locks,
  discard cancellation, 540px history geometry, 1024/1280/1440 layouts, scoped
  usage/history and confirmed process termination with no provider.
- Preview source Electron: passed including cleanup. Real Core registration,
  folder checks, draft/attachment preservation, failed-validation feedback,
  isolated interactive Preview, Member/mobile/error fixtures, verified package
  archive, Preview-only crash and live production Workspace checks passed.
- Host plugin lifecycle source Electron: passed including cleanup. Explicit
  install, enable, disable, re-enable, uninstall-cancel and uninstall-confirm
  passed on an isolated Host; the deterministic Marketplace Assistant flow did
  not change plugin lifecycle. No paid provider or real user plugin was used.
- Token policy gate: **not green**. Existing repository totals fell from
  79 color / 43 arbitrary-size / 2 raw-font findings to **79 / 36 / 1** by replacing
  touched Marketplace/Team size literals with existing tokens. No broad token
  allowlist was added.

Private development artifacts are under ignored `desktop/dist/`:

- `ui-audit-desktop-final-tuple.log`, `ui-audit-builder-final.log`
- `ui-audit-core-accepted.log`, `ui-audit-core-management-extra.log`
- `ui-audit-core-typecheck-accepted.log`, `ui-audit-core-build-accepted.log`
- `ui-audit-token-gates-final.log`, `ui-audit-workspace-serialized.log`
- `ui-audit-preview.log`, `ui-audit-lifecycle.log`, `ui-audit-final-tuple/` screenshots

Do not upload raw native captures, account details, private local paths or these
development logs as public release evidence.

### Reproduction

Run UI builds before Electron suites, and run each Electron suite through exit
and cleanup before starting another. In `sps-server/desktop`:

```powershell
npm test
$env:SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS = '120000'
$env:SPS_DESKTOP_E2E_SOURCE = '1'
npm run test:e2e:workspace-surfaces
npm run test:e2e:plugin-preview
npm run test:e2e:host-plugin-lifecycle
```

Core UI focused files: `App`, `CompanySettingsSidebar`, `Sidebar`,
`SpsMarketplacePanel`, `SpsCoreAgents`, `SpsCoreAssistantDetail`,
`SpsCoreHostSettings`, `SpsCoreTeamAccess`, `SpsCoreWorkspaceHome`, `SpsNodes`,
`SpsWorkspaceInbox`, and `PluginSettings`. Also run the existing
`SpsCoreWorkspaceSources` and `SpsCoreServerSettings` tests. Their test suffixes
are `.test.tsx`, except `SpsNodes.test.ts`.

### Failed Attempts Retained

- `ui-audit-workspace-e2e.log`: the harness still expected the renamed fallback
  text; corrected selector, not a product fallback failure.
- `ui-audit-desktop-final.log`: an exact-source activation regex needed to
  include the new completion notice. Runtime deferred-activation coverage was
  added; the accepted full run passes.
- `ui-audit-workspace-final-tuple.log`: one full-page settings navigation returned
  HTTP 500 while a Core production UI build overlapped the source app test.
  Cause is not conclusively established. The same runtime tuple passed in
  `ui-audit-workspace-serialized.log` with builds separated; retain the failure,
  do not relabel it as a pass or claim a server defect was fixed.

## Remaining Work and Limits

- Draft retention is intentionally memory-only while Builder stays mounted.
  Agent-management navigation warns before discarding; leaving by another
  route, closing the page, or switching Workspace is not durable draft storage.
- Sources & Review still combines developer connection, Preview, Registry and
  installation review in one technical window. A later view-level information
  architecture pass can reduce its density without hiding permissions/provenance.
- Real Member/restricted-role visual acceptance, production Google sign-in,
  real Tailscale/2-PC flows and paid Lead/Worker authoring were not rerun here.
- No full Linux/Core regression, fresh dependency audit, signing, installer
  replacement, public SDK tag, or Stable publication is certified by this audit.
- Existing token-policy violations and large frontend chunks remain separate
  cleanup work. The transient source-navigation 500 above needs investigation if
  it recurs outside overlapping development builds.

Luna handled bounded navigation/state/Registry edits and review. The parent
integrated and corrected the draft/file/mobile edge cases and ran acceptance.
Fast remains a user-side setting, not a delegation-tool guarantee.
