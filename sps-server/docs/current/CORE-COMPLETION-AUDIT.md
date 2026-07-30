# SPS Core Completion Audit

Status: engineering baseline complete for the current development candidate;
not yet a public-release sign-off.

Audit date: 2026-07-30

## Purpose and Scope

This audit answers one narrow product question: can SPS Core serve as a
workflow-neutral, Desktop-first foundation before optional workplane plugins
are built on it?

It does **not** certify public distribution. Human acceptance on two physical
computers and official Windows code signing remain separate release gates.

The machine-readable candidate is
[`../../release/support-matrix.json`](../../release/support-matrix.json):

- SPS Desktop `0.4.83`;
- SPS Core `9bb068c54eb8672459b9e008f6a82bf91a1ed2b5`;
- Plugin API `1`;
- Extension Profile `2.0` as the current contract, with `1.0` retained as a
  temporary compatibility bridge; and
- Windows 10/11 x64 with Tailscale as the supported transport.

## Requirement Matrix

| Product requirement | Result | Evidence |
| --- | --- | --- |
| Core has no built-in Task, Room, role hierarchy, approval, or memory policy. | Pass | [runtime contract](CORE-PLUGIN-RUNTIME-CONTRACT.md) assigns those meanings to plugins; baseline navigation hides legacy workplane pages unless a plugin enables them. |
| A plugin can use safe, generic technical primitives without receiving a Host path, raw command, or provider credential. | Pass | Profile 2.0 exposes only Source metadata/routes, Runtime metadata/dispatch, Run events, Artifacts, and secret references. Grant-backed dispatch derives the local command on the approved Node. |
| Host, Member, Node, Runtime, and Workspace Source have a clear technical boundary. | Pass in automated and isolated Desktop smoke coverage | Only the physical Host Desktop can manage technical invites, Nodes, and local Sources. A remote legacy global-admin row cannot regain Host authority. Members cannot choose a Host Source path. |
| The Desktop and Core can update plugins without silently executing a new release. | Pass | Signed compatibility records are checked before extraction; package/static manifest checks precede staging; Host review is required for enable and migration; a reviewed candidate is pinned by immutable stage ID. |
| New users begin with a neutral starting point, not a hidden company/workplane template. | Pass in live Owner Host smoke | A baseline Workspace creates no Paperclip built-in agent or legacy routine. `Plugin Discovery & Builder` is the only default-enabled extension; bundled Default Memory and Room Workplane remain disabled. Discovery receives only a verified public catalog snapshot and requires the user to register/select an Initial Assistant before it can start a conversation. It can search metadata or draft a plugin brief, but cannot install, enable, update, disable, or remove a plugin. |
| The product is Desktop-first, with browser access blocked from the Owner Host. | Pass in packaged candidate smoke | The current packaged Owner Host starts with a launch-scoped Desktop token; an unheadered loopback request to both `/` and `/api/plugins` returns `403`, while the Electron-token request loads the same Workspace and API. The second Host proof is limited to narrow technical Core routes, never workflow routes. |
| Existing SPS/Paperclip-derived extensions are not silently abandoned. | Pass | Desktop accepts both Extension Profiles `1.0` and `2.0`; new public authoring uses Profile `2.0`. |

## Executed Automated Evidence

All results below were rerun against the current local candidate on
2026-07-30.

| Area | Command or verifier | Result |
| --- | --- | --- |
| Public Plugin SDK | `external/sps-plugin-sdk > npm.cmd test` | 62/62 pass |
| Core Extension Profile schema | Core shared validator focused suite | 20/20 pass |
| Core Plugin SDK Host contract | Core Plugin SDK focused suite | 18/18 pass |
| Discovery & Builder bundle | `sps-plugin-discovery > npm.cmd run check` | Build, manifest verification, and 6/6 tests pass |
| SPS Desktop | `desktop > npm.cmd test` | 184/184 pass |
| SPS Desktop Node | Desktop Node focused suite | 33/33 pass |
| Core technical boundaries | Focused sequential server bundle | 182/182 pass across authorization, Company access, baseline built-ins, identity/invites, Nodes, Workspace Sources, plugin database/route authorization, and legacy instance-admin denial. |
| Type safety and deployable build | `desktop > npm.cmd run prepare:owner-host-runtime` | pass; the current DB, shared contracts, adapter utilities, Codex/Claude adapters, and Core server were rebuilt with TypeScript before deployment. |
| Baseline Workspace and registry capability regression | Core focused services and legacy built-in route | 49/49 pass; fresh baseline Workspace remains empty after server-start reconciliation, legacy built-in routes stay closed in Baseline mode, and `registry.catalog.read` exposes only the verified catalog path to an opting-in plugin |
| Candidate contents | Owner Host runtime verifier | pass |
| Rebuilt Owner Host runtime | `desktop > npm.cmd run smoke:owner-host-runtime` | pass; the current source verifies direct-loopback browser rejection and tokened Desktop Workspace access, baseline Team access, bundled plugins, and Registry author/publish/install/update/rollback lifecycle. |

The complete historical Core suite is intentionally not represented as one
parallel green number: a portion of the old compatibility tests mutates shared
environment state. The focused baseline bundle is the trusted regression
evidence for the current product boundary.

## Security Boundary Fixed During This Audit

Legacy Paperclip-era services previously had several independent ways to read
an `instance_admin` record. In baseline mode that could allow a remote legacy
administrator to appear privileged after request authentication.

The current behavior is fail-closed:

1. Remote SPS sessions and board keys have their legacy global-admin flag
   removed in baseline mode.
2. Authorization, board activity, and access-service fallbacks ignore legacy
   global-admin database rows in baseline mode.
3. The physical Host Desktop proves technical authority with two local,
   launch-scoped headers. This includes the Desktop main-process Member invite
   lifecycle (create, list, and revoke), Registry stage/enable/list actions,
   and Owner Vault backup, not only technical requests sent by the rendered
   Workspace.
4. Electron attaches that proof only to Core technical routes such as Team,
   Nodes, Sources, environments, and plugin lifecycle. It is not attached to
   workflow endpoints such as legacy issues.

Focused tests cover both the valid Host path and the remote-deny path.

## Restricted Project Authorization Regression Fixed

The focused authorization run exposed two defects that a previous grouped run
had hidden:

1. Test cleanup deleted Agents before Projects even though a Project can
   reference its Lead Agent. That caused one assertion failure to cascade into
   foreign-key cleanup failures for the rest of the file.
2. A non-viewer Company member with an explicit `collaborator` grant on a
   restricted Project passed the Project allow-list but was denied again by
   the generic Board mutation fallback.

Cleanup now follows the foreign-key order. Explicit restricted-Project
collaborators may comment on and mutate that Project's issues, while Company
viewers, users without a Project grant, and ordinary members on
Company-access Projects remain denied by the existing boundaries. The
authorization service now passes 39/39 focused assertions and the complete
technical-boundary bundle passes 182/182.

## Documentation Correction Made Here

The previous Korean release baseline still described the candidate as Profile
`1.0` and Discovery `0.1.0`. The support matrix already correctly declared
Profile `2.0` with Profile `1.0` compatibility and Discovery `0.3.0`; the
release baseline is now aligned to that source of truth.

The old Korean release-baseline file was also stored with broken text
encoding. It has been rewritten as a readable UTF-8 Korean summary so it can
again serve as a release-reference document.

## Baseline Discovery Regression Fixed During This Audit

The first live Owner Host smoke exposed two issues that unit tests alone had
not proved together:

1. `companyService.create()` and startup reconciliation still auto-provisioned
   the Paperclip-era paused `Reflection Coach`. This contradicted the SPS
   promise that a new Workspace remains empty until its user registers an
   Initial Assistant.
2. Plugin workers intentionally receive a restricted environment. The default
   Discovery plugin therefore could not see the prepared verified catalog and
   rendered `hasCatalog: false`.

The baseline now skips automatic built-in provisioning both at Workspace
creation and startup. Existing explicit legacy built-ins remain reconcilable
outside that automatic path. Core also adds the narrowly scoped
`registry.catalog.read` capability: it passes only the public verified catalog
path to a plugin that explicitly declares it, never database URLs, provider
keys, lifecycle authority, or general Host secrets.

The audit then closed a remaining direct-API escape hatch: in SPS Baseline,
the legacy built-in-agent routes now return `404` before checking the legacy
experimental flag or reading built-in state. A focused route regression test
keeps that behavior fixed for migrated instances that still retain the old
flag.

The rebuilt Owner Host smoke creates a disposable Workspace and proves all of
the following together: no automatic Assistant, only Discovery activated,
`hasCatalog: true`, no selected Assistant, and a rejected send until an
Initial Assistant exists.

## Release Gates That Remain Intentionally Open

| Gate | Why it remains open | Required evidence before public release |
| --- | --- | --- |
| Two-computer human acceptance | Browser/OAuth, Tailscale routing, Windows permissions, and physical restart behavior must be judged in the installed app. | Host creates invite; distinct Member signs in, joins, gets Node approval, runs a grant-backed route, survives both restarts, and is revoked. |
| Full visible-control pass | Automated coverage cannot judge clarity of disabled, error, loading, cancellation, and recovery UI. | The complete checklist in [CORE-DESKTOP-E2E-AUDIT.md](CORE-DESKTOP-E2E-AUDIT.md) is exercised in a disposable Workspace. |
| First-install performance | The `0.4.83` common installer is 225,047,842 bytes (about 214.6 MB), 40.4% smaller than the prior 360 MB candidate. Codex and Claude remain explicit 150 MB and 79 MB ZIP packs. The predecessor `0.4.82` completed a clean temporary Windows install in 112 seconds and passed isolated sign-in smoke. | Repeat the same first-install measurement on the physical beta laptop with `0.4.83` before public release; hardware and disk conditions still matter. |
| Signed release | Current `0.4.83` installer is intentionally unsigned. | Build with the official code-signing certificate, validate Authenticode, publish matching installer, blockmap, runtime-pack archives, catalog, and release metadata. |
| Fresh installer artifact | The local `0.4.83` installer is frozen from the audited source revision, with verified block map, release manifest with pack hashes, unpacked-runtime verifier, isolated Electron sign-in smoke, and Owner Host smoke. The clean temporary installation evidence remains from the equivalent `0.4.82` pack layout. | Repeat the clean physical-laptop installation with `0.4.83`, sign, and publish matching immutable metadata. |
| SDK checkout hygiene | Two local checkouts of `Powerpunch777/sps-plugin-sdk` currently exist. The Core submodule points to `external/sps-plugin-sdk`, which is the candidate source of truth. | Merge or discard the other dirty checkout deliberately before the next SDK release; do not delete it while its uncommitted changes remain unreviewed. |

## Conclusion

The intended Core boundary is implemented and has repeatable automated and
reconstructed-runtime evidence. The last immutable local installer candidate
is `0.4.83`, with a 214.6 MB common installer and two separately hashed Agent
Runtime pack archives. The audited source is newer than that installer and
must receive a new committed version before distribution. The runtime-pack
implementation is documented in [AGENT-RUNTIME-PACKS.md](AGENT-RUNTIME-PACKS.md).
The remaining release work is source freeze, physical beta-laptop acceptance,
signing, and immutable publication; optional workplanes, access policies,
memory strategies, and development packs remain plugins against Profile 2.0
rather than Core assumptions.
