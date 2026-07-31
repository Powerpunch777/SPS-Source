# SPS Plugin Platform 0.4.96 Evidence

Date: 2026-08-01 (Asia/Seoul)

Status: plugin platform phases 1-7 passed; phase 8 physical two-computer beta
acceptance remains open.

## Immutable candidate

| Item | Value |
| --- | --- |
| Desktop | `0.4.96` |
| Installer | `SPS-Desktop-Setup-0.4.96.exe` |
| Installer size | `337426309` bytes |
| Installer SHA-256 | `f1a0944a82f29fa79cfc41339b4140865640bc7ad8e25e68b28822b878ec2f2f` |
| Core revision | `6e1f60c54c24058ceb168a446d42532305ccd099` |
| Public Plugin SDK | `0.11.0` |
| SDK revision | `f24d9b236a8bdaee9441f37694b7e4298aa7e6c2` |
| Plugin Builder | `0.4.0` |
| Team Workplane | `0.3.91` |
| Default Memory | `0.1.0` |

The generated `sps-release-manifest.json` binds the installer, update metadata,
blockmap, Core, SDK, bundled extensions, and two Agent Runtime packs to this
candidate.

## Contract and regression evidence

| Surface | Result |
| --- | --- |
| Public Plugin SDK | `145/145` pass, including portable Worker, UI Data Provider, Test Kit, dependency, Registry, package, and external-consumer checks |
| SPS Core focused runtime | DB and Marketplace Node policy `7` pass with `2` platform skips; DB and Server typechecks pass |
| SPS Desktop | `248/248` pass |
| SPS Desktop Node | `37/37` pass |
| Plugin Builder | build, `9/9` authoring ledger tests, and manifest verification pass |
| Team Workplane | complete Room, Task, Dashboard, Inbox, Worker report, memory, UTF-8, and manifest suite pass |
| Default Memory | lifecycle contract verification pass |
| Public Worker Host | external SDK bundle starts in the real Core Worker Manager; Runtime and UI `getData -> state` round trips pass; shutdown exits with code `0` |

## Package gates

- Packaged Owner Host runtime verification passed.
- Packaged Marketplace MCP stdio runtime smoke passed.
- Windows PostgreSQL Unicode-path compatibility is present in the packaged
  runtime and covered by the runtime verifier.
- Plugin Builder's packaged Worker uses the public SDK and exposes the
  `plugin-builder-workspace` UI Data Provider without a private Core path.
- New plugin UI uses `@sonparkserver/plugin-sdk/ui/bridge`; Core rewrites that
  public bridge at runtime and retains the old UI specifier only as a legacy
  compatibility alias.
- The Windows installer uses a Deflate ZIP application payload for predictable
  extraction time and keeps differential release metadata in SPS's explicit
  `write-update-metadata` step.
- The installer is an unsigned development candidate. Public release still
  requires the official signing workflow.

## Packaged Electron E2E

The same final `win-unpacked` candidate passed:

1. Isolated SPS sign-in bootstrap.
2. New Host, neutral Workspace, Plugin Builder, Team Workplane install and
   enable, Workspace Shell selection, Dashboard, Inbox, disable, and neutral
   fallback.
3. External public-SDK plugin project creation, three authoring gates, isolated
   Preview, Host/Member and desktop/mobile/error fixtures, package creation,
   Preview-only renderer crash, redacted diagnostics, and live production
   Workspace.
4. Marketplace Assistant read-only search with zero lifecycle mutation, then
   Host-only `install -> enable -> disable -> re-enable -> uninstall cancel ->
   uninstall confirm` through real UI controls.

## Remaining phase 8 gate

The automated packaged-app evidence uses isolated instances on one Windows PC.
The exact installer completed a real interactive-user installation on the Host
development PC in about `97` seconds. A remote SSH or scheduled-task launch is
not accepted as physical GUI evidence because it can run outside the user's
interactive Windows desktop.

Before private beta acceptance is closed, complete a direct interactive-user
installation on the separate Member computer and execute
`BETA-ACCEPTANCE-RUNBOOK-ko.md`. Record invitation, Node approval, allowed
Runtime, Host Source access, removal and grant revocation, restart recovery,
and update behavior. This physical gate is intentionally not inferred from
unit tests or one-machine E2E.
